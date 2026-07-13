/**
 * Study AA scored runs (docs/BRIEF-AA.md): AA-base / AA-priority /
 * AA-soft / AA-memo over the conflict corpus, pack-grouped per model
 * (Study Z protocol).
 *
 *   bun run scripts/run-study-aa.ts [--models a,b] [--concurrency 2]
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
const ARMS: ConflictArm[] = ["AA-base", "AA-priority", "AA-soft", "AA-memo"];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "2"));
const corpus = JSON.parse(readFileSync("corpus/conflict.json", "utf8")) as {
	tasks: ConflictTask[];
};

const packs = new Map<string, ConflictTask[]>();
for (const task of corpus.tasks) {
	const list = packs.get(task.packId) ?? [];
	list.push(task);
	packs.set(task.packId, list);
}

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyaa-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const packQueue: {
		packId: string;
		cells: { task: ConflictTask; arm: ConflictArm }[];
	}[] = [];
	for (const [packId, tasks] of packs) {
		const cells: { task: ConflictTask; arm: ConflictArm }[] = [];
		for (const task of tasks) {
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
	let resolved = 0;
	let total = 0;
	const worker = async (): Promise<void> => {
		while (cursor < packQueue.length) {
			const pack = packQueue[cursor] as (typeof packQueue)[number];
			cursor += 1;
			for (const { task, arm } of pack.cells) {
				try {
					const record = await runConflictTask(task, arm, model);
					appendFileSync(outPath, `${JSON.stringify(record)}\n`);
					total += 1;
					if (record.success) resolved += 1;
					console.log(
						`  ${task.id} × ${arm}: ${record.detail?.reading}${
							(record.detail?.contamination as string[]).length > 0
								? " CONTAM"
								: ""
						}`,
					);
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
	console.log(`=== done: ${resolved}/${total} resolved`);
}
console.log("\nStudy AA runs complete.");
