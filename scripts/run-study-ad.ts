/**
 * Study AD scored runs (docs/BRIEF-AD.md): the Opus confirmation.
 * This runner covers the arms without a registered runner of their
 * own — AD-F@size (condition F, xxxl bucket), AD-search (N-search),
 * AD-fanout (Q-view / Q-full), and AD-sessions (view / cannedSys /
 * stateless). AD-F runs via run-matrix.ts (--conditions F) and
 * AD-views via run-study-j.ts, both with --models. All conditions
 * are reused verbatim from their source studies.
 *
 *   bun run scripts/run-study-ad.ts [--models a,b] [--concurrency 3]
 *                                   [--arms size,search,fanout,sessions]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { conditionF } from "../src/conditions/f.js";
import { applyShipped, conditionF2 } from "../src/conditions/f2.js";
import type { Condition, PatchCondition } from "../src/conditions/types.js";
import { serializeView, VIEW_RULES } from "../src/conditions/views.js";
import type { FanoutTask } from "../src/corpus/fanout.js";
import type { SessionCorpus, SessionTask } from "../src/corpus/sessions.js";
import { SESSION_STEPS } from "../src/corpus/sessions.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys, runTask } from "../src/harness/runner.js";
import { runSearchTask } from "../src/harness/search-runner.js";
import type { SessionPolicy } from "../src/harness/session-runner.js";
import { POLICY_CONDITION, runSession } from "../src/harness/session-runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = ["anthropic/claude-opus-4.8"];
const SESSION_POLICIES: SessionPolicy[] = ["view", "cannedSys", "stateless"];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const arms = new Set(arg("arms", "size,search,fanout,sessions").split(","));

/** Study H's F cell, verbatim (run-size-extension.ts). */
const conditionFShipped: Condition = { ...conditionF2, id: "F" };

/** Study Q's oracle-view cell, verbatim (run-study-q.ts). */
function makeQViewCondition(task: FanoutTask): PatchCondition {
	const focus = [task.containerId, ...task.targetIds];
	return {
		...conditionF,
		id: "Q-view",
		systemPrompt: conditionF.systemPrompt + VIEW_RULES,
		serialize: (tree) => serializeView(tree, focus, "minimal"),
		applyArtifact: applyShipped,
	};
}

/** Study Q's full-tree cell, verbatim (run-study-q.ts). */
const qFull: PatchCondition = {
	...conditionF,
	id: "Q-full",
	applyArtifact: applyShipped,
};

interface TaskCell {
	task: TransformationTask;
	condition: string;
	run: () => Promise<TaskRunRecord>;
}

const sizeTasks = (
	JSON.parse(readFileSync("corpus/size-extension.json", "utf8")) as Corpus
).tasks as TransformationTask[];
const groundedTasks = (
	JSON.parse(readFileSync("corpus/grounded.json", "utf8")) as Corpus
).tasks as TransformationTask[];
const fanoutCorpus = JSON.parse(readFileSync("corpus/fanout.json", "utf8")) as {
	tasks: FanoutTask[];
};
const sessionCorpus = JSON.parse(
	readFileSync("corpus/sessions.json", "utf8"),
) as SessionCorpus;

function sessionStepCount(
	outPath: string,
	task: SessionTask,
	condition: string,
	model: string,
): number {
	if (!existsSync(outPath)) return 0;
	let count = 0;
	for (const line of readFileSync(outPath, "utf8").split("\n")) {
		if (line.trim() === "") continue;
		const r = JSON.parse(line) as TaskRunRecord;
		if (
			r.taskId.startsWith(`${task.id}:`) &&
			r.condition === condition &&
			r.model === model
		) {
			count += 1;
		}
	}
	return count;
}

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");

	// ---- Task-level arms: F@size, N-search, Q-view/Q-full ----
	const outPath = `results/raw/studyad-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: TaskCell[] = [];
	if (arms.has("size")) {
		for (const task of sizeTasks.filter((t) => t.bucket === "xxxl")) {
			if (done.has(`${task.id}::F::${model}::parity`)) continue;
			queue.push({
				task,
				condition: "F",
				run: () => runTask(task, conditionFShipped, model, "parity"),
			});
		}
	}
	if (arms.has("search")) {
		for (const task of groundedTasks) {
			if (done.has(`${task.id}::N-search::${model}::parity`)) continue;
			queue.push({
				task,
				condition: "N-search",
				run: () => runSearchTask(task, model),
			});
		}
	}
	if (arms.has("fanout")) {
		for (const fanTask of fanoutCorpus.tasks) {
			const task = fanTask as unknown as TransformationTask;
			if (!done.has(`${fanTask.id}::Q-view::${model}::parity`)) {
				queue.push({
					task,
					condition: "Q-view",
					run: () =>
						runTask(task, makeQViewCondition(fanTask), model, "parity"),
				});
			}
			if (!done.has(`${fanTask.id}::Q-full::${model}::parity`)) {
				queue.push({
					task,
					condition: "Q-full",
					run: () => runTask(task, qFull, model, "parity"),
				});
			}
		}
	}

	console.log(
		`\n=== ${model} → ${outPath} (${queue.length} task cells to run, ${done.size} done)`,
	);
	const records: TaskRunRecord[] = [];
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			const label = `${item.task.id} × ${item.condition}`;
			try {
				const record = await item.run();
				records.push(record);
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				console.log(
					`  ${label}: ${record.success ? "PASS" : "fail"} (rounds=${record.rounds}, tokens=${record.totalInputTokens}+${record.totalOutputTokens})`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(`  ${label}: ERROR ${message} (not recorded — retryable)`);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
	const ok = records.filter((r) => r.success).length;
	console.log(`=== task cells done: ${ok}/${records.length} passed`);

	// ---- Session arm: view / cannedSys / stateless ----
	if (arms.has("sessions")) {
		const sessionsPath = `results/raw/studyad-sessions-${slug}.jsonl`;
		mkdirSync(dirname(sessionsPath), { recursive: true });

		const sessionQueue: { task: SessionTask; policy: SessionPolicy }[] = [];
		for (const task of sessionCorpus.sessions) {
			for (const policy of SESSION_POLICIES) {
				const doneSteps = sessionStepCount(
					sessionsPath,
					task,
					POLICY_CONDITION[policy],
					model,
				);
				if (doneSteps === SESSION_STEPS) continue;
				if (doneSteps > 0) {
					throw new Error(
						`Partial session ${task.id} × ${policy} × ${model} (${doneSteps}/${SESSION_STEPS} steps) — strip its records before resuming.`,
					);
				}
				sessionQueue.push({ task, policy });
			}
		}
		console.log(
			`\n=== ${model} → ${sessionsPath} (${sessionQueue.length} sessions to run)`,
		);

		let sessionCursor = 0;
		let passed = 0;
		let steps = 0;
		let tokens = 0;
		const sessionWorker = async (): Promise<void> => {
			while (sessionCursor < sessionQueue.length) {
				const item = sessionQueue[
					sessionCursor
				] as (typeof sessionQueue)[number];
				sessionCursor += 1;
				const label = `${item.task.id} × ${POLICY_CONDITION[item.policy]}`;
				try {
					const stepRecords = await runSession(item.task, item.policy, model);
					for (const record of stepRecords) {
						appendFileSync(sessionsPath, `${JSON.stringify(record)}\n`);
					}
					const okSteps = stepRecords.filter((r) => r.success).length;
					passed += okSteps;
					steps += stepRecords.length;
					tokens += stepRecords.reduce(
						(s, r) => s + r.totalInputTokens + r.totalOutputTokens,
						0,
					);
					console.log(
						`  ${label}: ${okSteps}/${stepRecords.length} steps pass`,
					);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					console.log(`  ${label}: ERROR ${message} (session not recorded)`);
				}
			}
		};
		await Promise.all(
			Array.from(
				{ length: Math.min(concurrency, sessionQueue.length) },
				sessionWorker,
			),
		);
		console.log(
			`=== sessions done: ${passed}/${steps} steps passed, ${(tokens / 1e6).toFixed(2)}M tokens`,
		);
	}
}
console.log("\nStudy AD runs complete.");
