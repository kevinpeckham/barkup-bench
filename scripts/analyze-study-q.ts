/**
 * Study Q analysis (docs/BRIEF-Q.md): fan-out edits across the three
 * context conditions, with target-count bins, coverage/collateral
 * failure anatomy, and the non-inferiority comparison for the shipped
 * recipe.
 *
 *   bun run scripts/analyze-study-q.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { FanoutTask } from "../src/corpus/fanout.js";
import { changedExistingIds } from "../src/grading/misground.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";
import { findById } from "../src/tree.js";

const MODELS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const CONDITIONS = ["Q-view", "Q-full", "Q-search"];
const BUCKETS = ["xl", "xxl", "xxxl"];
const BINS: [string, (n: number) => boolean][] = [
	["2–3 targets", (n) => n <= 3],
	["4–6 targets", (n) => n >= 4 && n <= 6],
	["7+ targets", (n) => n >= 7],
];

const corpus = JSON.parse(readFileSync("corpus/fanout.json", "utf8")) as {
	tasks: FanoutTask[];
};
const byId = new Map(corpus.tasks.map((t) => [t.id, t]));

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
	records.push(...loadRecords(`results/raw/studyq-${slug}.jsonl`));
}

function targetCount(r: TaskRunRecord): number {
	return (byId.get(r.taskId) as FanoutTask).targetIds.length;
}
function rows(model: string, condition: string): TaskRunRecord[] {
	return records.filter((r) => r.model === model && r.condition === condition);
}
function pct(list: TaskRunRecord[]): string {
	if (list.length === 0) return "—";
	const ok = list.filter((r) => r.success).length;
	const w = wilson(ok, list.length);
	return `${ok}/${list.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}
function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] as number;
}

/** Fraction of targets whose final state matches the expected edit. */
function coverage(r: TaskRunRecord): number | null {
	const task = byId.get(r.taskId) as FanoutTask;
	const final = r.detail?.finalTree as BarkupNode | null | undefined;
	if (!final) return null;
	let ok = 0;
	for (const id of task.targetIds) {
		if (task.fanKind === "remove-all") {
			if (!findById(final, id)) ok += 1;
		} else {
			const node = findById(final, id);
			if (
				node &&
				JSON.stringify(node.attributes?.[task.key as string]) ===
					JSON.stringify(task.value)
			) {
				ok += 1;
			}
		}
	}
	return ok / task.targetIds.length;
}

/** Failure class: invalid / collateral / partial / mechanics. */
function classify(r: TaskRunRecord): string {
	const task = byId.get(r.taskId) as FanoutTask;
	const final = r.detail?.finalTree as BarkupNode | null | undefined;
	if (!final) return "invalid";
	const sanctioned = changedExistingIds(task.tree, task.expected);
	const actual = changedExistingIds(task.tree, final);
	for (const id of actual) {
		if (!sanctioned.has(id)) return "collateral";
	}
	const c = coverage(r);
	if (c !== null && c < 1) return "partial";
	return "mechanics";
}

console.log("# Study Q — fan-out edits\n");

console.log("## Success by model × condition × size\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const list = rows(model, condition);
		if (list.length === 0) continue;
		const parts = BUCKETS.map(
			(bucket) => `${bucket} ${pct(list.filter((r) => r.bucket === bucket))}`,
		);
		console.log(
			`  ${condition.padEnd(8)}: ${parts.join("  |  ")}  →  all ${pct(list)}`,
		);
	}
	console.log("");
}

console.log("## Success by target-count bin\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const list = rows(model, condition);
		if (list.length === 0) continue;
		const parts = BINS.map(
			([name, test]) =>
				`${name} ${pct(list.filter((r) => test(targetCount(r))))}`,
		);
		console.log(`  ${condition.padEnd(8)}: ${parts.join("  |  ")}`);
	}
	console.log("");
}

console.log("## Paired McNemar (per model, 45 shared tasks)\n");
function mcnemar(model: string, a: string, b: string): void {
	const base = new Map(
		rows(model, a).map((r) => [r.taskId, r.success] as const),
	);
	let aOnly = 0;
	let bOnly = 0;
	for (const r of rows(model, b)) {
		const s = base.get(r.taskId);
		if (s === undefined) continue;
		if (s && !r.success) aOnly += 1;
		else if (!s && r.success) bOnly += 1;
	}
	const m = mcnemarExact(aOnly, bOnly);
	console.log(
		`  ${model} ${a} vs ${b}: ${a}-only ${aOnly}, ${b}-only ${bOnly} — p = ${m.pValue.toFixed(3)}`,
	);
}
for (const model of MODELS) {
	mcnemar(model, "Q-full", "Q-search");
	mcnemar(model, "Q-full", "Q-view");
}

console.log("\n## Failure anatomy and coverage\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const fails = rows(model, condition).filter((r) => !r.success);
		const kinds = new Map<string, number>();
		const coverages: number[] = [];
		for (const r of fails) {
			const k = classify(r);
			kinds.set(k, (kinds.get(k) ?? 0) + 1);
			const c = coverage(r);
			if (c !== null) coverages.push(c);
		}
		const meanCov =
			coverages.length > 0
				? (
						(coverages.reduce((s, c) => s + c, 0) / coverages.length) *
						100
					).toFixed(0)
				: "—";
		console.log(
			`  ${condition.padEnd(8)}: ${fails.length} failures — ${
				[...kinds.entries()].map(([k, n]) => `${k}×${n}`).join(", ") || "none"
			}${coverages.length > 0 ? ` (mean coverage among graded failures ${meanCov}%)` : ""}`,
		);
	}
	console.log("");
}

console.log("## Input tokens per task (median, by size) and search effort\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const list = rows(model, condition);
		if (list.length === 0) continue;
		const parts = BUCKETS.map((bucket) => {
			const bucketRows = list.filter((r) => r.bucket === bucket);
			return `${bucket} ${median(bucketRows.map((r) => r.totalInputTokens)).toLocaleString()}`;
		});
		let extra = "";
		if (condition === "Q-search") {
			const calls = list.map((r) => Number(r.detail?.searchCalls ?? 0));
			extra = `  (median find_nodes calls ${median(calls)})`;
		}
		console.log(`  ${condition.padEnd(8)}: ${parts.join("  |  ")}${extra}`);
	}
	console.log("");
}
