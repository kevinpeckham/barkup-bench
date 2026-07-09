/**
 * Study R analysis (docs/BRIEF-R.md): interventions vs their Study Q
 * bases, the rescue gate vs each model's best Q arm, and the
 * decomposition audit with its compounding shape.
 *
 *   bun run scripts/analyze-study-r.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { FanoutTask } from "../src/corpus/fanout.js";
import {
	classifyFanoutFailure,
	fanoutCoverage,
} from "../src/grading/fanout-grade.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const SONNET = "anthropic/claude-sonnet-4.5";
const GEMINI = "google/gemini-3.5-flash";
const MODELS = [SONNET, GEMINI];
const R_CONDITIONS = ["R-exV", "R-exF", "R-ckV", "R-ckF", "R-decomp"];
const ALL = ["Q-view", "Q-full", "Q-search", ...R_CONDITIONS];
const BINS: [string, (n: number) => boolean][] = [
	["2–3 targets", (n) => n <= 3],
	["4–6 targets", (n) => n >= 4 && n <= 6],
	["7+ targets", (n) => n >= 7],
];
const BEST_Q: Record<string, string> = {
	[SONNET]: "Q-view",
	[GEMINI]: "Q-full",
};

const corpus = JSON.parse(readFileSync("corpus/fanout.json", "utf8")) as {
	tasks: FanoutTask[];
};
const byId = new Map(corpus.tasks.map((t) => [t.id, t]));

function loadRecords(path: string): TaskRunRecord[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as TaskRunRecord);
}
const records: TaskRunRecord[] = [];
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	records.push(...loadRecords(`results/raw/studyq-${slug}.jsonl`));
	records.push(...loadRecords(`results/raw/studyr-${slug}.jsonl`));
}

function targetCount(r: TaskRunRecord): number {
	return (byId.get(r.taskId) as FanoutTask).targetIds.length;
}
function rows(model: string, condition: string): TaskRunRecord[] {
	return records.filter((r) => r.model === model && r.condition === condition);
}
function pct(list: TaskRunRecord[]): string {
	if (list.length === 0) return "—";
	const ok = list.filter((r) => r.success).length;
	const w = wilson(ok, list.length);
	return `${ok}/${list.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}
function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] as number;
}
function mcnemar(model: string, a: string, b: string): void {
	const base = new Map(
		rows(model, a).map((r) => [r.taskId, r.success] as const),
	);
	let aOnly = 0;
	let bOnly = 0;
	for (const r of rows(model, b)) {
		const s = base.get(r.taskId);
		if (s === undefined) continue;
		if (s && !r.success) aOnly += 1;
		else if (!s && r.success) bOnly += 1;
	}
	const m = mcnemarExact(aOnly, bOnly);
	console.log(
		`  ${model} ${a} vs ${b}: ${a}-only ${aOnly}, ${b}-only ${bOnly} — p = ${m.pValue.toFixed(3)}`,
	);
}

console.log("# Study R — fan-out interventions\n");

console.log("## Success by model × condition (overall and by target count)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of ALL) {
		const list = rows(model, condition);
		if (list.length === 0) continue;
		const parts = BINS.map(
			([name, test]) =>
				`${name} ${pct(list.filter((r) => test(targetCount(r))))}`,
		);
		console.log(
			`  ${condition.padEnd(8)}: all ${pct(list)}  |  ${parts.join("  |  ")}`,
		);
	}
	console.log("");
}

console.log("## Paired McNemar — interventions vs their bases\n");
for (const model of MODELS) {
	mcnemar(model, "Q-view", "R-exV");
	mcnemar(model, "Q-view", "R-ckV");
	mcnemar(model, "Q-full", "R-exF");
	mcnemar(model, "Q-full", "R-ckF");
}

console.log("\n## The rescue gate — arms vs the model's best Q baseline\n");
for (const model of MODELS) {
	const best = BEST_Q[model] as string;
	for (const condition of R_CONDITIONS) {
		if (rows(model, condition).length === 0) continue;
		mcnemar(model, best, condition);
	}
	console.log("");
}

console.log("## Failure anatomy and coverage\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of R_CONDITIONS) {
		const fails = rows(model, condition).filter((r) => !r.success);
		const kinds = new Map<string, number>();
		const coverages: number[] = [];
		for (const r of fails) {
			const task = byId.get(r.taskId) as FanoutTask;
			const final = r.detail?.finalTree as BarkupNode | null | undefined;
			const k = classifyFanoutFailure(task, final);
			kinds.set(k, (kinds.get(k) ?? 0) + 1);
			const c = fanoutCoverage(task, final);
			if (c !== null) coverages.push(c);
		}
		const meanCov =
			coverages.length > 0
				? `${((coverages.reduce((s, c) => s + c, 0) / coverages.length) * 100).toFixed(0)}%`
				: "—";
		console.log(
			`  ${condition.padEnd(8)}: ${fails.length} failures — ${
				[...kinds.entries()].map(([k, n]) => `${k}×${n}`).join(", ") || "none"
			}${coverages.length > 0 ? ` (mean coverage among graded failures ${meanCov})` : ""}`,
		);
	}
	console.log("");
}

console.log("## Decomposition audit — subtask reliability and compounding\n");
for (const model of MODELS) {
	const list = rows(model, "R-decomp");
	if (list.length === 0) continue;
	let subtasks = 0;
	let failures = 0;
	for (const r of list) {
		subtasks += Number(r.detail?.subtasks ?? 0);
		failures += Number(r.detail?.subtaskFailures ?? 0);
	}
	const perEdit = 1 - failures / (subtasks || 1);
	console.log(
		`  ${model}: ${subtasks} subtasks, ${failures} failed — per-edit ${(perEdit * 100).toFixed(2)}%; task-level ${pct(list)}`,
	);
	const parts = BINS.map(
		([name, test]) =>
			`${name} ${pct(list.filter((r) => test(targetCount(r))))}`,
	);
	console.log(`    by count: ${parts.join("  |  ")}`);
}

console.log("\n## Cost — median input tokens per task and per solved task\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of ALL) {
		const list = rows(model, condition);
		if (list.length === 0) continue;
		const solved = list.filter((r) => r.success);
		console.log(
			`  ${condition.padEnd(8)}: median input ${median(list.map((r) => r.totalInputTokens)).toLocaleString()}; mean input per solved ${
				solved.length > 0
					? Math.round(
							solved.reduce((s, r) => s + r.totalInputTokens, 0) /
								solved.length,
						).toLocaleString()
					: "—"
			}`,
		);
	}
	console.log("");
}
