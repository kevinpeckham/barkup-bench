/**
 * Study I analysis (docs/BRIEF-I.md): FV/FT (focused/minimal views)
 * vs the full-input F baseline from Study H, paired per task.
 *
 *   bun run scripts/analyze-study-i.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const BUCKETS = ["xl", "xxl", "xxxl"];
const VIEW_CONDITIONS = ["FV", "FT"];

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
	records.push(...loadRecords(`results/raw/sizeext-${slug(model)}.jsonl`));
	records.push(...loadRecords(`results/raw/studyi-${slug(model)}.jsonl`));
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

console.log("# Study I — focused views vs full-input F\n");

console.log("## Success by model × condition × size\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of ["F", ...VIEW_CONDITIONS]) {
		const parts = BUCKETS.map(
			(bucket) => `${bucket} ${pct(cell(model, condition, bucket))}`,
		);
		console.log(`  ${condition.padEnd(2)}: ${parts.join("  |  ")}`);
	}
	console.log("");
}

console.log("## Paired McNemar vs full-input F (per model, 45 shared tasks)\n");
for (const model of MODELS) {
	for (const condition of VIEW_CONDITIONS) {
		const base = new Map(
			cell(model, "F").map((r) => [r.taskId, r.success] as const),
		);
		let firstOnly = 0;
		let secondOnly = 0;
		let both = 0;
		let neither = 0;
		for (const r of cell(model, condition)) {
			const f = base.get(r.taskId);
			if (f === undefined) continue;
			if (f && !r.success) firstOnly += 1;
			else if (!f && r.success) secondOnly += 1;
			else if (f && r.success) both += 1;
			else neither += 1;
		}
		const m = mcnemarExact(firstOnly, secondOnly);
		console.log(
			`  ${model} F vs ${condition}: F-only ${firstOnly}, ${condition}-only ${secondOnly}, both ${both}, neither ${neither} — p = ${m.pValue.toFixed(3)}`,
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
	for (const condition of ["F", ...VIEW_CONDITIONS]) {
		const parts = BUCKETS.map((bucket) => {
			const rows = cell(model, condition, bucket);
			return `${bucket} ${median(rows.map((r) => r.totalInputTokens)).toLocaleString()}`;
		});
		console.log(`  ${condition.padEnd(2)}: ${parts.join("  |  ")}`);
	}
	console.log("");
}

console.log("## Success by edit kind (view conditions, pooled models)\n");
const KINDS = [
	"set-attribute",
	"set-name",
	"remove-node",
	"insert-node",
	"move-node",
];
// Edit kind is recoverable from the task id ordering: tasks cycle kinds
// in corpus order (generate-size-corpus.ts), index = (n - 1) % 5.
function kindOf(taskId: string): string {
	const n = Number(taskId.split("-").pop());
	return KINDS[(n - 1) % KINDS.length] as string;
}
for (const condition of ["F", ...VIEW_CONDITIONS]) {
	const parts = KINDS.map((kind) => {
		const rows = records.filter(
			(r) => r.condition === condition && kindOf(r.taskId) === kind,
		);
		const ok = rows.filter((r) => r.success).length;
		return `${kind} ${ok}/${rows.length}`;
	});
	console.log(`  ${condition.padEnd(2)}: ${parts.join("  |  ")}`);
}

console.log("\n## Correction-loop activity (view conditions)\n");
for (const condition of VIEW_CONDITIONS) {
	const rows = records.filter((r) => r.condition === condition);
	const multiRound = rows.filter((r) => r.rounds > 1);
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
		`  ${condition}: ${multiRound.length}/${rows.length} tasks needed correction rounds; issues: ${codeText}`,
	);
}
