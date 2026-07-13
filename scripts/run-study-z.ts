/**
 * Study Z scored runs (docs/BRIEF-Z.md): Z-full / Z-slice / Z-memo over
 * the standing-context corpus, PACK-GROUPED per model so each pack's
 * static block repeats within the cache TTL and real hit rates land in
 * the recorded cacheRead/cacheWrite tokens. Cells within a pack run
 * sequentially by design (the caching appendix needs the order); packs
 * provide the resume boundary.
 *
 *   bun run scripts/run-study-z.ts [--models a,b] [--concurrency 2]
 *
 * The neutrality spot-check (10 sonnet Z-full cells re-run with a plain
 * string system) runs afterwards via --spot-check.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { StandingTask } from "../src/corpus/standing.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys } from "../src/harness/runner.js";
import type { StandingArm } from "../src/harness/standing-runner.js";
import { runStandingTask } from "../src/harness/standing-runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS: StandingArm[] = ["Z-full", "Z-slice", "Z-memo"];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}
const spotCheck = process.argv.includes("--spot-check");

const models = spotCheck
	? ["anthropic/claude-sonnet-4.5"]
	: arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "2"));
const corpus = JSON.parse(readFileSync("corpus/standing.json", "utf8")) as {
	tasks: StandingTask[];
};

// Group tasks by pack; a pack is the unit of work so its three tasks ×
// arms run back-to-back against the same static block.
const packs = new Map<string, StandingTask[]>();
for (const task of corpus.tasks) {
	const list = packs.get(task.packId) ?? [];
	list.push(task);
	packs.set(task.packId, list);
}

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = spotCheck
		? "results/raw/studyz-spotcheck.jsonl"
		: `results/raw/studyz-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	// Spot-check: first 10 fact/rule/combined Z-full cells, plain system.
	const packQueue: {
		packId: string;
		cells: { task: StandingTask; arm: StandingArm }[];
	}[] = [];
	if (spotCheck) {
		const cells = corpus.tasks
			.slice(0, 10)
			.map((task) => ({ task, arm: "Z-full" as StandingArm }))
			.filter(
				({ task }) => !done.has(`${task.id}::Z-full-plain::${model}::parity`),
			);
		if (cells.length > 0) packQueue.push({ packId: "spot", cells });
	} else {
		for (const [packId, tasks] of packs) {
			const cells: { task: StandingTask; arm: StandingArm }[] = [];
			for (const task of tasks) {
				for (const arm of ARMS) {
					if (!done.has(`${task.id}::${arm}::${model}::parity`)) {
						cells.push({ task, arm });
					}
				}
			}
			if (cells.length > 0) packQueue.push({ packId, cells });
		}
	}
	const totalCells = packQueue.reduce((sum, p) => sum + p.cells.length, 0);
	console.log(
		`\n=== ${model} → ${outPath} (${totalCells} cells across ${packQueue.length} packs, ${done.size} done)`,
	);

	let cursor = 0;
	let passed = 0;
	let total = 0;
	const worker = async (): Promise<void> => {
		while (cursor < packQueue.length) {
			const pack = packQueue[cursor] as (typeof packQueue)[number];
			cursor += 1;
			for (const { task, arm } of pack.cells) {
				try {
					const record: TaskRunRecord = await runStandingTask(
						task,
						arm,
						model,
						spotCheck ? { plainSystem: true, conditionId: "Z-full-plain" } : {},
					);
					appendFileSync(outPath, `${JSON.stringify(record)}\n`);
					total += 1;
					if (record.success) passed += 1;
					const cacheRead = record.calls.reduce(
						(sum, c) => sum + (c.cacheReadTokens ?? 0),
						0,
					);
					const contamination = (
						record.detail?.contamination as string[] | undefined
					)?.length;
					console.log(
						`  ${task.id} × ${arm}: ${record.success ? "pass" : "FAIL"}${
							contamination ? ` CONTAM×${contamination}` : ""
						} (cacheRead=${cacheRead})`,
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
	console.log(`=== done: ${passed}/${total} passed`);
}
console.log("\nStudy Z runs complete.");
