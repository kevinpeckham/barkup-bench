/**
 * Study U analysis (docs/BRIEF-U.md): dependent edits across the four
 * arms, the failure anatomy of the target-only view, the both-nodes
 * gate, and the search arm's read behavior.
 *
 *   bun run scripts/analyze-study-u.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const CONDITIONS = ["U-full", "U-view1", "U-view2", "U-search"];

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
	records.push(...loadRecords(`results/raw/studyu-${slug}.jsonl`));
}

function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}
function kindOf(r: TaskRunRecord): string {
	return String(r.detail?.depKind ?? "?");
}
function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] as number;
}

console.log("# Study U — document-carried dependencies\n");

console.log("## Success by arm (45 tasks per cell)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition,
		);
		if (rows.length === 0) continue;
		const value = rows.filter((r) => kindOf(r) === "value");
		const structure = rows.filter((r) => kindOf(r) === "structure");
		console.log(
			`  ${condition.padEnd(8)}: all ${pct(rows)}  |  value ${pct(value)}  |  structure ${pct(structure)}`,
		);
	}
	console.log("");
}

console.log(
	"## U-view1 failure anatomy (valid-but-wrong guess vs no artifact)\n",
);
for (const model of MODELS) {
	const rows = records.filter(
		(r) => r.model === model && r.condition === "U-view1" && !r.success,
	);
	const guessed = rows.filter((r) => r.detail?.finalTree != null);
	console.log(
		`  ${model}: ${rows.length} failures — ${guessed.length} valid-but-wrong (guessed a value), ${rows.length - guessed.length} no valid artifact`,
	);
}

console.log("\n## Paired McNemar vs U-full (same task)\n");
const gateP = new Map<string, number>();
for (const model of MODELS) {
	for (const condition of ["U-view1", "U-view2", "U-search"]) {
		const base = new Map(
			records
				.filter((r) => r.model === model && r.condition === "U-full")
				.map((r) => [r.taskId, r.success] as const),
		);
		let aOnly = 0;
		let bOnly = 0;
		let n = 0;
		for (const r of records.filter(
			(r) => r.model === model && r.condition === condition,
		)) {
			const s = base.get(r.taskId);
			if (s === undefined) continue;
			n += 1;
			if (s && !r.success) aOnly += 1;
			else if (!s && r.success) bOnly += 1;
		}
		const m = mcnemarExact(aOnly, bOnly);
		if (condition === "U-view2") gateP.set(model, m.pValue);
		console.log(
			`  ${model} U-full vs ${condition} (n=${n}): full-only ${aOnly}, ${condition}-only ${bOnly} — p = ${m.pValue.toFixed(4)}`,
		);
	}
}

console.log("\n## Cost (median input tokens per cell; search calls)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition,
		);
		if (rows.length === 0) continue;
		const input = median(rows.map((r) => r.totalInputTokens)).toLocaleString();
		const calls =
			condition === "U-search"
				? ` · median search calls ${median(
						rows.map((r) => Number(r.detail?.searchCalls ?? 0)),
					)}`
				: "";
		console.log(`  ${condition.padEnd(8)}: median input ${input}${calls}`);
	}
	console.log("");
}

console.log("## Pre-registered gate (U-H2: U-view2 ties U-full, per model)\n");
let gate = true;
for (const model of MODELS) {
	const p = gateP.get(model) ?? Number.NaN;
	const pass = p > 0.05;
	if (!pass) gate = false;
	console.log(
		`  ${model}: McNemar p = ${p.toFixed(3)} → ${pass ? "PASS" : "FAIL"}`,
	);
}
console.log(`\n  GATE: ${gate ? "PASSES" : "FAILS"}`);
