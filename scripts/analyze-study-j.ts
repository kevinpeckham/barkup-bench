/**
 * Study J analysis (docs/BRIEF-J.md): HTML-rendered views (FVH/FTH)
 * vs their JSON twins (FV/FT, Study I) and full-input F (Study H),
 * paired per task.
 *
 *   bun run scripts/analyze-study-j.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const BUCKETS = ["xl", "xxl", "xxxl"];
const PAIRS: [string, string][] = [
	["FV", "FVH"],
	["FT", "FTH"],
];

function loadRecords(path: string): TaskRunRecord[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as TaskRunRecord);
}

function slug(model: string): string {
	return model.replace(/[^a-z0-9.-]+/gi, "_");
}

const records: TaskRunRecord[] = [];
for (const model of MODELS) {
	for (const stem of ["sizeext", "studyi", "studyj"]) {
		records.push(...loadRecords(`results/raw/${stem}-${slug(model)}.jsonl`));
	}
}

function cell(model: string, condition: string, bucket?: string) {
	return records.filter(
		(r) =>
			r.model === model &&
			r.condition === condition &&
			(bucket === undefined || r.bucket === bucket),
	);
}

function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}

console.log("# Study J — HTML views vs JSON views\n");

console.log("## Success by model × condition × size\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of ["F", "FV", "FVH", "FT", "FTH"]) {
		const parts = BUCKETS.map(
			(bucket) => `${bucket} ${pct(cell(model, condition, bucket))}`,
		);
		console.log(`  ${condition.padEnd(3)}: ${parts.join("  |  ")}`);
	}
	console.log("");
}

console.log("## Paired McNemar, JSON view vs HTML view (per model)\n");
for (const model of MODELS) {
	for (const [json, html] of PAIRS) {
		const base = new Map(
			cell(model, json).map((r) => [r.taskId, r.success] as const),
		);
		let firstOnly = 0;
		let secondOnly = 0;
		let both = 0;
		let neither = 0;
		for (const r of cell(model, html)) {
			const j = base.get(r.taskId);
			if (j === undefined) continue;
			if (j && !r.success) firstOnly += 1;
			else if (!j && r.success) secondOnly += 1;
			else if (j && r.success) both += 1;
			else neither += 1;
		}
		const m = mcnemarExact(firstOnly, secondOnly);
		console.log(
			`  ${model} ${json} vs ${html}: ${json}-only ${firstOnly}, ${html}-only ${secondOnly}, both ${both}, neither ${neither} — p = ${m.pValue.toFixed(3)}`,
		);
	}
}

console.log("\n## Input tokens per task (median, by size)\n");
function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] as number;
}
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of ["F", "FV", "FVH", "FT", "FTH"]) {
		const parts = BUCKETS.map((bucket) => {
			const rows = cell(model, condition, bucket);
			return `${bucket} ${median(rows.map((r) => r.totalInputTokens)).toLocaleString()}`;
		});
		console.log(`  ${condition.padEnd(3)}: ${parts.join("  |  ")}`);
	}
	console.log("");
}

console.log("## First-pass validity and correction rounds (view arms)\n");
for (const condition of ["FV", "FVH", "FT", "FTH"]) {
	const rows = records.filter((r) => r.condition === condition);
	const fpv = rows.filter((r) => r.firstPassValid === true).length;
	const multi = rows.filter((r) => r.rounds > 1).length;
	const codes = new Map<string, number>();
	for (const r of rows) {
		for (const call of r.calls) {
			for (const code of call.issueCodes) {
				codes.set(code, (codes.get(code) ?? 0) + 1);
			}
		}
	}
	const codeText =
		[...codes.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([code, n]) => `${code}×${n}`)
			.join(", ") || "none";
	console.log(
		`  ${condition.padEnd(3)}: first-pass valid ${fpv}/${rows.length}; correction rounds on ${multi}; issues: ${codeText}`,
	);
}
