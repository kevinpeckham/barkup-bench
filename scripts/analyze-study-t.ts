/**
 * Study T analysis (docs/BRIEF-T.md): conversation-carried context.
 * Callback steps by kind, the arm comparisons, the memo-rescue gate,
 * and the cost check.
 *
 *   bun run scripts/analyze-study-t.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const CONDITIONS = ["T-history", "T-system", "T-notes"];

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
	records.push(...loadRecords(`results/raw/studyt-${slug}.jsonl`));
}

function scorable(r: TaskRunRecord): boolean {
	return typeof r.detail?.blocked !== "string";
}
function callbackKind(r: TaskRunRecord): "fact" | "rule" | null {
	const kind = r.detail?.callback;
	return kind === "fact" || kind === "rule" ? kind : null;
}
function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}

console.log("# Study T — conversation-carried context\n");

console.log("## Record inventory and blocked steps\n");
for (const model of MODELS) {
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition,
		);
		const blocked = rows.filter((r) => !scorable(r));
		console.log(
			`  ${model} × ${condition}: ${rows.length} records, ${blocked.length} blocked`,
		);
	}
}
console.log("");

console.log("## Callback steps (the class history was hiding)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition && scorable(r),
		);
		if (rows.length === 0) continue;
		const cb = rows.filter((r) => callbackKind(r) !== null);
		const fact = rows.filter((r) => callbackKind(r) === "fact");
		const rule = rows.filter((r) => callbackKind(r) === "rule");
		console.log(
			`  ${condition.padEnd(10)}: callbacks ${pct(cb)}  |  fact ${pct(fact)}  |  rule ${pct(rule)}`,
		);
	}
	console.log("");
}

console.log("## Ordinary self-contained steps (control)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) =>
				r.model === model &&
				r.condition === condition &&
				scorable(r) &&
				callbackKind(r) === null,
		);
		if (rows.length === 0) continue;
		console.log(`  ${condition.padEnd(10)}: ${pct(rows)}`);
	}
	console.log("");
}

function mcnemar(
	model: string,
	a: string,
	b: string,
	filter: (r: TaskRunRecord) => boolean,
): { aOnly: number; bOnly: number; n: number; p: number } {
	const base = new Map(
		records
			.filter(
				(r) =>
					r.model === model && r.condition === a && scorable(r) && filter(r),
			)
			.map((r) => [r.taskId, r.success] as const),
	);
	let aOnly = 0;
	let bOnly = 0;
	let n = 0;
	for (const r of records.filter(
		(r) => r.model === model && r.condition === b && scorable(r) && filter(r),
	)) {
		const s = base.get(r.taskId);
		if (s === undefined) continue;
		n += 1;
		if (s && !r.success) aOnly += 1;
		else if (!s && r.success) bOnly += 1;
	}
	return { aOnly, bOnly, n, p: mcnemarExact(aOnly, bOnly).pValue };
}

console.log("## Paired McNemar (same session+step)\n");
const gateStats = new Map<string, { cbP: number; allP: number }>();
for (const model of MODELS) {
	const isCb = (r: TaskRunRecord) => callbackKind(r) !== null;
	const all = () => true;
	const h1 = mcnemar(model, "T-history", "T-system", isCb);
	console.log(
		`  ${model} T-history vs T-system, callbacks (n=${h1.n}): history-only ${h1.aOnly}, system-only ${h1.bOnly} — p = ${h1.p.toFixed(4)}`,
	);
	const g1 = mcnemar(model, "T-history", "T-notes", isCb);
	console.log(
		`  ${model} T-history vs T-notes, callbacks (n=${g1.n}): history-only ${g1.aOnly}, notes-only ${g1.bOnly} — p = ${g1.p.toFixed(4)}`,
	);
	const g2 = mcnemar(model, "T-history", "T-notes", all);
	console.log(
		`  ${model} T-history vs T-notes, all steps (n=${g2.n}): history-only ${g2.aOnly}, notes-only ${g2.bOnly} — p = ${g2.p.toFixed(4)}`,
	);
	gateStats.set(model, { cbP: g1.p, allP: g2.p });
}

console.log("\n## End-state match and mean tokens per session\n");
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
			`  ${condition.padEnd(10)}: end-state ${endOk}/${n}; mean tokens/session ${Math.round(inTok / n).toLocaleString()} in + ${Math.round(outTok / n).toLocaleString()} out`,
		);
	}
	console.log("");
}

console.log("## Pre-registered gate (T-H2: the memo rescue, per model)\n");
let gate = true;
for (const model of MODELS) {
	const s = gateStats.get(model);
	if (!s) continue;
	const a = s.cbP > 0.05;
	const b = s.allP > 0.05;
	const endHistory = endStates.get(`${model}|T-history`) ?? 0;
	const endNotes = endStates.get(`${model}|T-notes`) ?? 0;
	const c = endNotes >= endHistory - 2;
	if (!(a && b && c)) gate = false;
	console.log(
		`  ${model}: (a) callbacks p=${s.cbP.toFixed(3)} → ${a ? "PASS" : "FAIL"}; (b) all steps p=${s.allP.toFixed(3)} → ${b ? "PASS" : "FAIL"}; (c) end-state ${endNotes} vs ${endHistory} → ${c ? "PASS" : "FAIL"}`,
	);
}
console.log(`\n  GATE: ${gate ? "PASSES" : "FAILS"}`);

console.log(
	"\n## T-H3 (cost: T-notes mean input vs T-system; predicted ≤ 1.3×)\n",
);
for (const model of MODELS) {
	const notes = meanInputs.get(`${model}|T-notes`);
	const system = meanInputs.get(`${model}|T-system`);
	const history = meanInputs.get(`${model}|T-history`);
	if (notes === undefined || system === undefined || system === 0) continue;
	console.log(
		`  ${model}: T-notes/T-system = ${(notes / system).toFixed(2)}×; T-history/T-notes = ${history !== undefined ? (history / notes).toFixed(1) : "—"}×`,
	);
}
