/**
 * Study T scored runs (docs/BRIEF-T.md): three session arms over the
 * callback corpus. Session is the resume unit, exactly as
 * run-study-k/m/o/p/s.ts.
 *
 *   bun run scripts/run-study-t.ts [--models a,b] [--concurrency 3]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SessionCorpus, SessionTask } from "../src/corpus/sessions.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import type { SessionPolicy } from "../src/harness/session-runner.js";
import { runSession } from "../src/harness/session-runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];
/** Pre-registered arms (BRIEF-T.md). */
const ARMS: { policy: SessionPolicy; condition: string }[] = [
	{ policy: "view", condition: "T-history" },
	{ policy: "cannedSys", condition: "T-system" },
	{ policy: "notes", condition: "T-notes" },
];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(
	readFileSync("corpus/sessions-callback.json", "utf8"),
) as SessionCorpus;

function sessionStepCount(
	outPath: string,
	task: SessionTask,
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
	const outPath = `results/raw/studyt-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });

	const queue: { task: SessionTask; arm: (typeof ARMS)[number] }[] = [];
	for (const task of corpus.sessions) {
		for (const arm of ARMS) {
			const done = sessionStepCount(outPath, task, arm.condition, model);
			if (done === task.steps.length) continue;
			if (done > 0) {
				throw new Error(
					`Partial session ${task.id} × ${arm.condition} × ${model} (${done}/${task.steps.length} steps) — strip its records before resuming.`,
				);
			}
			queue.push({ task, arm });
		}
	}
	console.log(`\n=== ${model} → ${outPath} (${queue.length} sessions to run)`);

	let cursor = 0;
	let passed = 0;
	let steps = 0;
	let tokens = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			const label = `${item.task.id} × ${item.arm.condition}`;
			try {
				const records = await runSession(
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
				tokens += records.reduce(
					(s, r) => s + r.totalInputTokens + r.totalOutputTokens,
					0,
				);
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
	console.log(
		`=== done: ${passed}/${steps} steps passed, ${(tokens / 1e6).toFixed(2)}M tokens`,
	);
}
console.log("\nStudy T runs complete.");
