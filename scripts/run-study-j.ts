/**
 * Study J scored runs (docs/BRIEF-J.md): conditions FVH/FTH (HTML-
 * rendered focused/minimal views, F patch dialect, shipped applier)
 * against the size-extension corpus. Protocol identical to Study I.
 *
 *   bun run scripts/run-study-j.ts [--models a,b] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ViewMode } from "../src/conditions/views.js";
import { makeHtmlViewCondition } from "../src/conditions/views-html.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys, runTask } from "../src/harness/runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];
const MODES: ViewMode[] = ["focused", "minimal"];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(
	readFileSync("corpus/size-extension.json", "utf8"),
) as Corpus;
const tasks = corpus.tasks as TransformationTask[];

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyj-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: { task: TransformationTask; mode: ViewMode }[] = [];
	for (const task of tasks) {
		for (const mode of MODES) {
			const id = mode === "focused" ? "FVH" : "FTH";
			if (!done.has(`${task.id}::${id}::${model}::parity`)) {
				queue.push({ task, mode });
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
			const condition = makeHtmlViewCondition(item.mode, item.task.edit);
			const label = `${item.task.id} × ${condition.id}`;
			try {
				const record = await runTask(item.task, condition, model, "parity");
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
	const tokens = records.reduce(
		(s, r) => s + r.totalInputTokens + r.totalOutputTokens,
		0,
	);
	console.log(
		`=== done: ${ok}/${records.length} passed, ${(tokens / 1e6).toFixed(2)}M tokens`,
	);
}
console.log("\nStudy J runs complete.");
