/**
 * Study AM scored runs (docs/BRIEF-AM.md): consolidation-on-notice
 * over the dedicated cap-edge corpus. Both arms on every task — the
 * notice string is the only variable. 40 tasks × 2 arms × 3 models =
 * 240 cells. Resumable JSONL keyed (task, condition, model).
 *
 *   bun run scripts/run-study-am.ts [--models a,b,c] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { IntegrityTask } from "../src/corpus/memoscale.js";
import type { MemoIntegrityArm } from "../src/harness/memoscale-runner.js";
import { runMemoIntegrityTask } from "../src/harness/memoscale-runner.js";
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
const corpus = JSON.parse(
	readFileSync("corpus/memo-consolidation.json", "utf8"),
) as { integrity: IntegrityTask[] };

interface Cell {
	label: string;
	run: () => Promise<TaskRunRecord>;
}

const ARMS: MemoIntegrityArm[] = ["AM-control", "AM-invite"];

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyam-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: Cell[] = [];
	for (const task of corpus.integrity) {
		for (const arm of ARMS) {
			const condition = `${arm}-k${task.kLevel}`;
			if (done.has(`${task.id}::${condition}::${model}::parity`)) continue;
			queue.push({
				label: `${task.id} ${arm}`,
				run: () => runMemoIntegrityTask(task, model, arm),
			});
		}
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
				const consolidation = (
					record.detail as { consolidation?: { outcome?: string } }
				).consolidation;
				console.log(
					`  ${cell.label}: ${String(consolidation?.outcome)} calls=${String(record.detail?.toolCalls)} raw=${String(record.detail?.rawLength)} (tokens=${record.totalInputTokens}+${record.totalOutputTokens})`,
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
console.log("\nStudy AM runs complete.");
