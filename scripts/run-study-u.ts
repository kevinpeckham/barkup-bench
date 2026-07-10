/**
 * Study U scored runs (docs/BRIEF-U.md): U-full / U-view1 / U-view2 /
 * U-search over the dependent-edit corpus.
 *
 *   bun run scripts/run-study-u.ts [--models a,b] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { makeUFull, makeUView } from "../src/conditions/dependent.js";
import type { DependentTask } from "../src/corpus/dependent.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys, runTask } from "../src/harness/runner.js";
import { runSearchTask } from "../src/harness/search-runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];
const CONDITIONS = ["U-full", "U-view1", "U-view2", "U-search"] as const;

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(readFileSync("corpus/dependent.json", "utf8")) as {
	tasks: DependentTask[];
};
const tasks = corpus.tasks;

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyu-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: {
		task: DependentTask;
		condition: (typeof CONDITIONS)[number];
	}[] = [];
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

	let cursor = 0;
	let passed = 0;
	let total = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			try {
				let record: TaskRunRecord;
				if (item.condition === "U-search") {
					record = await runSearchTask(item.task, model, "U-search");
				} else {
					const condition =
						item.condition === "U-full"
							? makeUFull()
							: makeUView(item.task, item.condition);
					record = await runTask(item.task, condition, model);
				}
				if (record.detail) {
					record.detail.depKind = item.task.depKind;
				} else {
					record.detail = { depKind: item.task.depKind };
				}
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				total += 1;
				if (record.success) passed += 1;
				console.log(
					`  ${item.task.id} × ${item.condition}: ${record.success ? "pass" : "FAIL"}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(
					`  ${item.task.id} × ${item.condition}: ERROR ${message} (not recorded)`,
				);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
	console.log(`=== done: ${passed}/${total} passed`);
}
console.log("\nStudy U runs complete.");
