/**
 * Study AC analysis (docs/BRIEF-AC.md): outcome distributions, the
 * AC-H1 gate (asked > half on unsolvable cells, exact binomial), the
 * AC-H2 co-gate (false-ask ≤ 10% and solve parity on solvable
 * cells), and the descriptive splits.
 *
 *   bun run scripts/analyze-study-ac.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";

const MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS = ["AC-base", "AC-rule", "AC-tool"] as const;

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
	byModel.set(model, loadRecords(`results/raw/studyac-${slug}.jsonl`));
}

function d(r: TaskRunRecord): Record<string, unknown> {
	return r.detail ?? {};
}

function cells(model: string, arm: string, view: string): TaskRunRecord[] {
	return (byModel.get(model) ?? []).filter(
		(r) => d(r).arm === arm && d(r).view === view,
	);
}

function count(rows: TaskRunRecord[], outcome: string): number {
	return rows.filter((r) => d(r).outcome === outcome).length;
}

/** One-sided exact binomial P(X >= k) for p = 0.5. */
function binomialAtLeast(k: number, n: number): number {
	let logC = 0;
	let sum = 0;
	for (let i = 0; i <= n; i += 1) {
		if (i >= k) sum += Math.exp(logC - n * Math.LN2);
		logC += Math.log(n - i) - Math.log(i + 1);
	}
	return Math.min(1, sum);
}

console.log("=== Study AC: outcome distributions ===");
for (const model of MODELS) {
	console.log(`\n${model} (${(byModel.get(model) ?? []).length} cells):`);
	for (const view of ["view1", "view2"]) {
		for (const arm of ARMS) {
			const rows = cells(model, arm, view);
			console.log(
				`  ${arm} ${view === "view1" ? "unsolvable" : "solvable  "}: asked=${count(rows, "asked")} solved=${count(rows, "solved")} wrong-patch=${count(rows, "wrong-patch")} invalid=${count(rows, "invalid")}`,
			);
		}
	}
}

console.log(
	"\n=== AC-H1 gate: asked ≥ 29/45 on unsolvable cells (exact binomial vs 0.5) ===",
);
const h1Pass = new Map<string, Set<string>>();
for (const mech of ["AC-rule", "AC-tool"]) {
	h1Pass.set(mech, new Set());
	for (const model of MODELS) {
		const rows = cells(model, mech, "view1");
		const asked = count(rows, "asked");
		const p = binomialAtLeast(asked, rows.length);
		const pass = asked >= 29 && rows.length === 45;
		if (pass) h1Pass.get(mech)?.add(model);
		console.log(
			`  ${mech} ${model}: asked ${asked}/${rows.length} (p=${p.toFixed(5)}) ${pass ? "PASS" : "fail"}`,
		);
	}
}
for (const mech of ["AC-rule", "AC-tool"]) {
	console.log(
		`  ${mech}: passes on ${h1Pass.get(mech)?.size}/3 models${(h1Pass.get(mech)?.size ?? 0) === 3 ? "  ← mechanism passes AC-H1" : ""}`,
	);
}

console.log(
	"\n=== AC-H2 co-gate: false-ask ≤ 4/45 AND solve parity (solvable cells) ===",
);
for (const mech of ["AC-rule", "AC-tool"]) {
	for (const model of MODELS) {
		const rows = cells(model, mech, "view2");
		const falseAsks = count(rows, "asked");
		const solved = count(rows, "solved");
		const base = new Map(
			cells(model, "AC-base", "view2").map((r) => [
				r.taskId,
				d(r).outcome === "solved",
			]),
		);
		const hatch = new Map(
			rows.map((r) => [r.taskId, d(r).outcome === "solved"]),
		);
		let baseOnly = 0;
		let hatchOnly = 0;
		for (const [id, h] of hatch) {
			const b = base.get(id) ?? false;
			if (h && !b) hatchOnly += 1;
			if (!h && b) baseOnly += 1;
		}
		const p = mcnemarExact(baseOnly, hatchOnly).pValue;
		const pass = falseAsks <= 4 && (p > 0.05 || hatchOnly >= baseOnly);
		console.log(
			`  ${mech} ${model}: false-asks ${falseAsks}/45, solved ${solved}/45 vs base ${count(cells(model, "AC-base", "view2"), "solved")}/45 (base-only=${baseOnly}, hatch-only=${hatchOnly}, p=${p.toFixed(4)}) ${pass ? "PASS" : "fail"}`,
		);
	}
}

console.log("\n=== AC-H3 (descriptive) ===");
for (const model of MODELS) {
	for (const mech of ["AC-rule", "AC-tool"]) {
		const rows = cells(model, mech, "view1");
		const asks = rows.filter((r) => d(r).outcome === "asked");
		const named = asks.filter((r) => d(r).askNamesSource === true).length;
		const byKind = ["value", "structure"].map((k) => {
			const kindRows = rows.filter((r) => d(r).depKind === k);
			return `${k}: asked ${count(kindRows, "asked")}/${kindRows.length}`;
		});
		console.log(
			`  ${model} ${mech}: asks naming the source ${named}/${asks.length}; ${byKind.join(", ")}`,
		);
	}
}

console.log("\n=== Residual guesses under a hatch (unsolvable cells) ===");
for (const model of MODELS) {
	for (const mech of ["AC-rule", "AC-tool"]) {
		const rows = cells(model, mech, "view1");
		console.log(
			`  ${model} ${mech}: wrong-patch ${count(rows, "wrong-patch")}, invalid ${count(rows, "invalid")}`,
		);
	}
}
