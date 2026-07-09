/**
 * Study P analysis (docs/BRIEF-P.md): canned worked examples vs the
 * M-stateless and K-view baselines, paired per (session, step), with
 * the placement-class breakdown and the output-terseness measure.
 *
 *   bun run scripts/analyze-study-p.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const CONDITIONS = ["K-view", "M-stateless", "P-canned", "P-system"];
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
	records.push(...loadRecords(`results/raw/studyp-${slug}.jsonl`));
}

function stepIndex(r: TaskRunRecord): number {
	return Number(r.taskId.split(":s").pop());
}
function scorable(r: TaskRunRecord): boolean {
	return typeof r.detail?.blocked !== "string";
}
function isPlacement(r: TaskRunRecord): boolean {
	const kind = String(r.detail?.editKind ?? "");
	return kind === "insert-node" || kind === "move-node";
}
function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}
function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] as number;
}

console.log("# Study P — synthetic history\n");

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

console.log("## Placement steps only (insert/move — the class M failed on)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) =>
				r.model === model &&
				r.condition === condition &&
				scorable(r) &&
				isPlacement(r),
		);
		if (rows.length === 0) continue;
		const late = rows.filter((r) => stepIndex(r) >= 5);
		console.log(
			`  ${condition.padEnd(12)}: all ${pct(rows)}  |  steps 5–12 ${pct(late)}`,
		);
	}
	console.log("");
}

console.log("## Paired McNemar (same session+step)\n");
function mcnemar(model: string, a: string, b: string): void {
	const base = new Map(
		records
			.filter((r) => r.model === model && r.condition === a && scorable(r))
			.map((r) => [r.taskId, r.success] as const),
	);
	let aOnly = 0;
	let bOnly = 0;
	let n = 0;
	for (const r of records.filter(
		(r) => r.model === model && r.condition === b && scorable(r),
	)) {
		const s = base.get(r.taskId);
		if (s === undefined) continue;
		n += 1;
		if (s && !r.success) aOnly += 1;
		else if (!s && r.success) bOnly += 1;
	}
	const m = mcnemarExact(aOnly, bOnly);
	console.log(
		`  ${model} ${a} vs ${b} (n=${n}): ${a}-only ${aOnly}, ${b}-only ${bOnly} — p = ${m.pValue.toFixed(3)}`,
	);
}
for (const model of MODELS) {
	mcnemar(model, "M-stateless", "P-canned");
	mcnemar(model, "M-stateless", "P-system");
	mcnemar(model, "K-view", "P-canned");
	mcnemar(model, "K-view", "P-system");
	mcnemar(model, "P-system", "P-canned");
}

console.log(
	"\n## Cost shape and terseness (median input by step; mean output/step)\n",
);
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
		const meanOut = (
			rows.reduce((s, r) => s + r.totalOutputTokens, 0) / rows.length
		).toFixed(0);
		console.log(
			`  ${condition.padEnd(12)}: s1 ${at(1)} | s4 ${at(4)} | s8 ${at(8)} | s12 ${at(12)}  ·  mean output/step ${meanOut}`,
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
