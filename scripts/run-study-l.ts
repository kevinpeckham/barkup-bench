/**
 * Study L scored runs (docs/BRIEF-L.md): LG-full / LG-lex / LG-nav
 * over the grounded corpus (id-free instructions).
 *
 *   bun run scripts/run-study-l.ts [--models a,b] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
	makeFullCondition,
	makeLexCondition,
} from "../src/conditions/grounded.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import { runNavTask } from "../src/harness/nav-runner.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys, runTask } from "../src/harness/runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];
const CONDITIONS = ["LG-full", "LG-lex", "LG-nav"] as const;

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(
	readFileSync("corpus/grounded.json", "utf8"),
) as Corpus;
const tasks = corpus.tasks as TransformationTask[];

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyl-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: { task: TransformationTask; condition: string }[] = [];
	for (const task of tasks) {
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
			try {
				let record: TaskRunRecord;
				if (item.condition === "LG-nav") {
					record = await runNavTask(item.task, model);
				} else {
					const condition =
						item.condition === "LG-full"
							? makeFullCondition()
							: makeLexCondition(item.task.instruction);
					record = await runTask(item.task, condition, model, "parity");
				}
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
	console.log(`=== done: ${ok}/${records.length} passed`);
}
console.log("\nStudy L runs complete.");
