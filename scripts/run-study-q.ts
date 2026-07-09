/**
 * Study Q scored runs (docs/BRIEF-Q.md): Q-view / Q-full / Q-search
 * over the fan-out corpus (id-free multi-target instructions).
 *
 *   bun run scripts/run-study-q.ts [--models a,b] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { conditionF } from "../src/conditions/f.js";
import { applyShipped } from "../src/conditions/f2.js";
import type { PatchCondition } from "../src/conditions/types.js";
import { serializeView, VIEW_RULES } from "../src/conditions/views.js";
import type { FanoutTask } from "../src/corpus/fanout.js";
import type { TransformationTask } from "../src/corpus/tasks.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys, runTask } from "../src/harness/runner.js";
import { runSearchTask } from "../src/harness/search-runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];
const CONDITIONS = ["Q-view", "Q-full", "Q-search"] as const;

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(readFileSync("corpus/fanout.json", "utf8")) as {
	tasks: FanoutTask[];
};

/** Q-view: the retrieval oracle — minimal view on container + targets. */
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

const qFull: PatchCondition = {
	...conditionF,
	id: "Q-full",
	applyArtifact: applyShipped,
};

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyq-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: { task: FanoutTask; condition: string }[] = [];
	for (const task of corpus.tasks) {
		for (const condition of CONDITIONS) {
			if (!done.has(`${task.id}::${condition}::${model}::parity`)) {
				queue.push({ task, condition });
			}
		}
	}
	console.log(
		`\n=== ${model} → ${outPath} (${queue.length} to run, ${done.size} done)`,
	);

	const records: TaskRunRecord[] = [];
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			const label = `${item.task.id} × ${item.condition}`;
			// FanoutTask carries extra fields; the runners use only the
			// TransformationTask surface (tree/instruction/expected/ids).
			const task = item.task as unknown as TransformationTask;
			try {
				let record: TaskRunRecord;
				if (item.condition === "Q-search") {
					record = await runSearchTask(task, model, "Q-search");
				} else {
					const condition =
						item.condition === "Q-view" ? makeQViewCondition(item.task) : qFull;
					record = await runTask(task, condition, model, "parity");
				}
				records.push(record);
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				console.log(
					`  ${label}: ${record.success ? "PASS" : "fail"} (targets=${item.task.targetIds.length}, rounds=${record.rounds}, tokens=${record.totalInputTokens}+${record.totalOutputTokens})`,
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
	console.log(`=== done: ${ok}/${records.length} passed`);
}
console.log("\nStudy Q runs complete.");
