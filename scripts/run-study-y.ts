/**
 * Study Y scored runs (docs/BRIEF-Y.md): three arms × three models
 * over the twin corpus, using the Study W memo runner with condition
 * overrides. Session is the resume unit.
 *
 *   bun run scripts/run-study-y.ts [--models a,b,c] [--concurrency 3]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { WTask } from "../src/corpus/callbacks-w.js";
import type { YPair } from "../src/corpus/casual.js";
import type { WArm } from "../src/harness/memo-runner.js";
import { runWSession } from "../src/harness/memo-runner.js";
import type { TaskRunRecord } from "../src/harness/records.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];

/** Pre-registered arms (BRIEF-Y.md): W policies under Y conditions. */
const ARMS: { condition: string; policy: WArm; variant: keyof YPair }[] = [
	{ condition: "Y-formulaic", policy: "W-agent", variant: "formulaic" },
	{ condition: "Y-casual", policy: "W-agent", variant: "casual" },
	{
		condition: "Y-casual-history",
		policy: "W-agent-history",
		variant: "casual",
	},
];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(
	readFileSync("corpus/sessions-casual.json", "utf8"),
) as { pairs: YPair[] };

function sessionStepCount(
	outPath: string,
	task: WTask,
	condition: string,
	model: string,
): number {
	if (!existsSync(outPath)) return 0;
	let count = 0;
	for (const line of readFileSync(outPath, "utf8").split("\n")) {
		if (line.trim() === "") continue;
		const r = JSON.parse(line) as TaskRunRecord;
		if (
			r.taskId.startsWith(`${task.id}:`) &&
			r.condition === condition &&
			r.model === model
		) {
			count += 1;
		}
	}
	return count;
}

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyy-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });

	const queue: { task: WTask; arm: (typeof ARMS)[number] }[] = [];
	for (const pair of corpus.pairs) {
		for (const arm of ARMS) {
			const task = pair[arm.variant];
			const done = sessionStepCount(outPath, task, arm.condition, model);
			if (done === task.steps.length) continue;
			if (done > 0) {
				throw new Error(
					`Partial session ${task.id} × ${arm.condition} × ${model} — strip its records before resuming.`,
				);
			}
			queue.push({ task, arm });
		}
	}
	console.log(`\n=== ${model} → ${outPath} (${queue.length} sessions to run)`);

	let cursor = 0;
	let passed = 0;
	let steps = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			const label = `${item.task.id} × ${item.arm.condition}`;
			try {
				const records = await runWSession(
					item.task,
					item.arm.policy,
					model,
					item.arm.condition,
				);
				for (const record of records) {
					appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				}
				const ok = records.filter((r) => r.success).length;
				passed += ok;
				steps += records.length;
				console.log(`  ${label}: ${ok}/${records.length} steps pass`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(`  ${label}: ERROR ${message} (session not recorded)`);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
	console.log(`=== done: ${passed}/${steps} steps passed`);
}
console.log("\nStudy Y runs complete.");
