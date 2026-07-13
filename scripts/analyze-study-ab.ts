/**
 * Study AB analysis (docs/BRIEF-AB.md): does the shipped v3.188.1
 * precedence clause stop memo-induced countermand trampling (AB-H1)
 * without costing the memo's steering benefit (AB-H2)?
 *
 *   bun run scripts/analyze-study-ab.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";

const MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];

function loadRecords(path: string): TaskRunRecord[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as TaskRunRecord);
}

const byModel = new Map<string, TaskRunRecord[]>();
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	byModel.set(model, loadRecords(`results/raw/studyab-${slug}.jsonl`));
}

function d(r: TaskRunRecord): Record<string, unknown> {
	return r.detail ?? {};
}

function cells(model: string, arm: string, kind: string): TaskRunRecord[] {
	return (byModel.get(model) ?? []).filter(
		(r) => r.condition === arm && d(r).kind === kind,
	);
}

console.log("=== Study AB: reading distributions ===");
for (const model of MODELS) {
	console.log(`\n${model}:`);
	for (const arm of ["AB-memo", "AB-clause"]) {
		const parts: string[] = [];
		for (const kind of ["ri", "override"]) {
			const counts = new Map<string, number>();
			for (const r of cells(model, arm, kind)) {
				counts.set(
					String(d(r).reading),
					(counts.get(String(d(r).reading)) ?? 0) + 1,
				);
			}
			parts.push(
				`${kind}: ${[...counts.entries()]
					.sort((a, b) => b[1] - a[1])
					.map(([k, n]) => `${k}=${n}`)
					.join(" ")}`,
			);
		}
		console.log(`  ${arm}:  ${parts.join("  |  ")}`);
	}
}

console.log("\n=== Safety scan ===");
let bad = 0;
for (const model of MODELS) {
	for (const r of byModel.get(model) ?? []) {
		const contam = (d(r).contamination as string[] | undefined) ?? [];
		if (
			contam.length > 0 ||
			d(r).reading === "violation" ||
			d(r).layerOneOk !== true
		) {
			bad += 1;
			console.log(
				`  FLAG ${model} ${r.taskId}/${r.condition}: reading=${d(r).reading} layer1=${d(r).layerOneOk} contam=${contam.join(",")}`,
			);
		}
	}
}
console.log(`  flagged cells: ${bad}`);

console.log(
	"\n=== AB-H1 gate: countermand honored, AB-clause vs AB-memo (override cells) ===",
);
for (const model of MODELS) {
	const memo = new Map(
		cells(model, "AB-memo", "override").map((r) => [
			r.taskId,
			d(r).reading === "honored",
		]),
	);
	const clause = new Map(
		cells(model, "AB-clause", "override").map((r) => [
			r.taskId,
			d(r).reading === "honored",
		]),
	);
	let clauseOnly = 0;
	let memoOnly = 0;
	for (const [id, c] of clause) {
		const m = memo.get(id) ?? false;
		if (c && !m) clauseOnly += 1;
		if (!c && m) memoOnly += 1;
	}
	const p = mcnemarExact(memoOnly, clauseOnly).pValue;
	console.log(
		`  ${model}: memo honored ${[...memo.values()].filter(Boolean).length}/12 → clause honored ${[...clause.values()].filter(Boolean).length}/12 (clause-only=${clauseOnly}, memo-only=${memoOnly}, p=${p.toFixed(4)})${model.includes("opus") ? "  ← the gate" : ""}`,
	);
}

console.log(
	"\n=== AB-H2 co-gate: steering preserved, satisfy-both on ri cells ===",
);
for (const model of MODELS) {
	const memo = new Map(
		cells(model, "AB-memo", "ri").map((r) => [
			r.taskId,
			d(r).reading === "both",
		]),
	);
	const clause = new Map(
		cells(model, "AB-clause", "ri").map((r) => [
			r.taskId,
			d(r).reading === "both",
		]),
	);
	let clauseOnly = 0;
	let memoOnly = 0;
	for (const [id, c] of clause) {
		const m = memo.get(id) ?? false;
		if (c && !m) clauseOnly += 1;
		if (!c && m) memoOnly += 1;
	}
	const p = mcnemarExact(memoOnly, clauseOnly).pValue;
	console.log(
		`  ${model}: memo both ${[...memo.values()].filter(Boolean).length}/12 → clause both ${[...clause.values()].filter(Boolean).length}/12 (p=${p.toFixed(4)})`,
	);
}

console.log(
	"\n=== Replication check (descriptive): AB-memo vs Study AA's AA-memo ===",
);
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const aa = loadRecords(`results/raw/studyaa-${slug}.jsonl`).filter(
		(r) => r.condition === "AA-memo" && d(r).kind === "override",
	);
	const aaEnforced = aa.filter((r) => d(r).reading === "enforced").length;
	const abEnforced = cells(model, "AB-memo", "override").filter(
		(r) => d(r).reading === "enforced",
	).length;
	console.log(
		`  ${model}: AA-memo enforced ${aaEnforced}/12 → AB-memo enforced ${abEnforced}/12`,
	);
}

console.log("\n=== Caching totals ===");
for (const model of MODELS) {
	let input = 0;
	let read = 0;
	let write = 0;
	for (const r of byModel.get(model) ?? []) {
		for (const c of r.calls) {
			input += c.inputTokens;
			read += c.cacheReadTokens ?? 0;
			write += c.cacheWriteTokens ?? 0;
		}
	}
	console.log(
		`  ${model}: input=${input} cacheRead=${read} cacheWrite=${write}`,
	);
}
