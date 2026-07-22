/**
 * Study AN analysis (docs/BRIEF-AN.md): does tool availability (or the
 * registered fetch-before-ask clause) dissolve AG's visibility-clause
 * tax without eroding genuine asks? Gates AN-H1..H5 + H6 descriptives.
 *
 *   bun run scripts/analyze-study-an.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = [
	"google/gemini-3.5-flash",
	"anthropic/claude-sonnet-4.5",
	"anthropic/claude-opus-4.8",
];
const ARMS = [
	"AN-echo-hatch",
	"AN-tools",
	"AN-tools-clause",
	"AN-noecho-tools-clause",
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
	records.push(...loadRecords(`results/raw/studyan-${slug}.jsonl`));
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
function toolStats(rows: TaskRunRecord[]): string {
	const counts = rows.map((r) => Number(d(r).toolCalls ?? 0));
	const total = counts.reduce((s, c) => s + c, 0);
	const withCalls = counts.filter((c) => c > 0).length;
	const max = counts.reduce((m, c) => Math.max(m, c), 0);
	const unknown = rows.reduce(
		(s, r) => s + Number(d(r).toolUnknownIds ?? 0),
		0,
	);
	return `calls total ${total}, cells-with-calls ${withCalls}/${rows.length}, max/cell ${max}, unknown-ids ${unknown}`;
}

console.log("=== Study AN (docs/BRIEF-AN.md) ===\n");

let h1All = true;
let h4All = true;
let h5All = true;
const h2Pass: Record<string, boolean> = {};
const h3Pass: Record<string, boolean> = {};

for (const model of MODELS) {
	const name = short(model);
	console.log(`--- ${name} ---`);

	// AN-H1: the anchor replicates (control asks ≥ 24/48 on anaphora).
	const ctrl = cells(model, "AN-echo-hatch", true);
	const ctrlAsks = asks(ctrl);
	const h1 = ctrlAsks >= 24;
	if (!h1) h1All = false;
	console.log(
		`AN-H1 control asks: ${pctCi(ctrlAsks, ctrl.length)} → ${h1 ? "PASS" : "FAIL"}`,
	);

	// AN-H2 / AN-H3: success ≥ 45/48 AND asks ≤ 4/48 on anaphora.
	for (const [h, arm, bag] of [
		["AN-H2", "AN-tools", h2Pass],
		["AN-H3", "AN-tools-clause", h3Pass],
	] as const) {
		const rows = cells(model, arm, true);
		const a = asks(rows);
		const s = ok(rows);
		const pass = s >= 45 && a <= 4 && rows.length >= 48;
		bag[model] = pass;
		console.log(
			`${h} ${arm}: success ${pctCi(s, rows.length)}, asks ${a} → ${pass ? "PASS" : "FAIL"} | tools: ${toolStats(rows)}`,
		);
	}

	// AN-H4: protection — no-echo+tools+clause anaphora asks ≥ 31/48.
	const prot = cells(model, "AN-noecho-tools-clause", true);
	const protAsks = asks(prot);
	const silentWrong = prot.filter(
		(r) => d(r).validButWrong === true && d(r).asked !== true,
	).length;
	const h4 = protAsks >= 31;
	if (!h4) h4All = false;
	console.log(
		`AN-H4 protection asks: ${pctCi(protAsks, prot.length)}, silent-wrong ${silentWrong} → ${h4 ? "PASS" : "FAIL"} | tools: ${toolStats(prot)}`,
	);

	// AN-H5: ordinary steps undisturbed in every arm vs control.
	const ctrlOrd = cells(model, "AN-echo-hatch", false);
	for (const arm of ARMS) {
		const rows = cells(model, arm, false);
		const falseAsks = asks(rows);
		let mcnemarNote = "control";
		let pass = falseAsks <= 5;
		if (arm !== "AN-echo-hatch") {
			const pairs = new Map<string, TaskRunRecord>();
			for (const r of ctrlOrd) pairs.set(r.taskId, r);
			let armOnly = 0;
			let ctrlOnly = 0;
			for (const r of rows) {
				const c = pairs.get(r.taskId);
				if (!c) continue;
				if (r.success && !c.success) armOnly += 1;
				if (!r.success && c.success) ctrlOnly += 1;
			}
			const m = mcnemarExact(armOnly, ctrlOnly);
			const notBelow = m.pValue > 0.05 || armOnly >= ctrlOnly;
			mcnemarNote = `Δ +${armOnly}/-${ctrlOnly} p=${m.pValue.toFixed(3)}`;
			pass = pass && notBelow;
		}
		if (!pass) h5All = false;
		console.log(
			`AN-H5 ${arm} ordinary: success ${pctCi(ok(rows), rows.length)}, false asks ${falseAsks} (${mcnemarNote}) → ${pass ? "PASS" : "FAIL"}`,
		);
	}

	// H6 descriptives: asks by kind in control; direct-patch vs fetch.
	for (const kind of ["that", "same", "undo"]) {
		const kindRows = ctrl.filter((r) => d(r).anaphora === kind);
		const toolsRows = cells(model, "AN-tools-clause", true).filter(
			(r) => d(r).anaphora === kind,
		);
		console.log(
			`  H6 ${kind}: control asks ${asks(kindRows)}/${kindRows.length}; tools-clause success ${ok(toolsRows)}/${toolsRows.length}, fetched ${toolsRows.filter((r) => Number(d(r).toolCalls ?? 0) > 0).length}`,
		);
	}
	console.log("");
}

const h2All = MODELS.every((m) => h2Pass[m]);
const h3All = MODELS.every((m) => h3Pass[m]);
console.log("=== Gate summary ===");
console.log(`AN-H1 (anchor) all models: ${h1All ? "PASS" : "FAIL"}`);
console.log(
	`AN-H2 (availability suffices) all models: ${h2All ? "PASS" : "FAIL"}`,
);
console.log(`AN-H3 (clause closes it) all models: ${h3All ? "PASS" : "FAIL"}`);
console.log(`AN-H4 (protection) all models: ${h4All ? "PASS" : "FAIL"}`);
console.log(
	`AN-H5 (ordinary undisturbed) all models: ${h5All ? "PASS" : "FAIL"}`,
);
console.log(
	`STUDY GATE: ${h1All && h4All && h5All && (h2All || h3All) ? "PASS" : "FAIL"}`,
);
