/**
 * Study I scored runs (docs/BRIEF-I.md): conditions FV/FT (focused and
 * minimal views over the F anchored-patch dialect, shipped applier)
 * against the size-extension corpus. The view depends on each task's
 * edit, so conditions are bound per task and the runner is driven
 * directly; protocol otherwise matches Study H's F cells.
 *
 *   bun run scripts/run-study-i.ts [--models a,b] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { makeViewCondition, type ViewMode } from "../src/conditions/views.js";
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
	const outPath = `results/raw/studyi-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: { task: TransformationTask; mode: ViewMode }[] = [];
	for (const task of tasks) {
		for (const mode of MODES) {
			const id = mode === "focused" ? "FV" : "FT";
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
			const condition = makeViewCondition(item.mode, item.task.edit);
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
console.log("\nStudy I runs complete.");
