/**
 * Study AH scored runs (docs/BRIEF-AH.md): 60 read cells + 30
 * integrity cells per model, three models. Resumable JSONL keyed
 * (task, condition, model).
 *
 *   bun run scripts/run-study-ah.ts [--models a,b,c] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { IntegrityTask, MemoScaleTask } from "../src/corpus/memoscale.js";
import {
	runMemoIntegrityTask,
	runMemoReadTask,
} from "../src/harness/memoscale-runner.js";
import type { TaskRunRecord } from "../src/harness/records.js";
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
const corpus = JSON.parse(readFileSync("corpus/memo-scale.json", "utf8")) as {
	tasks: MemoScaleTask[];
	integrity: IntegrityTask[];
};

interface Cell {
	label: string;
	run: () => Promise<TaskRunRecord>;
}

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyah-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: Cell[] = [];
	for (const task of corpus.tasks) {
		const condition = `AH-${task.kind}-n${task.nLevel}`;
		if (done.has(`${task.id}::${condition}::${model}::parity`)) continue;
		queue.push({
			label: `${task.id}`,
			run: () => runMemoReadTask(task, model),
		});
	}
	for (const task of corpus.integrity) {
		const condition = `AH-integrity-k${task.kLevel}`;
		if (done.has(`${task.id}::${condition}::${model}::parity`)) continue;
		queue.push({
			label: `${task.id}`,
			run: () => runMemoIntegrityTask(task, model),
		});
	}

	console.log(
		`\n=== ${model} → ${outPath} (${queue.length} to run, ${done.size} done)`,
	);
	let ok = 0;
	let total = 0;
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const cell = queue[cursor] as Cell;
			cursor += 1;
			try {
				const record = await cell.run();
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				total += 1;
				if (record.success) ok += 1;
				console.log(
					`  ${cell.label}: ${String(record.detail?.outcome)} (tokens=${record.totalInputTokens}+${record.totalOutputTokens})`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(
					`  ${cell.label}: ERROR ${message} (not recorded — retryable)`,
				);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
	console.log(`=== done: ${ok}/${total} passed their cell criterion`);
}
console.log("\nStudy AH runs complete.");
