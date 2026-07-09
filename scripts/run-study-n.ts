/**
 * Study N scored runs (docs/BRIEF-N.md): N-search / N-embed / N-ground2
 * over the grounded corpus, plus the N-ground2x cross cell (gemini
 * grounds, sonnet patches; recorded under the patcher's file).
 *
 *   bun run scripts/run-study-n.ts [--models a,b] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { makeEmbedCondition } from "../src/conditions/grounded-n.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import { runGround2Task } from "../src/harness/ground2-runner.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys, runTask } from "../src/harness/runner.js";
import { runSearchTask } from "../src/harness/search-runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const SONNET = "anthropic/claude-sonnet-4.5";
const GEMINI = "google/gemini-3.5-flash";
const DEFAULT_MODELS = [SONNET, GEMINI];
const CONDITIONS = ["N-search", "N-embed", "N-ground2"] as const;

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
const embedFocus = JSON.parse(
	readFileSync("corpus/embed-focus.json", "utf8"),
) as { model: string; k: number; focus: Record<string, string[]> };

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyn-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: { task: TransformationTask; condition: string }[] = [];
	for (const task of tasks) {
		for (const condition of CONDITIONS) {
			if (!done.has(`${task.id}::${condition}::${model}::parity`)) {
				queue.push({ task, condition });
			}
		}
		// The cross cell lives in the patcher's (sonnet's) file.
		if (
			model === SONNET &&
			!done.has(`${task.id}::N-ground2x::${model}::parity`)
		) {
			queue.push({ task, condition: "N-ground2x" });
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
				if (item.condition === "N-search") {
					record = await runSearchTask(item.task, model);
				} else if (item.condition === "N-embed") {
					const ids = embedFocus.focus[item.task.id];
					if (!ids) throw new Error(`no embed focus for ${item.task.id}`);
					record = await runTask(
						item.task,
						makeEmbedCondition(ids),
						model,
						"parity",
					);
				} else if (item.condition === "N-ground2") {
					record = await runGround2Task(item.task, model, model, "N-ground2");
				} else {
					record = await runGround2Task(
						item.task,
						GEMINI,
						SONNET,
						"N-ground2x",
					);
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
console.log("\nStudy N runs complete.");
