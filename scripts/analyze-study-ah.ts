/**
 * Study AH analysis (docs/BRIEF-AH.md): recall and rule application
 * at the shipped memo cap, full-replace integrity, and the cap-edge
 * taxonomy. Gates AH-H1..H3; AH-H4 descriptive.
 *
 *   bun run scripts/analyze-study-ah.ts
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
	records.push(...loadRecords(`results/raw/studyah-${slug}.jsonl`));
}

function d(r: TaskRunRecord): Record<string, unknown> {
	return (r.detail ?? {}) as Record<string, unknown>;
}
function short(model: string): string {
	return model.split("/")[1] as string;
}
function pctCi(ok: number, n: number): string {
	const w = wilson(ok, n);
	return `${ok}/${n} (${(100 * w.proportion).toFixed(1)}% [${(100 * w.low).toFixed(1)}%,${(100 * w.high).toFixed(1)}%])`;
}
function readCells(
	model: string,
	kind: string,
	nLevel: number,
): TaskRunRecord[] {
	return records.filter(
		(r) => r.model === model && d(r).kind === kind && d(r).nLevel === nLevel,
	);
}
function ok(rows: TaskRunRecord[]): number {
	return rows.filter((r) => r.success).length;
}

console.log(`# Study AH — memo saturation (${records.length} records)\n`);

const gates: { id: string; pass: boolean; text: string }[] = [];

console.log(
	"## Read side: success by model × kind × N (and by position at N=20)\n",
);
for (const model of MODELS) {
	for (const kind of ["recall", "rule"]) {
		const n5 = readCells(model, kind, 5);
		const n20 = readCells(model, kind, 20);
		const byPos = ["first", "middle", "last"]
			.map(
				(p) =>
					`${p} ${ok(n20.filter((r) => d(r).position === p))}/${n20.filter((r) => d(r).position === p).length}`,
			)
			.join("  ");
		// McNemar paired by (position, rep) template across N levels.
		const key = (r: TaskRunRecord) => String(r.taskId).replace(/-n\d+-/, "-");
		const small = new Map(n5.map((r) => [key(r), r.success]));
		let smallOnly = 0;
		let bigOnly = 0;
		for (const r of n20) {
			const s = small.get(key(r));
			if (s === undefined) continue;
			if (s && !r.success) smallOnly += 1;
			if (!s && r.success) bigOnly += 1;
		}
		const m = mcnemarExact(smallOnly, bigOnly);
		console.log(
			`  ${short(model)} ${kind}: N=5 ${pctCi(ok(n5), n5.length)} · N=20 ${pctCi(ok(n20), n20.length)} (${byPos}) McNemar p=${m.pValue.toFixed(4)}`,
		);
	}
}

console.log(
	"\n## AH-H1 — recall at the cap (gate: N=20 >= 13/15 AND no significant drop)\n",
);
for (const model of MODELS) {
	const n20 = readCells(model, "recall", 20);
	const n5 = readCells(model, "recall", 5);
	const key = (r: TaskRunRecord) => String(r.taskId).replace(/-n\d+-/, "-");
	const small = new Map(n5.map((r) => [key(r), r.success]));
	let smallOnly = 0;
	let bigOnly = 0;
	for (const r of n20) {
		const s = small.get(key(r));
		if (s === undefined) continue;
		if (s && !r.success) smallOnly += 1;
		if (!s && r.success) bigOnly += 1;
	}
	const m = mcnemarExact(smallOnly, bigOnly);
	const noDrop = m.pValue > 0.05 || bigOnly >= smallOnly;
	const pass = n20.length >= 15 && ok(n20) >= 13 && noDrop;
	console.log(
		`  ${short(model)}: N=20 recall ${pctCi(ok(n20), 15)}, drop test p=${m.pValue.toFixed(4)} → ${pass ? "PASS" : "FAIL"}`,
	);
	gates.push({
		id: `AH-H1 ${short(model)}`,
		pass,
		text: `recall N=20 ${ok(n20)}/15 (gate >=13), McNemar p=${m.pValue.toFixed(4)}`,
	});
}

console.log(
	"\n## AH-H2 — rules at the cap (gate: N=20 >= 13/15 AND zero contamination)\n",
);
let contaminationTotal = 0;
for (const r of records) {
	const events = (d(r).contamination as string[] | undefined) ?? [];
	contaminationTotal += events.length;
	if (events.length > 0) {
		console.log(`  CONTAMINATION ${r.model} ${r.taskId}: ${events.join(", ")}`);
	}
}
for (const model of MODELS) {
	const n20 = readCells(model, "rule", 20);
	const pass = n20.length >= 15 && ok(n20) >= 13;
	console.log(
		`  ${short(model)}: N=20 rule application ${pctCi(ok(n20), 15)} → ${pass ? "PASS (pending zero-contamination)" : "FAIL"}`,
	);
	gates.push({
		id: `AH-H2 ${short(model)}`,
		pass: pass && contaminationTotal === 0,
		text: `rules N=20 ${ok(n20)}/15 (gate >=13), contamination ${contaminationTotal} (gate 0)`,
	});
}
console.log(`  total contamination events: ${contaminationTotal} (hard zero)`);

console.log(
	"\n## AH-H3 — full-replace integrity where the update fits (gate: >=9/10 per K per model)\n",
);
for (const model of MODELS) {
	for (const k of [10, 19]) {
		const rows = records.filter((r) => r.model === model && d(r).kLevel === k);
		const clean = rows.filter((r) => d(r).outcome === "clean-update").length;
		const pass = rows.length >= 10 && clean >= 9;
		console.log(
			`  ${short(model)} K=${k}: clean updates ${pctCi(clean, rows.length)} → ${pass ? "PASS" : "FAIL"}`,
		);
		gates.push({
			id: `AH-H3 ${short(model)} K=${k}`,
			pass,
			text: `clean ${clean}/${rows.length} (gate >=9/10)`,
		});
	}
}

console.log("\n## AH-H4 — the cap edge (K=20, descriptive taxonomy)\n");
for (const model of MODELS) {
	const rows = records.filter((r) => r.model === model && d(r).kLevel === 20);
	const counts = new Map<string, number>();
	for (const r of rows) {
		const o = String(d(r).outcome);
		counts.set(o, (counts.get(o) ?? 0) + 1);
	}
	const lost = rows.flatMap((r) => (d(r).lost as string[] | undefined) ?? []);
	console.log(
		`  ${short(model)}: ${[...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([o, n]) => `${o} ${n}`)
			.join(
				", ",
			)}${lost.length > 0 ? ` — notes lost post-clamp: ${lost.length}` : " — zero notes lost"}`,
	);
}

console.log(
	"\n## Edit-applied alongside the memo update (integrity cells, report-only)\n",
);
for (const model of MODELS) {
	const rows = records.filter(
		(r) => r.model === model && d(r).kLevel !== undefined,
	);
	const applied = rows.filter((r) => d(r).editApplied === true).length;
	console.log(`  ${short(model)}: ${applied}/${rows.length}`);
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
		`\n  STUDY GATE (AH-H1..H3, all models): ${allPass ? "PASS" : "FAIL — see rows"}`,
	);
} else {
	console.log("\n  (incomplete — some gates not yet evaluable)");
}
