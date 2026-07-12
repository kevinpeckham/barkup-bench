/**
 * Study Y analysis (docs/BRIEF-Y.md): casual vs formulaic recognition,
 * the chatter noise metric, memo fidelity per style, per-kind splits,
 * and the two-clause gate.
 *
 *   bun run scripts/analyze-study-y.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { WTask } from "../src/corpus/callbacks-w.js";
import type { YPair } from "../src/corpus/casual.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import type { SessionNote } from "../src/shipped/session-notes.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS = ["Y-formulaic", "Y-casual", "Y-casual-history"];

const corpus = JSON.parse(
	readFileSync("corpus/sessions-casual.json", "utf8"),
) as { pairs: YPair[] };
const taskById = new Map(
	corpus.pairs.map((p) => [p.formulaic.id, p.formulaic]),
);

function loadRecords(path: string): TaskRunRecord[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((l) => l.trim())
		.map((l) => JSON.parse(l) as TaskRunRecord);
}

const records: TaskRunRecord[] = [];
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	records.push(...loadRecords(`results/raw/studyy-${slug}.jsonl`));
}

function stepIndex(r: TaskRunRecord): number {
	return Number(r.taskId.split(":s").pop());
}
function sessionId(r: TaskRunRecord): string {
	return r.taskId.split(":s")[0] as string;
}
function scorable(r: TaskRunRecord): boolean {
	return typeof r.detail?.blocked !== "string";
}
function isCallback(r: TaskRunRecord): boolean {
	const k = r.detail?.callback;
	return k === "fact" || k === "rule";
}
function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}

console.log("# Study Y — does the memo survive how people actually talk?\n");

console.log("## Callback success by arm (48 cells per arm-model)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const arm of ARMS) {
		const rows = records.filter(
			(r) =>
				r.model === model &&
				r.condition === arm &&
				scorable(r) &&
				isCallback(r),
		);
		if (rows.length === 0) continue;
		const fact = rows.filter((r) => r.detail?.callback === "fact");
		const rule = rows.filter((r) => r.detail?.callback === "rule");
		console.log(
			`  ${arm.padEnd(17)}: all ${pct(rows)}  |  fact ${pct(fact)}  |  rule ${pct(rule)}`,
		);
	}
	console.log("");
}

console.log(
	"## Memo fidelity per arm (recall · retraction · NOISE · cadence)\n",
);
const fidelity = new Map<
	string,
	{ recall: number; recallDen: number; noise: number; sessions: number }
>();
for (const model of MODELS) {
	for (const arm of ARMS) {
		const bySession = new Map<string, TaskRunRecord[]>();
		for (const r of records.filter(
			(r) => r.model === model && r.condition === arm,
		)) {
			bySession.set(sessionId(r), [...(bySession.get(sessionId(r)) ?? []), r]);
		}
		if (bySession.size === 0) continue;
		let recall = 0;
		let recallDen = 0;
		let retractionOk = 0;
		let noise = 0;
		let toolCalls = 0;
		for (const [id, recs] of bySession) {
			const task = taskById.get(id) as WTask;
			const sorted = [...recs].sort((a, b) => stepIndex(a) - stepIndex(b));
			const memo = (sorted[sorted.length - 1]?.detail?.memoAfter ??
				[]) as SessionNote[];
			const text = memo.map((n) => n.text).join(" | ");
			const active = [
				task.declarables.f1Final,
				task.declarables.f2,
				task.declarables.rule,
			];
			recallDen += active.length;
			recall += active.filter((v) => text.includes(v)).length;
			if (!text.includes(task.declarables.f1Initial)) retractionOk += 1;
			noise += memo.filter(
				(n) =>
					!active.some((v) => n.text.includes(v)) &&
					!n.text.includes(task.declarables.f1Initial),
			).length;
			toolCalls += Number(
				sorted[sorted.length - 1]?.detail?.memoToolCallsTotal ?? 0,
			);
		}
		fidelity.set(`${model}|${arm}`, {
			recall,
			recallDen,
			noise,
			sessions: bySession.size,
		});
		console.log(
			`  ${model.split("/")[1]} ${arm.padEnd(17)}: recall ${recall}/${recallDen} · retraction ok ${retractionOk}/${bySession.size} · noise/session ${(noise / bySession.size).toFixed(2)} · tool calls/session ${(toolCalls / bySession.size).toFixed(1)}`,
		);
	}
}

console.log("\n## Paired McNemar, Y-casual vs Y-formulaic (callback cells)\n");
const gate1 = new Map<string, boolean>();
for (const model of MODELS) {
	const filter = (r: TaskRunRecord) => scorable(r) && isCallback(r);
	const base = new Map(
		records
			.filter(
				(r) => r.model === model && r.condition === "Y-formulaic" && filter(r),
			)
			.map((r) => [r.taskId, r.success] as const),
	);
	let aOnly = 0;
	let bOnly = 0;
	let n = 0;
	for (const r of records.filter(
		(r) => r.model === model && r.condition === "Y-casual" && filter(r),
	)) {
		const s = base.get(r.taskId);
		if (s === undefined) continue;
		n += 1;
		if (s && !r.success) aOnly += 1;
		else if (!s && r.success) bOnly += 1;
	}
	const m = mcnemarExact(aOnly, bOnly);
	gate1.set(model, m.pValue > 0.05);
	console.log(
		`  ${model.split("/")[1]} (n=${n}): formulaic-only ${aOnly}, casual-only ${bOnly} — p = ${m.pValue.toFixed(4)}`,
	);
}

console.log("\n## Pre-registered gates\n");
let pass = true;
for (const model of MODELS) {
	const mcnemarOk = gate1.get(model) ?? false;
	const f = fidelity.get(`${model}|Y-formulaic`);
	const c = fidelity.get(`${model}|Y-casual`);
	const recallOk = !!f && !!c && c.recall >= f.recall - 2;
	const g1 = mcnemarOk && recallOk;
	if (!g1) pass = false;
	console.log(
		`  Y-H1 ${model.split("/")[1]}: McNemar ${mcnemarOk ? "ok" : "FAIL"} · recall ${c?.recall}/${c?.recallDen} vs ${f?.recall}/${f?.recallDen} ${recallOk ? "ok" : "FAIL"} → ${g1 ? "PASS" : "FAIL"}`,
	);
}
let noiseOk = true;
for (const model of MODELS) {
	for (const arm of ARMS) {
		const f = fidelity.get(`${model}|${arm}`);
		if (!f) continue;
		const perSession = f.noise / f.sessions;
		const ok = perSession <= 0.5;
		if (!ok) noiseOk = false;
		console.log(
			`  Y-H2 ${model.split("/")[1]} ${arm}: noise/session ${perSession.toFixed(2)} (≤ 0.5) → ${ok ? "PASS" : "FAIL"}`,
		);
	}
}
if (!noiseOk) pass = false;
console.log(
	`\n  GATE (Y-H1 all models AND Y-H2 all arms): ${pass ? "PASSES" : "FAILS"}`,
);
