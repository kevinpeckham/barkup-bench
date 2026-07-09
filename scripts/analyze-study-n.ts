/**
 * Study N analysis (docs/BRIEF-N.md): the retrieval ladder vs Study L's
 * floor and ceiling, with the shared misgrounding classifier, retrieval
 * hit rates, stage-1 grounding coverage, and the per-rung gate math
 * (non-inferiority + input savings on the pre-registered cost basis).
 *
 *   bun run scripts/analyze-study-n.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { lexicalFocus } from "../src/conditions/grounded.js";
import { groundedTargetIds } from "../src/corpus/grounded.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import { classifyGroundedFailure } from "../src/grading/misground.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const SONNET = "anthropic/claude-sonnet-4.5";
const GEMINI = "google/gemini-3.5-flash";
const MODELS = [SONNET, GEMINI];
const N_CONDITIONS = ["N-search", "N-embed", "N-ground2", "N-ground2x"];
const BUCKETS = ["xl", "xxl", "xxxl"];

const corpus = JSON.parse(
	readFileSync("corpus/grounded.json", "utf8"),
) as Corpus;
const tasks = corpus.tasks as TransformationTask[];
const byId = new Map(tasks.map((t) => [t.id, t]));
const embedFocus = JSON.parse(
	readFileSync("corpus/embed-focus.json", "utf8"),
) as { focus: Record<string, string[]> };

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
	records.push(...loadRecords(`results/raw/studyn-${slug}.jsonl`));
	records.push(...loadRecords(`results/raw/studyl-${slug}.jsonl`));
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

console.log("# Study N — the retrieval ladder\n");

console.log("## Success by model × condition × size\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of ["LG-full", "LG-nav", "LG-lex", ...N_CONDITIONS]) {
		const list = rows(model, condition);
		if (list.length === 0) continue;
		const parts = BUCKETS.map(
			(bucket) => `${bucket} ${pct(list.filter((r) => r.bucket === bucket))}`,
		);
		console.log(
			`  ${condition.padEnd(10)}: ${parts.join("  |  ")}  →  all ${pct(list)}`,
		);
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
	for (const condition of N_CONDITIONS) {
		if (rows(model, condition).length === 0) continue;
		mcnemar(model, "LG-full", condition);
	}
	if (rows(model, "N-search").length > 0) {
		mcnemar(model, "LG-nav", "N-search");
	}
	if (rows(model, "N-embed").length > 0) {
		mcnemar(model, "LG-lex", "N-embed");
	}
}

console.log("\n## Failure anatomy (misgrounded vs mechanics vs invalid)\n");
for (const condition of N_CONDITIONS) {
	const fails = records.filter((r) => r.condition === condition && !r.success);
	const kinds = new Map<string, number>();
	for (const r of fails) {
		const task = byId.get(r.taskId) as TransformationTask;
		const k = classifyGroundedFailure(r, task);
		kinds.set(k, (kinds.get(k) ?? 0) + 1);
	}
	console.log(
		`  ${condition.padEnd(10)}: ${fails.length} failures — ${
			[...kinds.entries()].map(([k, n]) => `${k}×${n}`).join(", ") || "none"
		}`,
	);
}

console.log("\n## Retrieval hit rate (top-5 covers every target id)\n");
{
	let lexHit = 0;
	let embedHit = 0;
	for (const task of tasks) {
		const targets = groundedTargetIds(task.edit);
		const lex = lexicalFocus(task.tree, task.instruction);
		if (targets.every((id) => lex.includes(id))) lexHit += 1;
		const emb = embedFocus.focus[task.id] ?? [];
		if (targets.every((id) => emb.includes(id))) embedHit += 1;
	}
	console.log(`  LG-lex  : ${lexHit}/${tasks.length}`);
	console.log(`  N-embed : ${embedHit}/${tasks.length}`);
}

console.log("\n## Stage-1 grounding coverage (two-stage arms)\n");
for (const model of MODELS) {
	for (const condition of ["N-ground2", "N-ground2x"]) {
		const list = rows(model, condition);
		if (list.length === 0) continue;
		let valid = 0;
		let covers = 0;
		for (const r of list) {
			const ids = r.detail?.stage1Ids as string[] | null | undefined;
			if (!ids) continue;
			valid += 1;
			const task = byId.get(r.taskId) as TransformationTask;
			if (groundedTargetIds(task.edit).every((id) => ids.includes(id))) {
				covers += 1;
			}
		}
		const grounder = list[0]?.detail?.grounderModel ?? "?";
		console.log(
			`  ${model} ${condition} (grounder ${grounder}): stage-1 valid ${valid}/${list.length}, covers targets ${covers}/${list.length}`,
		);
	}
}

console.log("\n## Input tokens per task (median, by size) and effort\n");
for (const model of MODELS) {
	console.log(`### ${model}`);
	for (const condition of ["LG-full", "LG-nav", "LG-lex", ...N_CONDITIONS]) {
		const list = rows(model, condition);
		if (list.length === 0) continue;
		const parts = BUCKETS.map((bucket) => {
			const bucketRows = list.filter((r) => r.bucket === bucket);
			return `${bucket} ${median(bucketRows.map((r) => r.totalInputTokens)).toLocaleString()}`;
		});
		let extra = "";
		if (condition === "N-search") {
			const calls = list.map((r) => Number(r.detail?.searchCalls ?? 0));
			extra = `  (median find_nodes calls ${median(calls)})`;
		}
		if (condition === "N-ground2x") {
			const patcherInput = list.map((r) =>
				r.calls
					.filter((c) => c.phase === 2)
					.reduce((s, c) => s + c.inputTokens, 0),
			);
			extra = `  (median sonnet-side input ${median(patcherInput).toLocaleString()})`;
		}
		console.log(`  ${condition.padEnd(10)}: ${parts.join("  |  ")}${extra}`);
	}
	console.log("");
}

console.log("## Gate math (BRIEF-N decision rule)\n");
console.log(
	"A rung passes if per model it is non-inferior to LG-full (delta ≥ −5 pp, McNemar p > 0.05) with ≥80% input savings on its cost basis.\n",
);
for (const model of MODELS) {
	const full = rows(model, "LG-full");
	const fullRate = full.filter((r) => r.success).length / (full.length || 1);
	const fullMedianInput = median(full.map((r) => r.totalInputTokens));
	for (const condition of N_CONDITIONS) {
		const list = rows(model, condition);
		if (list.length === 0 || full.length === 0) continue;
		const rate = list.filter((r) => r.success).length / list.length;
		const delta = (rate - fullRate) * 100;
		const inputBasis =
			condition === "N-ground2x"
				? median(
						list.map((r) =>
							r.calls
								.filter((c) => c.phase === 2)
								.reduce((s, c) => s + c.inputTokens, 0),
						),
					)
				: median(list.map((r) => r.totalInputTokens));
		const basisLabel =
			condition === "N-ground2x" ? "frontier-side input" : "total input";
		const fullBasis =
			condition === "N-ground2x"
				? median(rows(SONNET, "LG-full").map((r) => r.totalInputTokens))
				: fullMedianInput;
		const savings = (1 - inputBasis / fullBasis) * 100;
		console.log(
			`  ${model} ${condition.padEnd(10)}: delta ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pp vs LG-full; ${basisLabel} savings ${savings.toFixed(1)}%`,
		);
	}
}
