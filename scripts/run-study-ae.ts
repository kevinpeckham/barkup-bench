/**
 * Study AE scored runs (docs/BRIEF-AE.md): the calibration ladder
 * (AE-base / AE-rule × 75 tasks) plus the resume loop (AE-resume ×
 * the 45 dependent view1 cells), three models.
 *
 *   bun run scripts/run-study-ae.ts [--models a,b,c] [--concurrency 3]
 *                                   [--parts ladder,resume]
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DependentTask } from "../src/corpus/dependent.js";
import type { CalibrationTask } from "../src/corpus/ladder.js";
import { runAskResumeTask } from "../src/harness/ask-runner.js";
import type { LadderArm } from "../src/harness/ladder-runner.js";
import { runLadderTask } from "../src/harness/ladder-runner.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys } from "../src/harness/runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS: LadderArm[] = ["AE-base", "AE-rule"];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const parts = new Set(arg("parts", "ladder,resume").split(","));

const calibration = JSON.parse(
	readFileSync("corpus/calibration.json", "utf8"),
) as { tasks: CalibrationTask[] };
const dependent = JSON.parse(readFileSync("corpus/dependent.json", "utf8")) as {
	tasks: DependentTask[];
};

interface Cell {
	label: string;
	run: () => Promise<TaskRunRecord>;
}

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyae-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = loadExistingKeys(outPath);

	const queue: Cell[] = [];
	if (parts.has("ladder")) {
		for (const task of calibration.tasks) {
			for (const arm of ARMS) {
				const conditionId = `${arm}-l${task.level}`;
				if (done.has(`${task.id}::${conditionId}::${model}::parity`)) continue;
				queue.push({
					label: `${task.id} × ${conditionId}`,
					run: () => runLadderTask(task, arm, model),
				});
			}
		}
	}
	if (parts.has("resume")) {
		for (const task of dependent.tasks) {
			if (done.has(`${task.id}::AE-resume::${model}::parity`)) continue;
			queue.push({
				label: `${task.id} × AE-resume`,
				run: () => runAskResumeTask(task, model),
			});
		}
	}

	console.log(
		`\n=== ${model} → ${outPath} (${queue.length} to run, ${done.size} done)`,
	);
	const records: TaskRunRecord[] = [];
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const cell = queue[cursor] as Cell;
			cursor += 1;
			try {
				const record = await cell.run();
				records.push(record);
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				console.log(
					`  ${cell.label}: ${String(record.detail?.outcome)} (rounds=${record.rounds}, tokens=${record.totalInputTokens}+${record.totalOutputTokens})`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(
					`  ${cell.label}: ERROR ${message} (not recorded — retryable)`,
				);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
	const ok = records.filter((r) => r.success).length;
	console.log(`=== done: ${ok}/${records.length} level-correct`);
}
console.log("\nStudy AE runs complete.");
