/**
 * Study AI analysis (docs/BRIEF-AI.md): the multiplicity hatch vs
 * the shipped rule across the full ladder. Gates AI-H1..H3.
 *
 *   bun run scripts/analyze-study-ai.ts
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
const SUB_FRONTIER = MODELS.slice(0, 2);
const LEVELS = [0, 1, 2, 3, 4];

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
	records.push(...loadRecords(`results/raw/studyai-${slug}.jsonl`));
}

function d(r: TaskRunRecord): Record<string, unknown> {
	return (r.detail ?? {}) as Record<string, unknown>;
}
function short(model: string): string {
	return model.split("/")[1] as string;
}
function cells(model: string, arm: string, level?: number): TaskRunRecord[] {
	return records.filter(
		(r) =>
			r.model === model &&
			d(r).arm === arm &&
			(level === undefined || d(r).level === level),
	);
}
function outcomes(rows: TaskRunRecord[]): string {
	const counts = new Map<string, number>();
	for (const r of rows) {
		const o = String(d(r).outcome);
		counts.set(o, (counts.get(o) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([o, n]) => `${o} ${n}`)
		.join(", ");
}
function count(rows: TaskRunRecord[], outcome: string): number {
	return rows.filter((r) => d(r).outcome === outcome).length;
}
function pctCi(ok: number, n: number): string {
	const w = wilson(ok, n);
	return `${ok}/${n} (${(100 * w.proportion).toFixed(1)}% [${(100 * w.low).toFixed(1)}%,${(100 * w.high).toFixed(1)}%])`;
}

console.log(
	`# Study AI — the multiplicity hatch (${records.length} records)\n`,
);

console.log("## Outcome distributions by model × arm × level\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const arm of ["AI-control", "AI-rule2"]) {
		for (const level of LEVELS) {
			const rows = cells(model, arm, level);
			if (rows.length === 0) continue;
			console.log(`  ${arm} L${level} (n=${rows.length}): ${outcomes(rows)}`);
		}
	}
	console.log("");
}

const gates: { id: string; pass: boolean; text: string }[] = [];

console.log("## AI-H1 — the rescue (AI-rule2, L3, sub-frontier)\n");
for (const model of SUB_FRONTIER) {
	const rows = cells(model, "AI-rule2", 3);
	const asked = count(rows, "asked");
	const control = count(cells(model, "AI-control", 3), "asked");
	const pass = rows.length >= 15 && asked >= 12;
	console.log(
		`  ${short(model)}: asked ${pctCi(asked, 15)} (control arm: ${control}/15) → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AI-H1 ${short(model)}`,
		pass,
		text: `L3 asked ${asked}/15 (gate >=12; control ${control}/15)`,
	});
}

console.log("\n## AI-H2 — no new tax (AI-rule2, L0+L1 pooled)\n");
for (const model of MODELS) {
	const rule2 = [
		...cells(model, "AI-rule2", 0),
		...cells(model, "AI-rule2", 1),
	];
	const control = [
		...cells(model, "AI-control", 0),
		...cells(model, "AI-control", 1),
	];
	const falseAsks = count(rule2, "asked");
	const r2Solved = new Map(
		rule2.map((r) => [r.taskId, d(r).outcome === "solved"]),
	);
	const cSolved = new Map(
		control.map((r) => [r.taskId, d(r).outcome === "solved"]),
	);
	let r2Only = 0;
	let cOnly = 0;
	for (const [id, ok] of r2Solved) {
		const c = cSolved.get(id);
		if (c === undefined) continue;
		if (ok && !c) r2Only += 1;
		if (!ok && c) cOnly += 1;
	}
	const m = mcnemarExact(r2Only, cOnly);
	const solveOk = m.pValue > 0.05 || r2Only >= cOnly;
	const pass = rule2.length >= 30 && falseAsks <= 3 && solveOk;
	console.log(
		`  ${short(model)}: false asks ${falseAsks}/30, solve ${count(rule2, "solved")}/30 vs control ${count(control, "solved")}/30 (McNemar p=${m.pValue.toFixed(4)}) → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AI-H2 ${short(model)}`,
		pass,
		text: `false asks ${falseAsks}/30 (gate <=3), solve parity p=${m.pValue.toFixed(4)}`,
	});
}

console.log("\n## AI-H3 — boundary non-regression (L4 all models; L3 opus)\n");
for (const model of MODELS) {
	const rows = cells(model, "AI-rule2", 4);
	const asked = count(rows, "asked");
	const pass = rows.length >= 15 && asked >= 12;
	console.log(
		`  ${short(model)} L4: asked ${pctCi(asked, 15)} → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AI-H3 ${short(model)} L4`,
		pass,
		text: `L4 asked ${asked}/15 (gate >=12)`,
	});
}
{
	const opus = MODELS[2] as string;
	const rows = cells(opus, "AI-rule2", 3);
	const asked = count(rows, "asked");
	const pass = rows.length >= 15 && asked >= 12;
	console.log(
		`  ${short(opus)} L3 (non-regression): asked ${pctCi(asked, 15)} → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AI-H3 ${short(opus)} L3`,
		pass,
		text: `opus L3 asked ${asked}/15 (gate >=12)`,
	});
}

console.log(
	"\n## AI-H4 — descriptive: L2 asks, ask quality, residual anatomy, AE replication\n",
);
for (const model of MODELS) {
	const l2 = cells(model, "AI-rule2", 2);
	const l3 = cells(model, "AI-rule2", 3);
	const asks = l3.filter((r) => d(r).outcome === "asked");
	const namesBoth = asks.filter((r) => d(r).askNamesBoth === true).length;
	console.log(
		`  ${short(model)}: L2 rule2 → ${outcomes(l2)}; L3 asks naming both ids ${namesBoth}/${asks.length}; L3 residuals → ${outcomes(l3.filter((r) => d(r).outcome !== "asked")) || "none"}`,
	);
}
console.log("\n  AE replication (control arm, L3 asked):");
for (const model of MODELS) {
	console.log(
		`  ${short(model)}: ${count(cells(model, "AI-control", 3), "asked")}/15 (AE published: opus 15, sonnet 1, gemini 1)`,
	);
}

const inTok = records.reduce((s, r) => s + r.totalInputTokens, 0);
const outTok = records.reduce((s, r) => s + r.totalOutputTokens, 0);
console.log(
	`\n## Totals\n  ${records.length} records, ${inTok.toLocaleString()} in + ${outTok.toLocaleString()} out\n`,
);

console.log("## Pre-registered gates\n");
for (const gate of gates) {
	console.log(`  ${gate.pass ? "PASS" : "FAIL"}  ${gate.id}: ${gate.text}`);
}
if (gates.length === 9) {
	const allPass = gates.every((g) => g.pass);
	console.log(
		`\n  STUDY GATE (AI-H1..H3): ${allPass ? "PASS — the clause is a measured ship candidate" : "FAIL — see rows"}`,
	);
} else {
	console.log("\n  (incomplete — some gates not yet evaluable)");
}
