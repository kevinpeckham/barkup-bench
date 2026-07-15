/**
 * Study AE analysis (docs/BRIEF-AE.md): the calibration ladder and
 * the resume loop, gates AE-H1..H4.
 *
 *   bun run scripts/analyze-study-ae.ts
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
	records.push(...loadRecords(`results/raw/studyae-${slug}.jsonl`));
}

function d(r: TaskRunRecord): Record<string, unknown> {
	return (r.detail ?? {}) as Record<string, unknown>;
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
function short(model: string): string {
	return model.split("/")[1] as string;
}

console.log(
	`# Study AE — hatch calibration + resume loop (${records.length} records)\n`,
);

console.log("## Outcome distributions by model × arm × level\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const arm of ["AE-base", "AE-rule"]) {
		for (const level of LEVELS) {
			const rows = cells(model, arm, level);
			if (rows.length === 0) continue;
			console.log(`  ${arm} L${level} (n=${rows.length}): ${outcomes(rows)}`);
		}
	}
	const resume = cells(model, "AE-resume");
	if (resume.length > 0) {
		console.log(`  AE-resume (n=${resume.length}): ${outcomes(resume)}`);
	}
	console.log("");
}

const gates: { id: string; pass: boolean; text: string }[] = [];

console.log("## AE-H1 — no interrogation tax (AE-rule, L0+L1 pooled)\n");
for (const model of MODELS) {
	const rule = [...cells(model, "AE-rule", 0), ...cells(model, "AE-rule", 1)];
	const base = [...cells(model, "AE-base", 0), ...cells(model, "AE-base", 1)];
	const falseAsks = count(rule, "asked");
	const ruleSolved = new Map(
		rule.map((r) => [r.taskId, d(r).outcome === "solved"]),
	);
	const baseSolved = new Map(
		base.map((r) => [r.taskId, d(r).outcome === "solved"]),
	);
	let ruleOnly = 0;
	let baseOnly = 0;
	for (const [id, ok] of ruleSolved) {
		const b = baseSolved.get(id);
		if (b === undefined) continue;
		if (ok && !b) ruleOnly += 1;
		if (!ok && b) baseOnly += 1;
	}
	const m = mcnemarExact(ruleOnly, baseOnly);
	const solveOk = m.pValue > 0.05 || ruleOnly >= baseOnly;
	const pass = rule.length >= 30 && falseAsks <= 3 && solveOk;
	console.log(
		`  ${short(model)}: false asks ${falseAsks}/30, solve rule ${pctCi(count(rule, "solved"), rule.length)} vs base ${pctCi(count(base, "solved"), base.length)} (McNemar p=${m.pValue.toFixed(4)}) → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AE-H1 ${short(model)}`,
		pass,
		text: `false asks ${falseAsks}/30 (gate <=3), solve parity p=${m.pValue.toFixed(4)}`,
	});
}

console.log("\n## AE-H2 — ambiguity detection (AE-rule, L3)\n");
for (const model of MODELS) {
	const rule = cells(model, "AE-rule", 3);
	const base = cells(model, "AE-base", 3);
	const asked = count(rule, "asked");
	const pass = rule.length >= 15 && asked >= 12;
	console.log(
		`  ${short(model)}: asked ${pctCi(asked, 15)} (base arm: ${outcomes(base)}) → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AE-H2 ${short(model)}`,
		pass,
		text: `L3 asked ${asked}/15 (gate >=12)`,
	});
}

console.log("\n## AE-H3 — hard-boundary replication (AE-rule, L4)\n");
for (const model of MODELS) {
	const rule = cells(model, "AE-rule", 4);
	const asked = count(rule, "asked");
	const pass = rule.length >= 15 && asked >= 12;
	console.log(
		`  ${short(model)}: asked ${pctCi(asked, 15)} → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AE-H3 ${short(model)}`,
		pass,
		text: `L4 asked ${asked}/15 (gate >=12)`,
	});
}

console.log("\n## AE-H4 — the loop closes (AE-resume)\n");
for (const model of MODELS) {
	const resume = cells(model, "AE-resume");
	const solved = count(resume, "resumed-solved");
	const pass = resume.length >= 45 && solved >= 42;
	console.log(
		`  ${short(model)}: resumed-solved ${pctCi(solved, 45)}; re-asked ${count(resume, "re-asked")}, resumed-wrong ${count(resume, "resumed-wrong")}, never-asked ${resume.filter((r) => d(r).asked === false).length} → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AE-H4 ${short(model)}`,
		pass,
		text: `resumed-solved ${solved}/45 (gate >=42)`,
	});
}

console.log("\n## L2 — discretionary values (descriptive, never gated)\n");
for (const model of MODELS) {
	for (const arm of ["AE-base", "AE-rule"]) {
		const rows = cells(model, arm, 2);
		if (rows.length === 0) continue;
		console.log(`  ${short(model)} ${arm}: ${outcomes(rows)}`);
	}
}

console.log("\n## L3 detail — guess anatomy and ask quality (descriptive)\n");
for (const model of MODELS) {
	const base = cells(model, "AE-base", 3);
	const rule = cells(model, "AE-rule", 3);
	const asks = rule.filter((r) => d(r).outcome === "asked");
	const namesBoth = asks.filter((r) => d(r).askNamesBoth === true).length;
	console.log(
		`  ${short(model)}: base → ${outcomes(base)}; rule asks naming both candidates ${namesBoth}/${asks.length}`,
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
if (gates.length === 12) {
	const allPass = gates.every((g) => g.pass);
	console.log(
		`\n  STUDY GATE (AE-H1..H4, all models): ${allPass ? "PASS" : "FAIL — see rows"}`,
	);
} else {
	console.log("\n  (incomplete — some gates not yet evaluable)");
}
