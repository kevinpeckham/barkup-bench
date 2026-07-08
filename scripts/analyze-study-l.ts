/**
 * Study L analysis (docs/BRIEF-L.md): grounding accuracy across three
 * context mechanisms, with the misgrounding-vs-mechanics failure
 * split derived offline from each record's final tree.
 *
 *   bun run scripts/analyze-study-l.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { groundedTargetIds } from "../src/corpus/grounded.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";
import { findById, findParent, walkTree } from "../src/tree.js";

const MODELS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const CONDITIONS = ["LG-full", "LG-nav", "LG-lex"];
const BUCKETS = ["xl", "xxl", "xxxl"];

const corpus = JSON.parse(
	readFileSync("corpus/grounded.json", "utf8"),
) as Corpus;
const byId = new Map(
	(corpus.tasks as TransformationTask[]).map((t) => [t.id, t]),
);

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
	records.push(...loadRecords(`results/raw/studyl-${slug}.jsonl`));
}

function pct(rows: TaskRunRecord[]): string {
	if (rows.length === 0) return "—";
	const ok = rows.filter((r) => r.success).length;
	const w = wilson(ok, rows.length);
	return `${ok}/${rows.length} (${(w.proportion * 100).toFixed(1)}% [${(
		w.low * 100
	).toFixed(0)}–${(w.high * 100).toFixed(0)}])`;
}

/** Existing-node ids whose identity-relevant state changed base→final. */
function changedExistingIds(base: BarkupNode, final: BarkupNode): Set<string> {
	const changed = new Set<string>();
	const describe = (tree: BarkupNode, id: string): string | null => {
		const node = findById(tree, id);
		if (!node) return null;
		const parent = findParent(tree, id);
		return JSON.stringify({
			name: node.name ?? null,
			attrs: node.attributes ?? {},
			parent: parent?.parent.id ?? null,
			index: parent?.index ?? -1,
			childIds: (node.children ?? []).map((c) => c.id ?? "?"),
		});
	};
	walkTree(base, ({ node }) => {
		const id = node.id as string;
		if (describe(base, id) !== describe(final, id)) changed.add(id);
	});
	return changed;
}

/** Failure class: misgrounded (wrong node touched / target untouched) vs mechanics vs invalid. */
function classifyFailure(r: TaskRunRecord): string {
	const task = byId.get(r.taskId) as TransformationTask;
	const final = r.detail?.finalTree as BarkupNode | null | undefined;
	if (!final) return "invalid";
	const expectedChanged = changedExistingIds(task.tree, task.expected);
	const actualChanged = changedExistingIds(task.tree, final);
	const expectedTargets = new Set([
		...groundedTargetIds(task.edit),
		...expectedChanged,
	]);
	for (const id of actualChanged) {
		if (!expectedTargets.has(id)) return "misgrounded";
	}
	// Touched only sanctioned nodes but still wrong (or touched nothing).
	return actualChanged.size === 0 && expectedChanged.size > 0
		? "misgrounded"
		: "mechanics";
}

console.log("# Study L — grounding without ids\n");

console.log("## Success by model × condition × size\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition,
		);
		if (rows.length === 0) continue;
		const parts = BUCKETS.map(
			(bucket) => `${bucket} ${pct(rows.filter((r) => r.bucket === bucket))}`,
		);
		console.log(`  ${condition.padEnd(7)}: ${parts.join("  |  ")}`);
	}
	console.log("");
}

console.log("## Paired McNemar vs LG-full (per model, 45 shared tasks)\n");
for (const model of MODELS) {
	for (const condition of ["LG-nav", "LG-lex"]) {
		const base = new Map(
			records
				.filter((r) => r.model === model && r.condition === "LG-full")
				.map((r) => [r.taskId, r.success] as const),
		);
		let fullOnly = 0;
		let otherOnly = 0;
		for (const r of records.filter(
			(r) => r.model === model && r.condition === condition,
		)) {
			const f = base.get(r.taskId);
			if (f === undefined) continue;
			if (f && !r.success) fullOnly += 1;
			else if (!f && r.success) otherOnly += 1;
		}
		const m = mcnemarExact(fullOnly, otherOnly);
		console.log(
			`  ${model} LG-full vs ${condition}: full-only ${fullOnly}, ${condition}-only ${otherOnly} — p = ${m.pValue.toFixed(3)}`,
		);
	}
}

console.log("\n## Failure anatomy (misgrounded vs mechanics vs invalid)\n");
for (const condition of CONDITIONS) {
	const fails = records.filter((r) => r.condition === condition && !r.success);
	const kinds = new Map<string, number>();
	for (const r of fails) {
		const k = classifyFailure(r);
		kinds.set(k, (kinds.get(k) ?? 0) + 1);
	}
	console.log(
		`  ${condition.padEnd(7)}: ${fails.length} failures — ${
			[...kinds.entries()].map(([k, n]) => `${k}×${n}`).join(", ") || "none"
		}`,
	);
}

console.log("\n## Input tokens per task (median, by size) and nav effort\n");
function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] as number;
}
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of CONDITIONS) {
		const rows = records.filter(
			(r) => r.model === model && r.condition === condition,
		);
		if (rows.length === 0) continue;
		const parts = BUCKETS.map((bucket) => {
			const bucketRows = rows.filter((r) => r.bucket === bucket);
			return `${bucket} ${median(bucketRows.map((r) => r.totalInputTokens)).toLocaleString()}`;
		});
		let extra = "";
		if (condition === "LG-nav") {
			const expands = rows.map((r) => Number(r.detail?.expandCalls ?? 0));
			extra = `  (median expands ${median(expands)})`;
		}
		console.log(`  ${condition.padEnd(7)}: ${parts.join("  |  ")}${extra}`);
	}
	console.log("");
}
