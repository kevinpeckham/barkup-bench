/**
 * Study W analysis (docs/BRIEF-W.md): callback success by arm × model
 * with the history arm split by RECORDED window membership, the two
 * gates, memo-fidelity metrics, and tool cadence.
 *
 *   bun run scripts/analyze-study-w.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { WTask } from "../src/corpus/callbacks-w.js";
import { W_SCHEDULE } from "../src/corpus/callbacks-w.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import type { SessionNote } from "../src/shipped/session-notes.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS = ["W-oracle", "W-agent", "W-agent-history"];

const corpus = JSON.parse(
	readFileSync("corpus/sessions-callback-long.json", "utf8"),
) as { sessions: WTask[] };
const taskById = new Map(corpus.sessions.map((t) => [t.id, t]));

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
	records.push(...loadRecords(`results/raw/studyw-${slug}.jsonl`));
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
	const kind = r.detail?.callback;
	return kind === "fact" || kind === "rule";
}
/** For the history arm: does this callback's DECLARING message still
 * sit inside the window at request time (recorded by the runner)? */
function declaringStepFor(r: TaskRunRecord): number | null {
	const i = stepIndex(r);
	const S = W_SCHEDULE;
	if (i === S.governedWithin || i === S.governedPost1 || i === S.governedPost2)
		return S.declareRule;
	if (i === S.factF1Within || i === S.factF1Post) return S.retractF1;
	if (i === S.factF2Within) return S.declareF2;
	return null;
}
function inWindow(r: TaskRunRecord): boolean | null {
	const declaring = declaringStepFor(r);
	if (declaring === null) return null;
	const carriers = r.detail?.windowCarriers;
	if (!Array.isArray(carriers)) return null;
	return (carriers as number[]).includes(declaring);
}
function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}

console.log("# Study W — who writes the memo?\n");

console.log("## Callback success by arm (72 callback cells per arm-model)\n");
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
		if (arm === "W-agent-history") {
			const within = rows.filter((r) => inWindow(r) === true);
			const post = rows.filter((r) => inWindow(r) === false);
			console.log(
				`  ${arm.padEnd(16)}: all ${pct(rows)}  |  in-window ${pct(within)}  |  POST-TRUNCATION ${pct(post)}`,
			);
		} else {
			const fact = rows.filter((r) => r.detail?.callback === "fact");
			const rule = rows.filter((r) => r.detail?.callback === "rule");
			console.log(
				`  ${arm.padEnd(16)}: all ${pct(rows)}  |  fact ${pct(fact)}  |  rule ${pct(rule)}`,
			);
		}
	}
	console.log("");
}

console.log("## Ordinary self-contained steps (control)\n");
for (const model of MODELS) {
	const parts = ARMS.map((arm) => {
		const rows = records.filter(
			(r) =>
				r.model === model &&
				r.condition === arm &&
				scorable(r) &&
				!isCallback(r),
		);
		return `${arm} ${rows.filter((r) => r.success).length}/${rows.length}`;
	});
	console.log(`  ${model}: ${parts.join(" · ")}`);
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

console.log(
	"\n## Memo fidelity (agent arms; deterministic, from recorded snapshots)\n",
);
interface Fidelity {
	recall: number;
	recallDen: number;
	retractionOk: number;
	noise: number;
	drops: number;
	toolCalls: number;
	sessions: number;
}
for (const model of MODELS) {
	for (const arm of ["W-agent", "W-agent-history"]) {
		const bySession = new Map<string, TaskRunRecord[]>();
		for (const r of records.filter(
			(r) => r.model === model && r.condition === arm,
		)) {
			const id = sessionId(r);
			bySession.set(id, [...(bySession.get(id) ?? []), r]);
		}
		if (bySession.size === 0) continue;
		const f: Fidelity = {
			recall: 0,
			recallDen: 0,
			retractionOk: 0,
			noise: 0,
			drops: 0,
			toolCalls: 0,
			sessions: bySession.size,
		};
		for (const [id, recs] of bySession) {
			const task = taskById.get(id) as WTask;
			const sorted = [...recs].sort((a, b) => stepIndex(a) - stepIndex(b));
			const finalMemo = (sorted[sorted.length - 1]?.detail?.memoAfter ??
				[]) as SessionNote[];
			const text = finalMemo.map((n) => n.text).join(" | ");
			const active = [
				task.declarables.f1Final,
				task.declarables.f2,
				task.declarables.rule,
			];
			f.recallDen += active.length;
			f.recall += active.filter((v) => text.includes(v)).length;
			if (!text.includes(task.declarables.f1Initial)) f.retractionOk += 1;
			f.noise += finalMemo.filter(
				(n) =>
					!active.some((v) => n.text.includes(v)) &&
					!n.text.includes(task.declarables.f1Initial),
			).length;
			// Replace-integrity: an active declarable present at step k's
			// snapshot but missing at a later snapshot before session end.
			for (const value of active) {
				let seen = false;
				for (const r of sorted) {
					const memo = (r.detail?.memoAfter ?? []) as SessionNote[];
					const has = memo.some((n) => n.text.includes(value));
					if (seen && !has) {
						f.drops += 1;
						break;
					}
					if (has) seen = true;
				}
			}
			const last = sorted[sorted.length - 1];
			f.toolCalls += Number(last?.detail?.memoToolCallsTotal ?? 0);
		}
		console.log(
			`  ${model.split("/")[1]} ${arm.padEnd(16)}: recall ${f.recall}/${f.recallDen} · retraction ok ${f.retractionOk}/${f.sessions} · noise/session ${(f.noise / f.sessions).toFixed(1)} · drop events ${f.drops} · tool calls/session ${(f.toolCalls / f.sessions).toFixed(1)}`,
		);
	}
}

console.log("\n## Pre-registered gates\n");
const isCb = (r: TaskRunRecord) => isCallback(r);
let h1 = true;
for (const model of MODELS) {
	const m = mcnemar(model, "W-oracle", "W-agent", isCb);
	const pass = m.p > 0.05;
	if (!pass) h1 = false;
	console.log(
		`  W-H1 ${model.split("/")[1]}: oracle-only ${m.aOnly}, agent-only ${m.bOnly} (n=${m.n}) — p = ${m.p.toFixed(4)} → ${pass ? "PASS" : "FAIL"}`,
	);
}
let h2 = true;
for (const model of MODELS) {
	const post = (r: TaskRunRecord) => isCallback(r) && inWindow(r) === false;
	// Oracle has no window; pair oracle's SAME cells (by taskId) against
	// history cells recorded as post-truncation.
	const historyPost = new Set(
		records
			.filter(
				(r) =>
					r.model === model &&
					r.condition === "W-agent-history" &&
					scorable(r) &&
					post(r),
			)
			.map((r) => r.taskId),
	);
	const filter = (r: TaskRunRecord) => historyPost.has(r.taskId);
	const m = mcnemar(model, "W-oracle", "W-agent-history", filter);
	const pass = m.p > 0.05;
	if (!pass) h2 = false;
	console.log(
		`  W-H2 ${model.split("/")[1]} (post-truncation, n=${m.n}): oracle-only ${m.aOnly}, history-only ${m.bOnly} — p = ${m.p.toFixed(4)} → ${pass ? "PASS" : "FAIL"}`,
	);
}
console.log(`\n  W-H1 GATE (pure extraction): ${h1 ? "PASSES" : "FAILS"}`);
console.log(
	`  W-H2 GATE (shipped config post-truncation): ${h2 ? "PASSES" : "FAILS"}`,
);

console.log("\n## Cost (mean input tokens per session)\n");
for (const model of MODELS) {
	const parts = ARMS.map((arm) => {
		const rows = records.filter(
			(r) => r.model === model && r.condition === arm,
		);
		if (rows.length === 0) return `${arm} —`;
		const bySession = new Map<string, number>();
		for (const r of rows) {
			bySession.set(
				sessionId(r),
				(bySession.get(sessionId(r)) ?? 0) + r.totalInputTokens,
			);
		}
		const mean =
			[...bySession.values()].reduce((s, v) => s + v, 0) / bySession.size;
		return `${arm} ${Math.round(mean).toLocaleString()}`;
	});
	console.log(`  ${model}: ${parts.join(" · ")}`);
}
