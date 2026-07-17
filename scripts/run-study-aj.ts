/**
 * Study AJ scored runs (docs/BRIEF-AJ.md): 45 seeded-failure cells ×
 * 3 feedback arms × 3 models. Resumable JSONL keyed (task, arm,
 * model).
 *
 *   bun run scripts/run-study-aj.ts [--models a,b,c] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SeededTask } from "../src/corpus/seeded.js";
import type { CorrectionArm } from "../src/harness/correction-runner.js";
import {
	CORRECTION_ARMS,
	runCorrectionCell,
} from "../src/harness/correction-runner.js";
import { loadExistingKeys } from "../src/harness/runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(
	readFileSync("corpus/seeded-failures.json", "utf8"),
) as { tasks: SeededTask[] };

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyaj-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: { task: SeededTask; arm: CorrectionArm }[] = [];
	for (const task of corpus.tasks) {
		for (const arm of CORRECTION_ARMS) {
			if (done.has(`${task.id}::${arm}::${model}::parity`)) continue;
			queue.push({ task, arm });
		}
	}
	console.log(
		`\n=== ${model} → ${outPath} (${queue.length} to run, ${done.size} done)`,
	);

	let cursor = 0;
	let ok = 0;
	let total = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			try {
				const record = await runCorrectionCell(item.task, item.arm, model);
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				total += 1;
				if (record.success) ok += 1;
				console.log(
					`  ${item.task.id} × ${item.arm}: ${String(record.detail?.outcome)}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(
					`  ${item.task.id} × ${item.arm}: ERROR ${message} (not recorded — retryable)`,
				);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
	console.log(`=== done: ${ok}/${total} recovered`);
}
console.log("\nStudy AJ runs complete.");
