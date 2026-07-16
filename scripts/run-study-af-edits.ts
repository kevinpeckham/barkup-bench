/**
 * Study AF editing runs (docs/BRIEF-AF.md): 30 tasks × 3 arms
 * (AF-control / AF-memo-restate / AF-view-restate) per editor model,
 * three editors. Resumable JSONL keyed (task, arm, model).
 *
 *   bun run scripts/run-study-af-edits.ts [--models a,b,c] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RewriteTask } from "../src/corpus/rewrite.js";
import type { RewriteArm } from "../src/harness/rewrite-runner.js";
import { AF_ARMS, runRewriteTask } from "../src/harness/rewrite-runner.js";
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
const corpus = JSON.parse(readFileSync("corpus/rewrite.json", "utf8")) as {
	tasks: RewriteTask[];
};

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyaf-edits-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: { task: RewriteTask; arm: RewriteArm }[] = [];
	for (const task of corpus.tasks) {
		for (const arm of AF_ARMS) {
			if (!done.has(`${task.id}::${arm}::${model}::parity`)) {
				queue.push({ task, arm });
			}
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
				const record = await runRewriteTask(item.task, item.arm, model);
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				total += 1;
				if (record.success) ok += 1;
				const compliant =
					record.detail?.goalCompliant === undefined
						? ""
						: record.detail.goalCompliant
							? " GOAL✓"
							: " GOAL✗";
				console.log(
					`  ${item.task.id} × ${item.arm}: ${record.success ? "valid" : "LAYER1-FAIL"}${compliant} (rounds=${record.rounds})`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(`  ${item.task.id} × ${item.arm}: ERROR ${message}`);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
	console.log(`=== done: ${ok}/${total} mechanically valid`);
}
console.log("\nStudy AF edits complete.");
