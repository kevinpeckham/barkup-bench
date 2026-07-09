/**
 * Study O scored runs (docs/BRIEF-O.md): position-annotated view
 * policies (stateless and full-history) over the Study K corpus.
 * Session is the resume unit, exactly as run-study-k/m.ts.
 *
 *   bun run scripts/run-study-o.ts [--models a,b] [--concurrency 3]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SessionCorpus, SessionTask } from "../src/corpus/sessions.js";
import { SESSION_STEPS } from "../src/corpus/sessions.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import type { SessionPolicy } from "../src/harness/session-runner.js";
import { POLICY_CONDITION, runSession } from "../src/harness/session-runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];
const POLICIES: SessionPolicy[] = ["statelessPos", "viewPos"];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(
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
	const outPath = `results/raw/studyo-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });

	const queue: { task: SessionTask; policy: SessionPolicy }[] = [];
	for (const task of corpus.sessions) {
		for (const policy of POLICIES) {
			const done = sessionStepCount(
				outPath,
				task,
				POLICY_CONDITION[policy],
				model,
			);
			if (done === SESSION_STEPS) continue;
			if (done > 0) {
				throw new Error(
					`Partial session ${task.id} × ${policy} × ${model} (${done}/${SESSION_STEPS} steps) — strip its records before resuming.`,
				);
			}
			queue.push({ task, policy });
		}
	}
	console.log(`\n=== ${model} → ${outPath} (${queue.length} sessions to run)`);

	let cursor = 0;
	let passed = 0;
	let steps = 0;
	let tokens = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			const label = `${item.task.id} × ${POLICY_CONDITION[item.policy]}`;
			try {
				const records = await runSession(item.task, item.policy, model);
				for (const record of records) {
					appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				}
				const ok = records.filter((r) => r.success).length;
				passed += ok;
				steps += records.length;
				tokens += records.reduce(
					(s, r) => s + r.totalInputTokens + r.totalOutputTokens,
					0,
				);
				console.log(`  ${label}: ${ok}/${records.length} steps pass`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(`  ${label}: ERROR ${message} (session not recorded)`);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
	console.log(
		`=== done: ${passed}/${steps} steps passed, ${(tokens / 1e6).toFixed(2)}M tokens`,
	);
}
console.log("\nStudy O runs complete.");
