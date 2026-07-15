/**
 * Study AD analysis (docs/BRIEF-AD.md): the Opus confirmation. Reads
 * the four AD record files (matrix F, study-J views, studyad task
 * cells, studyad sessions) and evaluates the pre-registered gates
 * against the published sonnet/gemini anchors.
 *
 *   bun run scripts/analyze-study-ad.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { FanoutTask } from "../src/corpus/fanout.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODEL = "anthropic/claude-opus-4.8";
const SLUG = MODEL.replace(/[^a-z0-9.-]+/gi, "_");
const SIZE_BUCKETS = ["xl", "xxl", "xxxl"];

function loadRecords(path: string): TaskRunRecord[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as TaskRunRecord);
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] as number;
}

function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(100 * w.proportion).toFixed(1)}% [${(100 * w.low).toFixed(1)}%,${(100 * w.high).toFixed(1)}%])`;
}

function count(rows: TaskRunRecord[]): number {
	return rows.filter((r) => r.success).length;
}

const mainRecords = loadRecords(`results/raw/main-${SLUG}-parity.jsonl`).filter(
	(r) => r.condition === "F",
);
const viewRecords = loadRecords(`results/raw/studyj-${SLUG}.jsonl`);
const taskRecords = loadRecords(`results/raw/studyad-${SLUG}.jsonl`);
const sessionRecords = loadRecords(
	`results/raw/studyad-sessions-${SLUG}.jsonl`,
);

const fanoutCorpus = JSON.parse(readFileSync("corpus/fanout.json", "utf8")) as {
	tasks: FanoutTask[];
};
const fanoutById = new Map(fanoutCorpus.tasks.map((t) => [t.id, t]));

console.log(
	`# Study AD — Opus confirmation (${MODEL}): ${
		mainRecords.length +
		viewRecords.length +
		taskRecords.length +
		sessionRecords.length
	} records\n`,
);

const gates: { id: string; pass: boolean; text: string }[] = [];

// ---- AD-H1: the dialect on the main corpus ----
console.log(
	"## AD-H1 — condition F on the main corpus (anchor band 182–188/200)\n",
);
const mainBuckets = ["xs", "s", "m", "l"];
console.log(
	`  F overall: ${pct(mainRecords)}\n  ${mainBuckets
		.map((b) => `${b}: ${pct(mainRecords.filter((r) => r.bucket === b))}`)
		.join("  ")}\n`,
);
if (mainRecords.length === 200) {
	const ok = count(mainRecords);
	gates.push({
		id: "AD-H1",
		pass: ok >= 182,
		text: `F ${ok}/200 vs gate ≥182`,
	});
}

// ---- AD-H2: HTML views at size ----
console.log(
	"## AD-H2 — FVH/FTH over size-extension (anchor band 40–44/45 per mode)\n",
);
for (const condition of ["FVH", "FTH"]) {
	const rows = viewRecords.filter((r) => r.condition === condition);
	const bySize = SIZE_BUCKETS.map(
		(b) => `${b} ${pct(rows.filter((r) => r.bucket === b))}`,
	).join("  |  ");
	console.log(`  ${condition}: ${pct(rows)}\n    ${bySize}`);
	if (rows.length === 45) {
		const ok = count(rows);
		const sizeFloor = SIZE_BUCKETS.every(
			(b) => count(rows.filter((r) => r.bucket === b)) >= 12,
		);
		gates.push({
			id: `AD-H2 ${condition}`,
			pass: ok >= 40 && sizeFloor,
			text: `${condition} ${ok}/45 vs gate ≥40, size floor ≥12/15 ${sizeFloor ? "held" : "BROKEN"}`,
		});
	}
}
console.log("");

// ---- AD-F@size: full-tree dialect at ~1000 nodes (descriptive) ----
console.log(
	"## AD-F@size — condition F, full tree, xxxl (anchor 13/15; descriptive)\n",
);
const fSize = taskRecords.filter((r) => r.condition === "F");
console.log(
	`  F@xxxl: ${pct(fSize)}  (median input ${median(
		fSize.map((r) => r.totalInputTokens),
	).toLocaleString()} tokens)\n`,
);

// ---- AD-H3: the search recipe ----
console.log(
	"## AD-H3 — N-search over the grounded corpus (anchor: sonnet 43/45, gemini 39/45)\n",
);
const search = taskRecords.filter((r) => r.condition === "N-search");
const searchCalls = search.map((r) => Number(r.detail?.searchCalls ?? 0));
console.log(
	`  N-search: ${pct(search)}  (median find_nodes calls ${median(searchCalls)}, median input ${median(
		search.map((r) => r.totalInputTokens),
	).toLocaleString()} tokens)\n`,
);
if (search.length === 45) {
	const ok = count(search);
	gates.push({
		id: "AD-H3",
		pass: ok >= 39,
		text: `N-search ${ok}/45 vs gate ≥39`,
	});
}

// ---- AD-H4: session policies ----
console.log("## AD-H4 — session policies (20 sessions × 12 steps)\n");
const scorable = (r: TaskRunRecord): boolean =>
	typeof r.detail?.blocked !== "string";
const sessionConditions = ["K-view", "P-system", "M-stateless"];
const byCondition = new Map<string, TaskRunRecord[]>();
for (const condition of sessionConditions) {
	byCondition.set(
		condition,
		sessionRecords.filter((r) => r.condition === condition && scorable(r)),
	);
}
for (const condition of sessionConditions) {
	const rows = byCondition.get(condition) as TaskRunRecord[];
	const bySession = new Map<string, TaskRunRecord[]>();
	for (const r of rows) {
		const sessionId = r.taskId.split(":s")[0] as string;
		const list = bySession.get(sessionId) ?? [];
		list.push(r);
		bySession.set(sessionId, list);
	}
	let endOk = 0;
	let inTok = 0;
	let outTok = 0;
	for (const recs of bySession.values()) {
		const last = recs.find((r) => r.detail?.endStateMatch !== undefined);
		if (last?.detail?.endStateMatch === true) endOk += 1;
		inTok += recs.reduce((s, r) => s + r.totalInputTokens, 0);
		outTok += recs.reduce((s, r) => s + r.totalOutputTokens, 0);
	}
	const n = bySession.size;
	console.log(
		`  ${condition.padEnd(12)}: steps ${pct(rows)}; end-state ${endOk}/${n}; mean tokens/session ${Math.round(
			inTok / Math.max(n, 1),
		).toLocaleString()} in + ${Math.round(outTok / Math.max(n, 1)).toLocaleString()} out`,
	);
	if (
		rows.length >= 235 &&
		(condition === "K-view" || condition === "P-system")
	) {
		const ok = count(rows);
		gates.push({
			id: `AD-H4 ${condition}`,
			pass: ok / rows.length >= 0.95 && endOk >= 17,
			text: `${condition} steps ${ok}/${rows.length} (gate ≥95%), end-state ${endOk}/${n} (gate ≥17)`,
		});
	}
}

// Paired per (session, step): P-system vs M-stateless, and vs K-view.
function pairKey(r: TaskRunRecord): string {
	return r.taskId;
}
function pairedMcnemar(aId: string, bId: string): string {
	const a = new Map(
		(byCondition.get(aId) as TaskRunRecord[]).map((r) => [
			pairKey(r),
			r.success,
		]),
	);
	const b = new Map(
		(byCondition.get(bId) as TaskRunRecord[]).map((r) => [
			pairKey(r),
			r.success,
		]),
	);
	let aOnly = 0;
	let bOnly = 0;
	let both = 0;
	let neither = 0;
	for (const [key, aOk] of a) {
		const bOk = b.get(key);
		if (bOk === undefined) continue;
		if (aOk && bOk) both += 1;
		else if (aOk) aOnly += 1;
		else if (bOk) bOnly += 1;
		else neither += 1;
	}
	const m = mcnemarExact(aOnly, bOnly);
	return `${aId} vs ${bId}: ${aId}-only ${aOnly}, ${bId}-only ${bOnly}, both ${both}, neither ${neither} — p = ${m.pValue.toFixed(4)}`;
}
if (sessionRecords.length > 0) {
	console.log(`\n  ${pairedMcnemar("P-system", "M-stateless")}`);
	console.log(`  ${pairedMcnemar("P-system", "K-view")}\n`);
}

// ---- AD-H5: fan-out (descriptive) ----
console.log(
	"## AD-H5 — fan-out, Q-view vs Q-full (descriptive; anchors 62–69% overall)\n",
);
const targetBands: [string, (n: number) => boolean][] = [
	["2–3", (n) => n <= 3],
	["4–6", (n) => n >= 4 && n <= 6],
	["7+", (n) => n >= 7],
];
function targets(r: TaskRunRecord): number {
	return (fanoutById.get(r.taskId) as FanoutTask).targetIds.length;
}
for (const condition of ["Q-view", "Q-full"]) {
	const rows = taskRecords.filter((r) => r.condition === condition);
	const bands = targetBands
		.map(
			([label, test]) =>
				`${label}: ${pct(rows.filter((r) => test(targets(r))))}`,
		)
		.join("  ");
	console.log(`  ${condition}: ${pct(rows)}\n    ${bands}`);
}
const qView = new Map(
	taskRecords
		.filter((r) => r.condition === "Q-view")
		.map((r) => [r.taskId, r.success]),
);
const qFullRows = taskRecords.filter((r) => r.condition === "Q-full");
if (qView.size > 0 && qFullRows.length > 0) {
	let viewOnly = 0;
	let fullOnly = 0;
	for (const r of qFullRows) {
		const v = qView.get(r.taskId);
		if (v === undefined) continue;
		if (v && !r.success) viewOnly += 1;
		if (!v && r.success) fullOnly += 1;
	}
	const m = mcnemarExact(viewOnly, fullOnly);
	console.log(
		`  paired: view-only ${viewOnly}, full-only ${fullOnly} — p = ${m.pValue.toFixed(4)} (published: sonnet view-favoring p=.022, gemini full-favoring p=.008)\n`,
	);
}

// ---- Totals and gate verdicts ----
const all = [...mainRecords, ...viewRecords, ...taskRecords, ...sessionRecords];
const inTokens = all.reduce((s, r) => s + r.totalInputTokens, 0);
const outTokens = all.reduce((s, r) => s + r.totalOutputTokens, 0);
console.log(
	`## Totals\n  ${all.length} records, ${inTokens.toLocaleString()} in + ${outTokens.toLocaleString()} out ` +
		`(≈$${((inTokens * 5 + outTokens * 25) / 1e6).toFixed(2)} at $5/$25 per M)\n`,
);

console.log("## Pre-registered gates\n");
for (const gate of gates) {
	console.log(`  ${gate.pass ? "PASS" : "FAIL"}  ${gate.id}: ${gate.text}`);
}
const complete = gates.length >= 6;
if (!complete) {
	console.log(
		"\n  (incomplete record set — some gates not yet evaluable; rerun after all arms finish)",
	);
} else {
	const allPass = gates.every((g) => g.pass);
	console.log(
		`\n  STUDY GATE (AD-H1..H4): ${allPass ? "PASS — core stack confirmed on the shipped tier" : "FAIL — see per-gate rows"}`,
	);
}
