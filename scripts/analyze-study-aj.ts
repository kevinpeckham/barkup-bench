/**
 * Study AJ analysis (docs/BRIEF-AJ.md): recovery by feedback arm,
 * the AJ-H1 gate, dose-response, class splits, failure anatomy.
 *
 *   bun run scripts/analyze-study-aj.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS = ["AJ-structured", "AJ-codes", "AJ-bare"];
const CLASSES = [
	"dangling-id",
	"missing-field",
	"malformed-op",
	"bad-anchor",
	"unknown-attribute",
];

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
	records.push(...loadRecords(`results/raw/studyaj-${slug}.jsonl`));
}

function d(r: TaskRunRecord): Record<string, unknown> {
	return (r.detail ?? {}) as Record<string, unknown>;
}
function short(model: string): string {
	return model.split("/")[1] as string;
}
function cells(model: string, arm: string): TaskRunRecord[] {
	return records.filter((r) => r.model === model && r.condition === arm);
}
function ok(rows: TaskRunRecord[]): number {
	return rows.filter((r) => r.success).length;
}
function pctCi(x: number, n: number): string {
	const w = wilson(x, n);
	return `${x}/${n} (${(100 * w.proportion).toFixed(1)}% [${(100 * w.low).toFixed(1)}%,${(100 * w.high).toFixed(1)}%])`;
}

console.log(
	`# Study AJ — the correction loop in isolation (${records.length} records)\n`,
);

console.log("## Single-shot recovery by model × arm\n");
for (const model of MODELS) {
	const parts = ARMS.map((arm) => `${arm} ${pctCi(ok(cells(model, arm)), 45)}`);
	console.log(`  ${short(model)}: ${parts.join(" · ")}`);
}

const gates: { id: string; pass: boolean; text: string }[] = [];

console.log(
	"\n## AJ-H1 — structured vs bare (gate: significant on >=2 models)\n",
);
let sigWins = 0;
for (const model of MODELS) {
	const s = new Map(
		cells(model, "AJ-structured").map((r) => [r.taskId, r.success]),
	);
	const b = new Map(cells(model, "AJ-bare").map((r) => [r.taskId, r.success]));
	let sOnly = 0;
	let bOnly = 0;
	for (const [id, okS] of s) {
		const okB = b.get(id);
		if (okB === undefined) continue;
		if (okS && !okB) sOnly += 1;
		if (!okS && okB) bOnly += 1;
	}
	const m = mcnemarExact(sOnly, bOnly);
	const sigBetter = sOnly > bOnly && m.pValue < 0.05;
	if (sigBetter) sigWins += 1;
	console.log(
		`  ${short(model)}: structured-only ${sOnly}, bare-only ${bOnly}, p=${m.pValue.toFixed(4)}${sigBetter ? " ← structured significantly better" : ""}`,
	);
}
gates.push({
	id: "AJ-H1",
	pass: sigWins >= 2,
	text: `structured significantly better on ${sigWins}/3 models (gate >=2)`,
});

console.log("\n## AJ-H2 — dose-response (codes arm, descriptive)\n");
for (const model of MODELS) {
	console.log(
		`  ${short(model)}: structured ${ok(cells(model, "AJ-structured"))} >= codes ${ok(cells(model, "AJ-codes"))} >= bare ${ok(cells(model, "AJ-bare"))} ?`,
	);
}

console.log(
	"\n## AJ-H3 — recovery by corruption class × arm (pooled models)\n",
);
for (const cls of CLASSES) {
	const parts = ARMS.map((arm) => {
		const rows = records.filter(
			(r) => r.condition === arm && d(r).corruption === cls,
		);
		return `${arm.replace("AJ-", "")} ${ok(rows)}/${rows.length}`;
	});
	console.log(`  ${cls}: ${parts.join(" · ")}`);
}

console.log("\n## AJ-H4 — failure anatomy: valid-but-wrong by arm (pooled)\n");
for (const arm of ARMS) {
	const rows = records.filter((r) => r.condition === arm);
	const vbw = rows.filter((r) => d(r).outcome === "valid-but-wrong").length;
	const inv = rows.filter((r) => d(r).outcome === "still-invalid").length;
	console.log(`  ${arm}: valid-but-wrong ${vbw}, still-invalid ${inv}`);
}

const inTok = records.reduce((s, r) => s + r.totalInputTokens, 0);
const outTok = records.reduce((s, r) => s + r.totalOutputTokens, 0);
console.log(
	`\n## Totals\n  ${records.length} records, ${inTok.toLocaleString()} in + ${outTok.toLocaleString()} out\n`,
);

console.log("## Pre-registered gate\n");
for (const gate of gates) {
	console.log(`  ${gate.pass ? "PASS" : "FAIL"}  ${gate.id}: ${gate.text}`);
}
