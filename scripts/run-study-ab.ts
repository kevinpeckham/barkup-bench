/**
 * Study AB scored runs (docs/BRIEF-AB.md): AB-memo / AB-clause over
 * the Study AA conflict corpus's ri + override tasks (rr excluded,
 * disclosed), pack-grouped per model (Study AA protocol unchanged).
 *
 *   bun run scripts/run-study-ab.ts [--models a,b] [--concurrency 2]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ConflictTask } from "../src/corpus/conflict.js";
import type { ConflictArm } from "../src/harness/conflict-runner.js";
import { runConflictTask } from "../src/harness/conflict-runner.js";
import { loadExistingKeys } from "../src/harness/runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS: ConflictArm[] = ["AB-memo", "AB-clause"];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "2"));
const corpus = JSON.parse(readFileSync("corpus/conflict.json", "utf8")) as {
	tasks: ConflictTask[];
};
const tasks = corpus.tasks.filter((t) => t.kind !== "rr");

const packs = new Map<string, ConflictTask[]>();
for (const task of tasks) {
	const list = packs.get(task.packId) ?? [];
	list.push(task);
	packs.set(task.packId, list);
}

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyab-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const packQueue: {
		packId: string;
		cells: { task: ConflictTask; arm: ConflictArm }[];
	}[] = [];
	for (const [packId, packTasks] of packs) {
		const cells: { task: ConflictTask; arm: ConflictArm }[] = [];
		for (const task of packTasks) {
			for (const arm of ARMS) {
				if (!done.has(`${task.id}::${arm}::${model}::parity`)) {
					cells.push({ task, arm });
				}
			}
		}
		if (cells.length > 0) packQueue.push({ packId, cells });
	}
	const totalCells = packQueue.reduce((sum, p) => sum + p.cells.length, 0);
	console.log(
		`\n=== ${model} → ${outPath} (${totalCells} cells across ${packQueue.length} packs, ${done.size} done)`,
	);

	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < packQueue.length) {
			const pack = packQueue[cursor] as (typeof packQueue)[number];
			cursor += 1;
			for (const { task, arm } of pack.cells) {
				try {
					const record = await runConflictTask(task, arm, model);
					appendFileSync(outPath, `${JSON.stringify(record)}\n`);
					console.log(`  ${task.id} × ${arm}: ${record.detail?.reading}`);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					console.log(`  ${task.id} × ${arm}: ERROR ${message} (not recorded)`);
				}
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, packQueue.length) }, worker),
	);
}
console.log("\nStudy AB runs complete.");
