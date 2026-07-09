/**
 * Study R scored runs (docs/BRIEF-R.md): four prompt-intervention arms
 * plus the decomposition pipeline over the fan-out corpus.
 *
 *   bun run scripts/run-study-r.ts [--models a,b] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { makeRCondition, type RArm } from "../src/conditions/fanout-r.js";
import type { FanoutTask } from "../src/corpus/fanout.js";
import type { TransformationTask } from "../src/corpus/tasks.js";
import { runDecompTask } from "../src/harness/decomp-runner.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys, runTask } from "../src/harness/runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];
const ARMS: { condition: string; arm: RArm | null }[] = [
	{ condition: "R-exV", arm: "exV" },
	{ condition: "R-exF", arm: "exF" },
	{ condition: "R-ckV", arm: "ckV" },
	{ condition: "R-ckF", arm: "ckF" },
	{ condition: "R-decomp", arm: null },
];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(readFileSync("corpus/fanout.json", "utf8")) as {
	tasks: FanoutTask[];
};

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyr-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: { task: FanoutTask; condition: string; arm: RArm | null }[] = [];
	for (const task of corpus.tasks) {
		for (const { condition, arm } of ARMS) {
			if (!done.has(`${task.id}::${condition}::${model}::parity`)) {
				queue.push({ task, condition, arm });
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
			try {
				let record: TaskRunRecord;
				if (item.arm === null) {
					record = await runDecompTask(item.task, model);
				} else {
					record = await runTask(
						item.task as unknown as TransformationTask,
						makeRCondition(item.arm, item.task),
						model,
						"parity",
					);
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
console.log("\nStudy R runs complete.");
