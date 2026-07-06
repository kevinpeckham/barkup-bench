/**
 * Aggregate a results JSONL into the pilot report tables: per-condition
 * and per-condition×bucket metrics, paired A-vs-C comparison (McNemar
 * exact), token/latency totals for the cost projection.
 */
import { readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const path = process.argv[2];
if (!path) throw new Error("usage: bun run report <results.jsonl>");

const records = readFileSync(path, "utf8")
	.split("\n")
	.filter((line) => line.trim() !== "")
	.map((line) => JSON.parse(line) as TaskRunRecord);

function pct(x: number): string {
	return `${(100 * x).toFixed(0)}%`;
}

function summarize(rows: TaskRunRecord[]): string {
	const n = rows.length;
	if (n === 0) return "n=0";
	const success = rows.filter((r) => r.success).length;
	const w = wilson(success, n);
	// Derived from calls (not the stored passAt1 field): success with no
	// correction round in any phase.
	const passAt1 = rows.filter(
		(r) => r.success && r.calls.every((call) => call.round === 1),
	).length;
	const validityRows = rows.filter((r) => r.firstPassValid !== null);
	const firstValid = validityRows.filter((r) => r.firstPassValid).length;
	const solved = rows.filter((r) => r.success);
	const meanRounds =
		solved.length > 0
			? (solved.reduce((s, r) => s + r.rounds, 0) / solved.length).toFixed(2)
			: "—";
	const driftRows = rows.filter((r) => r.drift !== null);
	const meanDrift =
		driftRows.length > 0
			? (
					driftRows.reduce((s, r) => s + (r.drift ?? 0), 0) / driftRows.length
				).toFixed(2)
			: "—";
	const toolErrors = rows.reduce((s, r) => s + (r.toolErrorCount ?? 0), 0);
	const idRefFails = rows.filter((r) => r.idRefFailure === true).length;
	const inTok = rows.reduce((s, r) => s + r.totalInputTokens, 0);
	const outTok = rows.reduce((s, r) => s + r.totalOutputTokens, 0);
	const latency = rows.reduce((s, r) => s + r.totalLatencyMs, 0);
	return [
		`n=${n}`,
		`success=${success}/${n} (${pct(w.proportion)} [${pct(w.low)},${pct(w.high)}])`,
		`pass@1=${passAt1}/${n}`,
		validityRows.length > 0
			? `firstPassValid=${firstValid}/${validityRows.length}`
			: "firstPassValid=n/a",
		`meanRounds(solved)=${meanRounds}`,
		`meanDrift=${meanDrift}`,
		`toolErrors=${toolErrors}`,
		`idRefFails=${idRefFails}`,
		`tokens=${inTok}in+${outTok}out`,
		`latency=${(latency / 1000).toFixed(0)}s`,
	].join("  ");
}

const conditions = [...new Set(records.map((r) => r.condition))].sort();
const families = [...new Set(records.map((r) => r.family))].sort();
const buckets = ["xs", "s", "m", "l"].filter((b) =>
	records.some((r) => r.bucket === b),
);

console.log(`# Report: ${path}  (model: ${records[0]?.model})\n`);
console.log("## By condition");
for (const c of conditions) {
	console.log(`  ${c}: ${summarize(records.filter((r) => r.condition === c))}`);
}
console.log("\n## By condition × family");
for (const c of conditions) {
	for (const f of families) {
		const rows = records.filter((r) => r.condition === c && r.family === f);
		if (rows.length > 0) console.log(`  ${c} × ${f}: ${summarize(rows)}`);
	}
}
console.log("\n## By condition × bucket");
for (const c of conditions) {
	for (const b of buckets) {
		const rows = records.filter((r) => r.condition === c && r.bucket === b);
		if (rows.length > 0) console.log(`  ${c} × ${b}: ${summarize(rows)}`);
	}
}

// Paired comparison over tasks present in both conditions.
if (conditions.length === 2) {
	const [c1, c2] = conditions as [string, string];
	const byTask = new Map<string, Record<string, boolean>>();
	for (const r of records) {
		const entry = byTask.get(r.taskId) ?? {};
		entry[r.condition] = r.success;
		byTask.set(r.taskId, entry);
	}
	let firstOnly = 0;
	let secondOnly = 0;
	let bothPass = 0;
	let bothFail = 0;
	for (const entry of byTask.values()) {
		const a = entry[c1];
		const b = entry[c2];
		if (a === undefined || b === undefined) continue;
		if (a && b) bothPass += 1;
		else if (a && !b) firstOnly += 1;
		else if (!a && b) secondOnly += 1;
		else bothFail += 1;
	}
	const test = mcnemarExact(firstOnly, secondOnly);
	console.log(
		`\n## Paired ${c1} vs ${c2}: both=${bothPass}, ${c1}-only=${firstOnly}, ${c2}-only=${secondOnly}, neither=${bothFail}, McNemar exact p=${test.pValue.toFixed(3)}`,
	);
}

const errors = records.filter((r) => r.error !== undefined);
if (errors.length > 0) {
	console.log(`\n## Harness errors (${errors.length})`);
	for (const r of errors) {
		console.log(`  ${r.taskId} × ${r.condition}: ${r.error}`);
	}
}
