/**
 * Study AC scored runs (docs/BRIEF-AC.md): AC-base / AC-rule / AC-tool
 * over the Study U dependent corpus, both views, three models.
 *
 *   bun run scripts/run-study-ac.ts [--models a,b] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DependentTask } from "../src/corpus/dependent.js";
import type { AskArm, AskView } from "../src/harness/ask-runner.js";
import { runAskTask } from "../src/harness/ask-runner.js";
import { loadExistingKeys } from "../src/harness/runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS: AskArm[] = ["AC-base", "AC-rule", "AC-tool"];
const VIEWS: AskView[] = ["view1", "view2"];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(readFileSync("corpus/dependent.json", "utf8")) as {
	tasks: DependentTask[];
};

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyac-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: { task: DependentTask; view: AskView; arm: AskArm }[] = [];
	for (const task of corpus.tasks) {
		for (const view of VIEWS) {
			for (const arm of ARMS) {
				if (!done.has(`${task.id}::${arm}-${view}::${model}::parity`)) {
					queue.push({ task, view, arm });
				}
			}
		}
	}
	console.log(
		`\n=== ${model} → ${outPath} (${queue.length} to run, ${done.size} done)`,
	);

	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			try {
				const record = await runAskTask(item.task, item.view, item.arm, model);
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				console.log(
					`  ${item.task.id} × ${item.arm}-${item.view}: ${record.detail?.outcome}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(
					`  ${item.task.id} × ${item.arm}-${item.view}: ERROR ${message} (not recorded)`,
				);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
}
console.log("\nStudy AC runs complete.");
