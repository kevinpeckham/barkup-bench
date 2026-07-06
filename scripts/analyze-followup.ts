/**
 * Study G analysis (docs/BRIEF-G.md): follow-up execution rate by
 * model × arm × depth; paired McNemar for the pre-registered
 * comparisons (G-H1 depth effect on G1; G-H2/H3 arm-vs-G1@2; G-H4
 * G5-vs-G1); failure classification from transcripts.
 *
 *   bun run scripts/analyze-followup.ts results/raw/followup-*.jsonl
 */
import { readFileSync } from "node:fs";
import type { FollowupRecord } from "../src/harness/followup-runner.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const paths = process.argv.slice(2);
if (paths.length === 0) {
	throw new Error("usage: bun run scripts/analyze-followup.ts <jsonl> ...");
}

const records: FollowupRecord[] = paths.flatMap((path) =>
	readFileSync(path, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as FollowupRecord),
);

const models = [...new Set(records.map((r) => r.model))].sort();

function pct(x: number): string {
	return Number.isNaN(x) ? "—" : `${(100 * x).toFixed(1)}%`;
}

/** Cells where phase 1 succeeded — the primary denominator. */
function eligible(rows: FollowupRecord[]): FollowupRecord[] {
	return rows.filter((r) => r.phase1Ok && r.error === undefined);
}

function cell(model: string, arm: string, depth: number): FollowupRecord[] {
	return eligible(
		records.filter(
			(r) => r.model === model && r.arm === arm && r.depth === depth,
		),
	);
}

function rateLine(rows: FollowupRecord[]): string {
	const ok = rows.filter((r) => r.finalApplied).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${pct(w.proportion)} [${pct(w.low)},${pct(w.high)}])`;
}

function pairedByTask(
	a: FollowupRecord[],
	b: FollowupRecord[],
): {
	n: number;
	aOnly: number;
	bOnly: number;
	p: number;
	aRate: number;
	bRate: number;
} {
	const byTask = new Map<string, { a?: boolean; b?: boolean }>();
	for (const r of a) {
		byTask.set(r.taskId, {
			...(byTask.get(r.taskId) ?? {}),
			a: r.finalApplied,
		});
	}
	for (const r of b) {
		byTask.set(r.taskId, {
			...(byTask.get(r.taskId) ?? {}),
			b: r.finalApplied,
		});
	}
	let n = 0;
	let aPass = 0;
	let bPass = 0;
	let aOnly = 0;
	let bOnly = 0;
	for (const entry of byTask.values()) {
		if (entry.a === undefined || entry.b === undefined) continue;
		n += 1;
		if (entry.a) aPass += 1;
		if (entry.b) bPass += 1;
		if (entry.a && !entry.b) aOnly += 1;
		if (!entry.a && entry.b) bOnly += 1;
	}
	return {
		n,
		aOnly,
		bOnly,
		p: mcnemarExact(aOnly, bOnly).pValue,
		aRate: aPass / n,
		bRate: bPass / n,
	};
}

const errors = records.filter((r) => r.error !== undefined);
const phase1Fails = records.filter((r) => r.error === undefined && !r.phase1Ok);
console.log(
	`# Study G analysis — ${records.length} records, ${errors.length} harness errors, ${phase1Fails.length} phase-1 failures (excluded)\n`,
);

console.log(
	"## Final-edit execution rate by model × arm × depth (phase-1-ok cells)",
);
for (const model of models) {
	console.log(`\n  ${model}`);
	for (const [arm, depths] of [
		["G1", [0, 2, 6]],
		["G5", [0, 2, 6]],
		["G2", [2]],
		["G3", [2]],
		["G4", [2]],
	] as [string, number[]][]) {
		const line = depths
			.map((d) => `N=${d}: ${rateLine(cell(model, arm, d))}`)
			.join("  ");
		console.log(`    ${arm}: ${line}`);
	}
}

console.log("\n## G-H1 — depth effect on tools baseline (G1 N=6 vs N=0)");
for (const model of models) {
	const r = pairedByTask(cell(model, "G1", 6), cell(model, "G1", 0));
	console.log(
		`  ${model}: N6 ${pct(r.aRate)} vs N0 ${pct(r.bRate)}  discordant ${r.aOnly}/${r.bOnly}  p=${r.p.toFixed(4)} (n=${r.n})`,
	);
}

console.log("\n## G-H2/H3 — mitigation arms vs G1 at N=2");
for (const model of models) {
	for (const arm of ["G2", "G3", "G4"]) {
		const r = pairedByTask(cell(model, arm, 2), cell(model, "G1", 2));
		console.log(
			`  ${model} ${arm} vs G1: ${pct(r.aRate)} vs ${pct(r.bRate)}  Δ=${(100 * (r.aRate - r.bRate)).toFixed(1)}pp  discordant ${r.aOnly}/${r.bOnly}  p=${r.p.toFixed(4)}`,
		);
	}
}

console.log("\n## G-H4 — interface control (G5 vs G1, by depth)");
for (const model of models) {
	for (const depth of [0, 2, 6]) {
		const r = pairedByTask(cell(model, "G5", depth), cell(model, "G1", depth));
		console.log(
			`  ${model} N=${depth}: G5 ${pct(r.aRate)} vs G1 ${pct(r.bRate)}  discordant ${r.aOnly}/${r.bOnly}  p=${r.p.toFixed(4)}`,
		);
	}
}

console.log("\n## Failure anatomy (tools arms, phase-1 ok, final not applied)");
for (const model of models) {
	const fails = eligible(
		records.filter(
			(r) => r.model === model && r.arm !== "G5" && !r.finalApplied,
		),
	);
	const noAction = fails.filter((r) => r.actedInFinalTurn === false).length;
	const actedWrong = fails.filter((r) => r.actedInFinalTurn === true).length;
	console.log(
		`  ${model}: ${fails.length} failures — no action in final turn: ${noAction}; acted but wrong: ${actedWrong}`,
	);
}

console.log("\n## Tokens (mean per cell, by arm; all models pooled)");
for (const arm of ["G1", "G2", "G3", "G4", "G5"]) {
	const rows = eligible(records.filter((r) => r.arm === arm && r.depth === 2));
	if (rows.length === 0) continue;
	const mean =
		rows.reduce((s, r) => s + r.totalInputTokens + r.totalOutputTokens, 0) /
		rows.length;
	console.log(`  ${arm} (N=2): ${Math.round(mean).toLocaleString()} tokens`);
}
