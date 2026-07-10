/**
 * Study S analysis (docs/BRIEF-S.md): the two surviving session
 * recipes at the 36-step horizon — per-third success, the placement
 * class, the paired arm comparison, the three-part gate, and the cost
 * divergence curves.
 *
 *   bun run scripts/analyze-study-s.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const CONDITIONS = ["S-view", "S-system"];
const THIRDS: [string, (i: number) => boolean][] = [
	["steps 1–12", (i) => i <= 12],
	["steps 13–24", (i) => i >= 13 && i <= 24],
	["steps 25–36", (i) => i >= 25],
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
	records.push(...loadRecords(`results/raw/studys-${slug}.jsonl`));
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
function rate(rows: TaskRunRecord[]): number {
	if (rows.length === 0) return Number.NaN;
	return rows.filter((r) => r.success).length / rows.length;
}
function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] as number;
}

console.log("# Study S — long sessions (36 steps)\n");

console.log("## Record inventory and blocked steps\n");
for (const model of MODELS) {
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition,
		);
		const blocked = rows.filter((r) => !scorable(r));
		const mech = blocked.filter((r) =>
			String(r.detail?.blocked).startsWith("mechanical"),
		);
		console.log(
			`  ${model} × ${condition}: ${rows.length} records, ${blocked.length} blocked (${mech.length} mechanical)`,
		);
	}
}
console.log("");

console.log("## Per-step success by third (non-blocked steps)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition && scorable(r),
		);
		if (rows.length === 0) continue;
		const parts = THIRDS.map(
			([name, test]) =>
				`${name} ${pct(rows.filter((r) => test(stepIndex(r))))}`,
		);
		console.log(`  ${condition.padEnd(9)}: ${parts.join("  |  ")}`);
	}
	console.log("");
}

console.log("## Placement steps only (insert/move)\n");
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
		const late = rows.filter((r) => stepIndex(r) >= 25);
		console.log(
			`  ${condition.padEnd(9)}: all ${pct(rows)}  |  steps 25–36 ${pct(late)}`,
		);
	}
	console.log("");
}

console.log("## Paired McNemar, S-view vs S-system (same session+step)\n");
const mcnemarP = new Map<string, number>();
for (const model of MODELS) {
	const base = new Map(
		records
			.filter(
				(r) => r.model === model && r.condition === "S-view" && scorable(r),
			)
			.map((r) => [r.taskId, r.success] as const),
	);
	let aOnly = 0;
	let bOnly = 0;
	let n = 0;
	for (const r of records.filter(
		(r) => r.model === model && r.condition === "S-system" && scorable(r),
	)) {
		const s = base.get(r.taskId);
		if (s === undefined) continue;
		n += 1;
		if (s && !r.success) aOnly += 1;
		else if (!s && r.success) bOnly += 1;
	}
	const m = mcnemarExact(aOnly, bOnly);
	mcnemarP.set(model, m.pValue);
	console.log(
		`  ${model} (n=${n}): S-view-only ${aOnly}, S-system-only ${bOnly} — p = ${m.pValue.toFixed(3)}`,
	);
}

console.log(
	"\n## Cost divergence (median input tokens at step; per BRIEF S-H2)\n",
);
const STEP_MARKS = [1, 6, 12, 18, 24, 30, 36];
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition && scorable(r),
		);
		if (rows.length === 0) continue;
		const marks = STEP_MARKS.map(
			(i) =>
				`s${i} ${median(
					rows.filter((r) => stepIndex(r) === i).map((r) => r.totalInputTokens),
				).toLocaleString()}`,
		);
		const meanOut = (
			rows.reduce((s, r) => s + r.totalOutputTokens, 0) / rows.length
		).toFixed(0);
		console.log(
			`  ${condition.padEnd(9)}: ${marks.join(" | ")}  ·  mean output/step ${meanOut}`,
		);
	}
	console.log("");
}

console.log("## End-state match and mean tokens per session\n");
const endStates = new Map<string, number>();
const meanInputs = new Map<string, number>();
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
		endStates.set(`${model}|${condition}`, endOk);
		meanInputs.set(`${model}|${condition}`, Math.round(inTok / n));
		console.log(
			`  ${condition.padEnd(9)}: end-state ${endOk}/${n}; mean tokens/session ${Math.round(inTok / n).toLocaleString()} in + ${Math.round(outTok / n).toLocaleString()} out`,
		);
	}
	console.log("");
}

console.log("## Pre-registered gate (S-H1, per model)\n");
let gate = true;
for (const model of MODELS) {
	const sys = records.filter(
		(r) => r.model === model && r.condition === "S-system" && scorable(r),
	);
	const firstThird = rate(sys.filter((r) => stepIndex(r) <= 12));
	const lastThird = rate(sys.filter((r) => stepIndex(r) >= 25));
	const a = lastThird >= firstThird - 0.1;
	const p = mcnemarP.get(model) ?? Number.NaN;
	const b = p > 0.05;
	const endView = endStates.get(`${model}|S-view`) ?? 0;
	const endSys = endStates.get(`${model}|S-system`) ?? 0;
	const c = endSys >= endView - 2;
	if (!(a && b && c)) gate = false;
	console.log(
		`  ${model}: (a) last third ${(lastThird * 100).toFixed(1)}% vs first ${(firstThird * 100).toFixed(1)}% → ${a ? "PASS" : "FAIL"}; (b) McNemar p=${p.toFixed(3)} → ${b ? "PASS" : "FAIL"}; (c) end-state ${endSys} vs ${endView} → ${c ? "PASS" : "FAIL"}`,
	);
}
console.log(`\n  GATE: ${gate ? "PASSES" : "FAILS"}`);

console.log(
	"\n## S-H2 (cost ratio, S-view mean input / S-system mean input)\n",
);
for (const model of MODELS) {
	const view = meanInputs.get(`${model}|S-view`);
	const sys = meanInputs.get(`${model}|S-system`);
	if (view === undefined || sys === undefined || sys === 0) continue;
	console.log(`  ${model}: ${(view / sys).toFixed(1)}× (predicted ≥ 3×)`);
}
