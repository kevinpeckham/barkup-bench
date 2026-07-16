/**
 * Study AF analysis (docs/BRIEF-AF.md, Track 2 — JUDGE-GRADED, never
 * pooled with deterministic studies): restate-before-rewrite arms vs
 * the contemporaneous control, gates AF-H1/AF-H2, compliance and
 * proxy descriptives.
 *
 *   bun run scripts/analyze-study-af.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { PRIMARY_JUDGE, SENSITIVITY_JUDGE } from "../src/judging/judge.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";

const EDITORS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS = ["AF-memo-restate", "AF-view-restate"];
const ALL_ARMS = ["AF-control", ...ARMS];

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
		...loadJsonl<TaskRunRecord>(`results/raw/studyaf-edits-${slug}.jsonl`),
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
	judgeRecords.set(judge, loadJsonl(`results/raw/studyaf-judge-${slug}.jsonl`));
}

function short(model: string): string {
	return model.split("/")[1] as string;
}

console.log(
	"# Study AF — restate-before-rewrite (Track 2, JUDGE-GRADED — never pool with deterministic studies)\n",
);

console.log("## Layer 1: mechanical validity (30 tasks per cell)\n");
for (const model of EDITORS) {
	const parts = ALL_ARMS.map((arm) => {
		const rows = edits.filter((r) => r.model === model && r.condition === arm);
		return `${arm} ${rows.filter((r) => r.success).length}/${rows.length}`;
	});
	console.log(`  ${short(model)}: ${parts.join(" · ")}`);
}

console.log("\n## GOAL-line compliance (restate arms; registered regex)\n");
for (const model of EDITORS) {
	const parts = ARMS.map((arm) => {
		const rows = edits.filter((r) => r.model === model && r.condition === arm);
		const compliant = rows.filter(
			(r) => r.detail?.goalCompliant === true,
		).length;
		return `${arm} ${compliant}/${rows.length}`;
	});
	console.log(`  ${short(model)}: ${parts.join(" · ")}`);
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
	console.log(`  ${short(model)}: ${parts.join(" · ")}`);
}

interface Tally {
	win: number;
	loss: number;
	tie: number;
	autoWin: number;
	autoLoss: number;
	excluded: number;
}
function tally(judge: string, editor: string, arm: string): Tally {
	const rows = (judgeRecords.get(judge) ?? []).filter(
		(r) => r.editorModel === editor && r.arm === arm,
	);
	return {
		win: rows.filter((r) => r.verdict === "A").length,
		loss: rows.filter((r) => r.verdict === "B").length,
		tie: rows.filter((r) => r.verdict === "tie").length,
		autoWin: rows.filter((r) => r.verdict === "auto-arm-wins").length,
		autoLoss: rows.filter((r) => r.verdict === "auto-arm-loses").length,
		excluded: rows.filter((r) => r.verdict === "excluded-both-failed").length,
	};
}

console.log("\n## Win / Loss / Tie vs contemporaneous control, per judge\n");
for (const judge of [PRIMARY_JUDGE, SENSITIVITY_JUDGE]) {
	console.log(
		`### ${judge}${judge === PRIMARY_JUDGE ? " (primary)" : " (sensitivity)"}`,
	);
	for (const editor of EDITORS) {
		for (const arm of ARMS) {
			const t = tally(judge, editor, arm);
			const auto =
				t.autoWin + t.autoLoss + t.excluded > 0
					? ` (auto W/L/X ${t.autoWin}/${t.autoLoss}/${t.excluded})`
					: "";
			console.log(
				`  ${short(editor)} ${arm}: ${t.win}/${t.loss}/${t.tie}${auto}`,
			);
		}
	}
	console.log("");
}

// Gates: per editor, arm not significantly control-favored under the
// PRIMARY judge (exact binomial on decisive pairs incl. auto-rules).
const gates: { id: string; pass: boolean; text: string }[] = [];
for (const [hyp, arm] of [
	["AF-H1", "AF-view-restate"],
	["AF-H2", "AF-memo-restate"],
] as const) {
	for (const editor of EDITORS) {
		const t = tally(PRIMARY_JUDGE, editor, arm);
		const wins = t.win + t.autoWin;
		const losses = t.loss + t.autoLoss;
		const p = mcnemarExact(wins, losses).pValue;
		const controlFavored = losses > wins && p <= 0.05;
		const pass = !controlFavored;
		gates.push({
			id: `${hyp} ${short(editor)}`,
			pass,
			text: `${arm} W/L ${wins}/${losses} (ties ${t.tie}), sign p=${p.toFixed(4)}${controlFavored ? " control-favored" : ""}`,
		});
	}
}

console.log("## Judge agreement (decisive verdicts, both judged)\n");
{
	let agree = 0;
	let total = 0;
	const primary = judgeRecords.get(PRIMARY_JUDGE) ?? [];
	const sens = new Map(
		(judgeRecords.get(SENSITIVITY_JUDGE) ?? []).map((r) => [
			`${r.taskId}::${r.editorModel}::${r.arm}`,
			r.verdict,
		]),
	);
	for (const r of primary) {
		const other = sens.get(`${r.taskId}::${r.editorModel}::${r.arm}`);
		if (!other) continue;
		if (!["A", "B", "tie"].includes(r.verdict)) continue;
		total += 1;
		if (r.verdict === other) agree += 1;
	}
	console.log(
		`  ${agree}/${total} (${total > 0 ? ((100 * agree) / total).toFixed(1) : "0"}%)\n`,
	);
}

console.log("## Pre-registered gates (primary judge)\n");
for (const gate of gates) {
	console.log(`  ${gate.pass ? "PASS" : "FAIL"}  ${gate.id}: ${gate.text}`);
}
if (gates.length === 6) {
	const h1 = gates.filter((g) => g.id.startsWith("AF-H1"));
	const h2 = gates.filter((g) => g.id.startsWith("AF-H2"));
	console.log(
		`\n  AF-H1 (view rescue): ${h1.every((g) => g.pass) ? "PASS on all editors" : "FAIL"}`,
	);
	console.log(
		`  AF-H2 (shipped clause keeps memo parity): ${h2.every((g) => g.pass) ? "PASS on all editors" : "FAIL"}`,
	);
}

const inTok = edits.reduce((s, r) => s + r.totalInputTokens, 0);
const outTok = edits.reduce((s, r) => s + r.totalOutputTokens, 0);
console.log(
	`\n## Totals (edit side)\n  ${edits.length} edit records, ${inTok.toLocaleString()} in + ${outTok.toLocaleString()} out (judge tokens in their own JSONL, excluded from the cache-audit invariant as in Study V)\n`,
);
