/**
 * Study AG analysis (docs/BRIEF-AG.md): the shipped hatch on the
 * anaphora construction, plus the echo-tax co-check. Gates AG-H1..H3.
 *
 *   bun run scripts/analyze-study-ag.ts
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
const KINDS = ["that", "same", "undo"];

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
	records.push(...loadRecords(`results/raw/studyag-${slug}.jsonl`));
}

function d(r: TaskRunRecord): Record<string, unknown> {
	return (r.detail ?? {}) as Record<string, unknown>;
}
function short(model: string): string {
	return model.split("/")[1] as string;
}
function scorable(r: TaskRunRecord): boolean {
	return typeof d(r).blocked !== "string";
}
function cells(model: string, arm: string, anaphora: boolean): TaskRunRecord[] {
	return records.filter(
		(r) =>
			r.model === model &&
			r.condition === arm &&
			scorable(r) &&
			(anaphora ? d(r).anaphora != null : d(r).anaphora == null),
	);
}
function asks(rows: TaskRunRecord[]): number {
	return rows.filter((r) => d(r).asked === true).length;
}
function ok(rows: TaskRunRecord[]): number {
	return rows.filter((r) => r.success).length;
}
function pctCi(x: number, n: number): string {
	const w = wilson(x, n);
	return `${x}/${n} (${(100 * w.proportion).toFixed(1)}% [${(100 * w.low).toFixed(1)}%,${(100 * w.high).toFixed(1)}%])`;
}

console.log(`# Study AG — the anaphora hatch (${records.length} records)\n`);

console.log(
	"## Anaphora cells by model × arm (asked / solved / silent-wrong)\n",
);
for (const model of MODELS) {
	for (const arm of ["X-stateless", "AG-stateless-hatch", "AG-echo-hatch"]) {
		const rows = cells(model, arm, true);
		const silent = rows.filter(
			(r) => !r.success && d(r).asked !== true && d(r).validButWrong === true,
		).length;
		console.log(
			`  ${short(model)} ${arm}: asked ${asks(rows)}/${rows.length} · solved ${ok(rows)} · silent-wrong ${silent}`,
		);
	}
}

const gates: { id: string; pass: boolean; text: string }[] = [];

console.log("\n## AG-H1 — the hatch fires on anaphora (AG-stateless-hatch)\n");
for (const model of MODELS) {
	const rows = cells(model, "AG-stateless-hatch", true);
	const asked = asks(rows);
	const pass = rows.length >= 40 && asked >= 31;
	console.log(
		`  ${short(model)}: asked ${pctCi(asked, rows.length)} → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AG-H1 ${short(model)}`,
		pass,
		text: `anaphora asked ${asked}/${rows.length} (gate >=31/48)`,
	});
}

console.log("\n## AG-H2 — no tax under the shipped stack (AG-echo-hatch)\n");
for (const model of MODELS) {
	const ana = cells(model, "AG-echo-hatch", true);
	const ord = cells(model, "AG-echo-hatch", false);
	const falseAna = asks(ana);
	const falseOrd = asks(ord);
	const solved = ok(ana);
	const pass =
		ana.length >= 40 && falseAna <= 4 && solved >= 45 && falseOrd <= 5;
	console.log(
		`  ${short(model)}: anaphora asks ${falseAna}/${ana.length}, anaphora solved ${pctCi(solved, ana.length)}, ordinary asks ${falseOrd}/${ord.length} → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AG-H2 ${short(model)}`,
		pass,
		text: `echo+hatch: asks ${falseAna}/48 (gate <=4), solved ${solved}/48 (gate >=45), ordinary asks ${falseOrd}/96 (gate <=5)`,
	});
}

console.log(
	"\n## AG-H3 — ordinary steps undisturbed (AG-stateless-hatch vs control)\n",
);
for (const model of MODELS) {
	const hatch = cells(model, "AG-stateless-hatch", false);
	const control = cells(model, "X-stateless", false);
	const falseOrd = asks(hatch);
	const h = new Map(hatch.map((r) => [r.taskId, r.success]));
	const c = new Map(control.map((r) => [r.taskId, r.success]));
	let hOnly = 0;
	let cOnly = 0;
	for (const [id, okH] of h) {
		const okC = c.get(id);
		if (okC === undefined) continue;
		if (okH && !okC) hOnly += 1;
		if (!okH && okC) cOnly += 1;
	}
	const m = mcnemarExact(hOnly, cOnly);
	const solveOk = m.pValue > 0.05 || hOnly >= cOnly;
	const pass = hatch.length >= 90 && falseOrd <= 5 && solveOk;
	console.log(
		`  ${short(model)}: ordinary asks ${falseOrd}/${hatch.length}, solve ${ok(hatch)}/${hatch.length} vs control ${ok(control)}/${control.length} (McNemar p=${m.pValue.toFixed(4)}) → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AG-H3 ${short(model)}`,
		pass,
		text: `ordinary asks ${falseOrd}/96 (gate <=5), solve parity p=${m.pValue.toFixed(4)}`,
	});
}

console.log(
	"\n## AG-H4 — descriptive: kind splits, ask quality, control replication\n",
);
for (const model of MODELS) {
	const rows = cells(model, "AG-stateless-hatch", true);
	const kindParts = KINDS.map(
		(k) =>
			`${k} ${asks(rows.filter((r) => d(r).anaphora === k))}/${rows.filter((r) => d(r).anaphora === k).length}`,
	).join("  ");
	const askRows = rows.filter((r) => d(r).asked === true);
	const quality = askRows.filter((r) =>
		/previous|last|earlier/i.test(String(d(r).askText ?? "")),
	).length;
	console.log(
		`  ${short(model)}: asks by kind → ${kindParts}; asks referencing the prior edit ${quality}/${askRows.length}`,
	);
}
console.log(
	"\n  control replication (X-stateless anaphora, solved / silent-wrong):",
);
for (const model of MODELS) {
	const rows = cells(model, "X-stateless", true);
	const silent = rows.filter(
		(r) => !r.success && d(r).validButWrong === true,
	).length;
	console.log(
		`  ${short(model)}: solved ${ok(rows)}/${rows.length}, silent-wrong ${silent} (X published: 0/48 solved, all silent)`,
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
		`\n  STUDY GATE (AG-H1..H3): ${allPass ? "PASS" : "FAIL — see rows"}`,
	);
} else {
	console.log("\n  (incomplete — some gates not yet evaluable)");
}
