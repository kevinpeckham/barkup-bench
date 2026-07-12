/**
 * Study X analysis (docs/BRIEF-X.md): anaphora cells by arm × kind ×
 * model, the last-edit-note gate, the window-2 question, failure
 * anatomy, and cost.
 *
 *   bun run scripts/analyze-study-x.ts
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
const ARMS = ["X-history", "X-window2", "X-lastedit", "X-stateless"];
const KINDS = ["amend", "repeat", "undo"];

function loadRecords(path: string): TaskRunRecord[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((l) => l.trim())
		.map((l) => JSON.parse(l) as TaskRunRecord);
}

const records: TaskRunRecord[] = [];
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	records.push(...loadRecords(`results/raw/studyx-${slug}.jsonl`));
}

function scorable(r: TaskRunRecord): boolean {
	return typeof r.detail?.blocked !== "string";
}
function anaphoraKind(r: TaskRunRecord): string | null {
	const k = r.detail?.anaphora;
	return typeof k === "string" ? k : null;
}
function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}

console.log("# Study X — edit-anaphora\n");

console.log("## Anaphora cells by arm (48 per arm-model)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const arm of ARMS) {
		const rows = records.filter(
			(r) =>
				r.model === model &&
				r.condition === arm &&
				scorable(r) &&
				anaphoraKind(r) !== null,
		);
		if (rows.length === 0) continue;
		const parts = KINDS.map(
			(k) => `${k} ${pct(rows.filter((r) => anaphoraKind(r) === k))}`,
		);
		console.log(
			`  ${arm.padEnd(12)}: all ${pct(rows)}  |  ${parts.join("  |  ")}`,
		);
	}
	console.log("");
}

console.log("## Anaphora failure anatomy (valid-but-wrong vs no artifact)\n");
for (const model of MODELS) {
	const parts = ARMS.map((arm) => {
		const fails = records.filter(
			(r) =>
				r.model === model &&
				r.condition === arm &&
				scorable(r) &&
				anaphoraKind(r) !== null &&
				!r.success,
		);
		const guessed = fails.filter((r) => r.detail?.validButWrong === true);
		return `${arm} ${guessed.length}/${fails.length} guessed`;
	});
	console.log(`  ${model.split("/")[1]}: ${parts.join(" · ")}`);
}

console.log("\n## Ordinary self-contained steps (control)\n");
for (const model of MODELS) {
	const parts = ARMS.map((arm) => {
		const rows = records.filter(
			(r) =>
				r.model === model &&
				r.condition === arm &&
				scorable(r) &&
				anaphoraKind(r) === null,
		);
		return `${arm} ${rows.filter((r) => r.success).length}/${rows.length}`;
	});
	console.log(`  ${model.split("/")[1]}: ${parts.join(" · ")}`);
}

function mcnemar(
	model: string,
	a: string,
	b: string,
): { aOnly: number; bOnly: number; n: number; p: number } {
	const filter = (r: TaskRunRecord) => scorable(r) && anaphoraKind(r) !== null;
	const base = new Map(
		records
			.filter((r) => r.model === model && r.condition === a && filter(r))
			.map((r) => [r.taskId, r.success] as const),
	);
	let aOnly = 0;
	let bOnly = 0;
	let n = 0;
	for (const r of records.filter(
		(r) => r.model === model && r.condition === b && filter(r),
	)) {
		const s = base.get(r.taskId);
		if (s === undefined) continue;
		n += 1;
		if (s && !r.success) aOnly += 1;
		else if (!s && r.success) bOnly += 1;
	}
	return { aOnly, bOnly, n, p: mcnemarExact(aOnly, bOnly).pValue };
}

console.log("\n## Paired McNemar vs X-history (anaphora cells)\n");
const gate = new Map<string, boolean>();
for (const model of MODELS) {
	for (const arm of ["X-window2", "X-lastedit", "X-stateless"]) {
		const m = mcnemar(model, "X-history", arm);
		console.log(
			`  ${model.split("/")[1]} vs ${arm} (n=${m.n}): history-only ${m.aOnly}, ${arm}-only ${m.bOnly} — p = ${m.p.toFixed(4)}`,
		);
		if (arm === "X-lastedit") gate.set(model, m.p > 0.05);
	}
}

console.log(
	"\n## Pre-registered gate (X-H2: last-edit note ties history, per model)\n",
);
let pass = true;
for (const model of MODELS) {
	const ok = gate.get(model) ?? false;
	if (!ok) pass = false;
	console.log(`  ${model.split("/")[1]}: ${ok ? "PASS" : "FAIL"}`);
}
console.log(`\n  GATE: ${pass ? "PASSES" : "FAILS"}`);

console.log("\n## Cost (mean input tokens per session)\n");
for (const model of MODELS) {
	const parts = ARMS.map((arm) => {
		const rows = records.filter(
			(r) => r.model === model && r.condition === arm,
		);
		if (rows.length === 0) return `${arm} —`;
		const bySession = new Map<string, number>();
		for (const r of rows) {
			const id = r.taskId.split(":s")[0] as string;
			bySession.set(id, (bySession.get(id) ?? 0) + r.totalInputTokens);
		}
		const mean =
			[...bySession.values()].reduce((s, v) => s + v, 0) / bySession.size;
		return `${arm} ${Math.round(mean).toLocaleString()}`;
	});
	console.log(`  ${model.split("/")[1]}: ${parts.join(" · ")}`);
}
