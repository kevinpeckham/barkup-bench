/**
 * Study M analysis (docs/BRIEF-M.md): stateless/windowed sessions vs
 * the K-view baseline, paired per (session, step).
 *
 *   bun run scripts/analyze-study-m.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const CONDITIONS = ["K-view", "M-window", "M-stateless"];
const TERCILES: [string, (i: number) => boolean][] = [
	["steps 1–4", (i) => i <= 4],
	["steps 5–8", (i) => i >= 5 && i <= 8],
	["steps 9–12", (i) => i >= 9],
];

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
	records.push(...loadRecords(`results/raw/studyk-${slug}.jsonl`));
	records.push(...loadRecords(`results/raw/studym-${slug}.jsonl`));
}

function stepIndex(r: TaskRunRecord): number {
	return Number(r.taskId.split(":s").pop());
}
function scorable(r: TaskRunRecord): boolean {
	return typeof r.detail?.blocked !== "string";
}
function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}

console.log("# Study M — stateless sessions vs K-view\n");

console.log("## Per-step success by tercile (non-blocked steps)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition && scorable(r),
		);
		if (rows.length === 0) continue;
		const parts = TERCILES.map(
			([name, test]) =>
				`${name} ${pct(rows.filter((r) => test(stepIndex(r))))}`,
		);
		console.log(`  ${condition.padEnd(12)}: ${parts.join("  |  ")}`);
	}
	console.log("");
}

console.log("## Paired McNemar vs K-view (same session+step)\n");
for (const model of MODELS) {
	for (const condition of ["M-stateless", "M-window"]) {
		const base = new Map(
			records
				.filter(
					(r) => r.model === model && r.condition === "K-view" && scorable(r),
				)
				.map((r) => [r.taskId, r.success] as const),
		);
		let kOnly = 0;
		let mOnly = 0;
		let n = 0;
		for (const r of records.filter(
			(r) => r.model === model && r.condition === condition && scorable(r),
		)) {
			const k = base.get(r.taskId);
			if (k === undefined) continue;
			n += 1;
			if (k && !r.success) kOnly += 1;
			else if (!k && r.success) mOnly += 1;
		}
		const m = mcnemarExact(kOnly, mOnly);
		console.log(
			`  ${model} K-view vs ${condition} (n=${n}): K-only ${kOnly}, ${condition}-only ${mOnly} — p = ${m.pValue.toFixed(3)}`,
		);
	}
}

console.log(
	"\n## Input tokens per step by step index (median) — the cost shape\n",
);
function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] as number;
}
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition && scorable(r),
		);
		if (rows.length === 0) continue;
		const at = (i: number) =>
			median(
				rows.filter((r) => stepIndex(r) === i).map((r) => r.totalInputTokens),
			).toLocaleString();
		console.log(
			`  ${condition.padEnd(12)}: s1 ${at(1)} | s4 ${at(4)} | s8 ${at(8)} | s12 ${at(12)}`,
		);
	}
	console.log("");
}

console.log("## End-state match and mean tokens per session\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition,
		);
		if (rows.length === 0) continue;
		const bySession = new Map<string, TaskRunRecord[]>();
		for (const r of rows) {
			const id = r.taskId.split(":s")[0] as string;
			bySession.set(id, [...(bySession.get(id) ?? []), r]);
		}
		let endOk = 0;
		let inTok = 0;
		let outTok = 0;
		for (const [, recs] of bySession) {
			const last = recs.find((r) => r.detail?.endStateMatch !== undefined);
			if (last?.detail?.endStateMatch === true) endOk += 1;
			inTok += recs.reduce((s, r) => s + r.totalInputTokens, 0);
			outTok += recs.reduce((s, r) => s + r.totalOutputTokens, 0);
		}
		const n = bySession.size;
		console.log(
			`  ${condition.padEnd(12)}: end-state ${endOk}/${n}; mean tokens/session ${Math.round(inTok / n).toLocaleString()} in + ${Math.round(outTok / n).toLocaleString()} out`,
		);
	}
	console.log("");
}
