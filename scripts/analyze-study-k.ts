/**
 * Study K analysis (docs/BRIEF-K.md): drift over sequential edits by
 * serialization policy.
 *
 *   bun run scripts/analyze-study-k.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const CONDITIONS = ["K-once", "K-refresh5", "K-view", "K-rewrite"];
const TERCILES: [string, (i: number) => boolean][] = [
	["steps 1–4", (i) => i <= 4],
	["steps 5–8", (i) => i >= 5 && i <= 8],
	["steps 9–12", (i) => i >= 9],
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
	records.push(...loadRecords(`results/raw/studyk-${slug}.jsonl`));
}

function stepIndex(r: TaskRunRecord): number {
	return Number(r.taskId.split(":s").pop());
}
function blocked(r: TaskRunRecord): boolean {
	return typeof r.detail?.blocked === "string";
}
function scorable(r: TaskRunRecord): boolean {
	return !blocked(r);
}

function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}

console.log("# Study K — long editing sessions\n");

console.log("## Per-step success by tercile (non-blocked steps)\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition && scorable(r),
		);
		if (rows.length === 0) continue;
		const parts = TERCILES.map(
			([name, test]) =>
				`${name} ${pct(rows.filter((r) => test(stepIndex(r))))}`,
		);
		console.log(`  ${condition.padEnd(10)}: ${parts.join("  |  ")}`);
	}
	console.log("");
}

console.log("## Paired McNemar (same session+step across policies)\n");
const PAIRS: [string, string][] = [
	["K-once", "K-view"],
	["K-once", "K-refresh5"],
	["K-view", "K-rewrite"],
];
for (const model of MODELS) {
	for (const [a, b] of PAIRS) {
		for (const [name, test] of [
			["all steps", () => true] as [string, (i: number) => boolean],
			TERCILES[2] as [string, (i: number) => boolean],
		]) {
			const left = new Map(
				records
					.filter(
						(r) =>
							r.model === model &&
							r.condition === a &&
							scorable(r) &&
							test(stepIndex(r)),
					)
					.map((r) => [r.taskId, r.success] as const),
			);
			let aOnly = 0;
			let bOnly = 0;
			let n = 0;
			for (const r of records.filter(
				(r) =>
					r.model === model &&
					r.condition === b &&
					scorable(r) &&
					test(stepIndex(r)),
			)) {
				const l = left.get(r.taskId);
				if (l === undefined) continue;
				n += 1;
				if (l && !r.success) aOnly += 1;
				else if (!l && r.success) bOnly += 1;
			}
			const m = mcnemarExact(aOnly, bOnly);
			console.log(
				`  ${model} ${a} vs ${b} (${name}, n=${n}): ${a}-only ${aOnly}, ${b}-only ${bOnly} — p = ${m.pValue.toFixed(3)}`,
			);
		}
	}
}

console.log("\n## Mechanism: placement edits (insert/move) by tercile\n");
for (const condition of CONDITIONS) {
	const rows = records.filter(
		(r) =>
			r.condition === condition &&
			scorable(r) &&
			(r.detail?.editKind === "insert-node" ||
				r.detail?.editKind === "move-node"),
	);
	if (rows.length === 0) continue;
	const parts = TERCILES.map(
		([name, test]) => `${name} ${pct(rows.filter((r) => test(stepIndex(r))))}`,
	);
	console.log(`  ${condition.padEnd(10)}: ${parts.join("  |  ")}`);
}

console.log("\n## Reference-back steps\n");
for (const condition of CONDITIONS) {
	const rows = records.filter(
		(r) => r.condition === condition && r.detail?.referenceBack === true,
	);
	if (rows.length === 0) continue;
	const blockedCount = rows.filter(blocked).length;
	console.log(
		`  ${condition.padEnd(10)}: ${pct(rows.filter(scorable))}; blocked ${blockedCount}`,
	);
}

console.log("\n## Blocked/cascade steps and id-resolution failures\n");
for (const condition of CONDITIONS) {
	const rows = records.filter((r) => r.condition === condition);
	if (rows.length === 0) continue;
	const blockedRows = rows.filter(blocked);
	const kinds = new Map<string, number>();
	for (const r of blockedRows) {
		const kind = String(r.detail?.blocked).split(":")[0] as string;
		kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
	}
	const idRef = rows.filter((r) => r.idRefFailure === true).length;
	console.log(
		`  ${condition.padEnd(10)}: blocked ${blockedRows.length}/${rows.length} (${
			[...kinds.entries()].map(([k, n]) => `${k}×${n}`).join(", ") || "none"
		}); created-node lookup failures ${idRef}`,
	);
}

console.log("\n## End-state match and cost per session\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition,
		);
		if (rows.length === 0) continue;
		const bySession = new Map<string, TaskRunRecord[]>();
		for (const r of rows) {
			const id = r.taskId.split(":s")[0] as string;
			bySession.set(id, [...(bySession.get(id) ?? []), r]);
		}
		let endOk = 0;
		let inTok = 0;
		let outTok = 0;
		for (const [, recs] of bySession) {
			const last = recs.find((r) => r.detail?.endStateMatch !== undefined);
			if (last?.detail?.endStateMatch === true) endOk += 1;
			inTok += recs.reduce((s, r) => s + r.totalInputTokens, 0);
			outTok += recs.reduce((s, r) => s + r.totalOutputTokens, 0);
		}
		const n = bySession.size;
		console.log(
			`  ${condition.padEnd(10)}: end-state ${endOk}/${n}; mean tokens/session ${Math.round(inTok / n).toLocaleString()} in + ${Math.round(outTok / n).toLocaleString()} out`,
		);
	}
	console.log("");
}
