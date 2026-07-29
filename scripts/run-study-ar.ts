/**
 * Study AR scored runs (docs/BRIEF-AR.md): advertised headroom.
 * Cap-edge: 40 K=20 tasks × [control, AR-headroom, AR-truecap]
 * interleaved per task in one queue. No-op guard: 20 under-cap tasks,
 * headroom arm only.
 *
 *   bun run scripts/run-study-ar.ts [--models a,b,c] [--concurrency 3]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { IntegrityTask } from "../src/corpus/memoscale.js";
import type { MemoIntegrityArm } from "../src/harness/memoscale-runner.js";
import { runMemoIntegrityTask } from "../src/harness/memoscale-runner.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys } from "../src/harness/runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-fable-5",
	"moonshotai/kimi-k3",
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));

const capEdge = (
	JSON.parse(readFileSync("corpus/memo-consolidation.json", "utf8")) as {
		integrity: IntegrityTask[];
	}
).integrity.filter((t) => t.kLevel === 20);
const underCap = (
	JSON.parse(readFileSync("corpus/memo-scale.json", "utf8")) as {
		integrity: IntegrityTask[];
	}
).integrity.filter((t) => t.kLevel === 10 || t.kLevel === 19);
if (capEdge.length !== 40 || underCap.length !== 20) {
	throw new Error(
		`corpus shape unexpected: cap-edge ${capEdge.length}, under-cap ${underCap.length}`,
	);
}

interface Cell {
	label: string;
	run: () => Promise<TaskRunRecord>;
}

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyar-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: Cell[] = [];
	for (const task of capEdge) {
		for (const arm of [
			"AK-eviction",
			"AR-headroom",
			"AR-truecap",
		] as MemoIntegrityArm[]) {
			const condition = `${arm}-k${task.kLevel}`;
			if (done.has(`${task.id}::${condition}::${model}::parity`)) continue;
			queue.push({
				label: `${task.id} ${arm}`,
				run: () => runMemoIntegrityTask(task, model, arm),
			});
		}
	}
	for (const task of underCap) {
		const condition = `AR-headroom-k${task.kLevel}`;
		if (done.has(`${task.id}::${condition}::${model}::parity`)) continue;
		queue.push({
			label: `${task.id} AR-headroom`,
			run: () => runMemoIntegrityTask(task, model, "AR-headroom"),
		});
	}

	console.log(
		`\n=== ${model} → ${outPath} (${queue.length} to run, ${done.size} done)`,
	);
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const cell = queue[cursor] as Cell;
			cursor += 1;
			try {
				const record = await cell.run();
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				console.log(
					`  ${cell.label}: ${String(record.detail?.outcome)} goalSafe=${String(record.detail?.goalSafe)} raw=${String(record.detail?.rawLength)}`,
				);
			} catch (error) {
				console.log(
					`  ${cell.label}: ERROR ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	};
	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	console.log(`=== ${model} done`);
}
