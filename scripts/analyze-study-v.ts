/**
 * Study V analysis (docs/BRIEF-V.md): mechanical layer, win-rates vs
 * control per arm × editor × judge, judge agreement, the V-H2 gate,
 * and the layer-2 proxy triangulation.
 *
 *   bun run scripts/analyze-study-v.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { PRIMARY_JUDGE, SENSITIVITY_JUDGE } from "../src/judging/judge.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";

const EDITORS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const ARMS = ["V-doc-view1", "V-doc-view2", "V-conv-memo", "V-conv-nomemo"];
const ALL_ARMS = ["V-instr", ...ARMS];

function loadJsonl<T>(path: string): T[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((l) => l.trim())
		.map((l) => JSON.parse(l) as T);
}

const edits: TaskRunRecord[] = [];
for (const model of EDITORS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	edits.push(
		...loadJsonl<TaskRunRecord>(`results/raw/studyv-edits-${slug}.jsonl`),
	);
}

interface JudgeRecord {
	taskId: string;
	editorModel: string;
	arm: string;
	verdict: string;
}
const judgeRecords = new Map<string, JudgeRecord[]>();
for (const judge of [PRIMARY_JUDGE, SENSITIVITY_JUDGE]) {
	const slug = judge.replace(/[^a-z0-9.-]+/gi, "_");
	judgeRecords.set(judge, loadJsonl(`results/raw/studyv-judge-${slug}.jsonl`));
}

console.log("# Study V — qualitative strategic rewrites (Track 2)\n");

console.log("## Layer 1: mechanical validity (30 tasks per cell)\n");
for (const model of EDITORS) {
	const parts = ALL_ARMS.map((arm) => {
		const rows = edits.filter((r) => r.model === model && r.condition === arm);
		return `${arm} ${rows.filter((r) => r.success).length}/${rows.length}`;
	});
	console.log(`  ${model}: ${parts.join(" · ")}`);
}

console.log(
	"\n## Layer 2 proxy: mean thesis-word coverage delta (after − before)\n",
);
for (const model of EDITORS) {
	const parts = ALL_ARMS.map((arm) => {
		const rows = edits.filter(
			(r) =>
				r.model === model &&
				r.condition === arm &&
				typeof r.detail?.proxyAfter === "number",
		);
		if (rows.length === 0) return `${arm} —`;
		const delta =
			rows.reduce(
				(s, r) =>
					s + (Number(r.detail?.proxyAfter) - Number(r.detail?.proxyBefore)),
				0,
			) / rows.length;
		return `${arm} ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
	});
	console.log(`  ${model}: ${parts.join(" · ")}`);
}

console.log("\n## Win-rates vs V-instr control (verdict A = arm wins)\n");
const gate = new Map<string, boolean>();
for (const judge of [PRIMARY_JUDGE, SENSITIVITY_JUDGE]) {
	console.log(`### judge: ${judge}`);
	const records = judgeRecords.get(judge) ?? [];
	for (const model of EDITORS) {
		for (const arm of ARMS) {
			const rows = records.filter(
				(r) => r.editorModel === model && r.arm === arm,
			);
			const wins = rows.filter(
				(r) => r.verdict === "A" || r.verdict === "auto-arm-wins",
			).length;
			const losses = rows.filter(
				(r) => r.verdict === "B" || r.verdict === "auto-arm-loses",
			).length;
			const ties = rows.filter((r) => r.verdict === "tie").length;
			const excluded = rows.filter(
				(r) => r.verdict === "excluded-both-failed",
			).length;
			const decisive = wins + losses;
			const p = decisive > 0 ? mcnemarExact(losses, wins).pValue : Number.NaN;
			const line = `  ${model.split("/")[1]} ${arm.padEnd(13)}: W ${wins} / L ${losses} / T ${ties}${excluded ? ` / excl ${excluded}` : ""} — binomial p = ${p.toFixed(4)}`;
			console.log(line);
			if (
				judge === PRIMARY_JUDGE &&
				(arm === "V-doc-view2" || arm === "V-conv-memo")
			) {
				gate.set(`${model}|${arm}`, Number.isNaN(p) ? false : p > 0.05);
			}
		}
	}
	console.log("");
}

console.log("## Judge agreement (shared judged comparisons)\n");
{
	const a = judgeRecords.get(PRIMARY_JUDGE) ?? [];
	const b = new Map(
		(judgeRecords.get(SENSITIVITY_JUDGE) ?? []).map((r) => [
			`${r.taskId}::${r.editorModel}::${r.arm}`,
			r.verdict,
		]),
	);
	let agree = 0;
	let total = 0;
	const counts = new Map<string, number>();
	for (const r of a) {
		if (!["A", "B", "tie"].includes(r.verdict)) continue;
		const other = b.get(`${r.taskId}::${r.editorModel}::${r.arm}`);
		if (!other || !["A", "B", "tie"].includes(other)) continue;
		total += 1;
		if (r.verdict === other) agree += 1;
		counts.set(
			`${r.verdict}|${other}`,
			(counts.get(`${r.verdict}|${other}`) ?? 0) + 1,
		);
	}
	// Cohen's kappa over the 3-way verdict space.
	const cats = ["A", "B", "tie"];
	const rowSum = new Map<string, number>();
	const colSum = new Map<string, number>();
	for (const [key, n] of counts) {
		const [x, y] = key.split("|") as [string, string];
		rowSum.set(x, (rowSum.get(x) ?? 0) + n);
		colSum.set(y, (colSum.get(y) ?? 0) + n);
	}
	const po = total > 0 ? agree / total : Number.NaN;
	let pe = 0;
	for (const c of cats) {
		pe += ((rowSum.get(c) ?? 0) / total) * ((colSum.get(c) ?? 0) / total);
	}
	const kappa = total > 0 ? (po - pe) / (1 - pe) : Number.NaN;
	console.log(
		`  raw agreement ${(po * 100).toFixed(1)}% (n=${total}); Cohen's kappa ${kappa.toFixed(2)} — pre-registered floor: 70% raw`,
	);
}

console.log(
	"\n## Pre-registered gate (V-H2: fixes tie control, primary judge)\n",
);
let gateAll = true;
for (const model of EDITORS) {
	for (const arm of ["V-doc-view2", "V-conv-memo"]) {
		const pass = gate.get(`${model}|${arm}`) ?? false;
		if (!pass) gateAll = false;
		console.log(
			`  ${model.split("/")[1]} ${arm}: ${pass ? "PASS (ties control)" : "FAIL"}`,
		);
	}
}
console.log(`\n  GATE: ${gateAll ? "PASSES" : "FAILS"}`);
