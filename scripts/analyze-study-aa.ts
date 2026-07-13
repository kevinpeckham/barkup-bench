/**
 * Study AA analysis (docs/BRIEF-AA.md): reading distributions per
 * model × arm × kind, the pre-registered gates AA-H1 (capability
 * strictness, opus vs gemini paired McNemar) and AA-H2 (priority
 * meta-rule per model), AA-H3 soft phrasing (descriptive), AA-H4
 * memo steering (sonnet gate), the C-rr order table, the safety
 * scan, and caching totals.
 *
 *   bun run scripts/analyze-study-aa.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";

const MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS = ["AA-base", "AA-priority", "AA-soft", "AA-memo"] as const;
const KINDS = ["ri", "override", "rr"] as const;

function loadRecords(path: string): TaskRunRecord[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as TaskRunRecord);
}

const byModel = new Map<string, TaskRunRecord[]>();
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	byModel.set(model, loadRecords(`results/raw/studyaa-${slug}.jsonl`));
}

function d(record: TaskRunRecord): Record<string, unknown> {
	return record.detail ?? {};
}

function rows(model: string, arm?: string, kind?: string): TaskRunRecord[] {
	return (byModel.get(model) ?? []).filter(
		(r) =>
			(arm === undefined || r.condition === arm) &&
			(kind === undefined || d(r).kind === kind),
	);
}

console.log("=== Study AA: reading distributions ===");
for (const model of MODELS) {
	console.log(`\n${model} (${rows(model).length} cells):`);
	for (const arm of ARMS) {
		const parts: string[] = [];
		for (const kind of KINDS) {
			const cells = rows(model, arm, kind);
			const counts = new Map<string, number>();
			for (const r of cells) {
				const reading = String(d(r).reading);
				counts.set(reading, (counts.get(reading) ?? 0) + 1);
			}
			parts.push(
				`${kind}: ${[...counts.entries()]
					.sort((a, b) => b[1] - a[1])
					.map(([k, n]) => `${k}=${n}`)
					.join(" ")}`,
			);
		}
		console.log(`  ${arm}:  ${parts.join("  |  ")}`);
	}
}

console.log("\n=== Safety scan (violations, layer-1 fails, contamination) ===");
let contamTotal = 0;
let violationTotal = 0;
for (const model of MODELS) {
	for (const r of rows(model)) {
		const events = (d(r).contamination as string[] | undefined) ?? [];
		contamTotal += events.length;
		if (events.length > 0) {
			console.log(
				`  CONTAM ${model} ${r.taskId}/${r.condition}: ${events.join(", ")}`,
			);
		}
		if (d(r).reading === "violation" || d(r).layerOneOk !== true) {
			violationTotal += 1;
			console.log(
				`  UNRESOLVED ${model} ${r.taskId}/${r.condition}: reading=${d(r).reading} layer1=${d(r).layerOneOk}`,
			);
		}
	}
}
console.log(
	`  totals: ${violationTotal} unresolved cells, ${contamTotal} contamination events`,
);

/** Paired literal-indicator map over base ri+override cells. */
function literalByTask(model: string): Map<string, boolean> {
	const map = new Map<string, boolean>();
	for (const kind of ["ri", "override"]) {
		for (const r of rows(model, "AA-base", kind)) {
			map.set(r.taskId, d(r).literal === true);
		}
	}
	return map;
}

console.log(
	"\n=== AA-H1 gate: capability strictness (AA-base, ri+override, paired by task) ===",
);
{
	for (const model of MODELS) {
		const lit = [...literalByTask(model).values()].filter(Boolean).length;
		console.log(`  ${model}: literal ${lit}/24`);
	}
	const opus = literalByTask("anthropic/claude-opus-4.8");
	const gemini = literalByTask("google/gemini-3.5-flash");
	let opusOnly = 0;
	let geminiOnly = 0;
	for (const [id, o] of opus) {
		const g = gemini.get(id) ?? false;
		if (o && !g) opusOnly += 1;
		if (!o && g) geminiOnly += 1;
	}
	const m = mcnemarExact(opusOnly, geminiOnly);
	console.log(
		`  opus-literal-only=${opusOnly}, gemini-literal-only=${geminiOnly}, p=${m.pValue.toFixed(4)} (gate: p<0.05, opus more literal)`,
	);
}

console.log(
	"\n=== AA-H2 gate: priority meta-rule (instruction-favored, priority vs base, per model) ===",
);
for (const model of MODELS) {
	const base = new Map<string, boolean>();
	const prio = new Map<string, boolean>();
	for (const kind of ["ri", "override"]) {
		for (const r of rows(model, "AA-base", kind)) {
			base.set(r.taskId, d(r).instructionFavored === true);
		}
		for (const r of rows(model, "AA-priority", kind)) {
			prio.set(r.taskId, d(r).instructionFavored === true);
		}
	}
	let prioOnly = 0;
	let baseOnly = 0;
	for (const [id, p] of prio) {
		const b = base.get(id) ?? false;
		if (p && !b) prioOnly += 1;
		if (!p && b) baseOnly += 1;
	}
	const m = mcnemarExact(baseOnly, prioOnly);
	const baseCount = [...base.values()].filter(Boolean).length;
	const prioCount = [...prio.values()].filter(Boolean).length;
	console.log(
		`  ${model}: base ${baseCount}/24 → priority ${prioCount}/24 (priority-only=${prioOnly}, base-only=${baseOnly}, p=${m.pValue.toFixed(4)})`,
	);
}

console.log(
	"\n=== AA-H3 (descriptive): soft phrasing vs base, literal readings ===",
);
for (const model of MODELS) {
	const count = (arm: string): number =>
		["ri", "override"].reduce(
			(sum, kind) =>
				sum +
				rows(model, arm, kind).filter((r) => d(r).literal === true).length,
			0,
		);
	console.log(
		`  ${model}: base literal ${count("AA-base")}/24 → soft ${count("AA-soft")}/24`,
	);
}

console.log(
	"\n=== AA-H4 gate: memo steering on sonnet C-ri (memo vs base, toward both) ===",
);
for (const model of MODELS) {
	const base = new Map<string, boolean>();
	const memo = new Map<string, boolean>();
	for (const r of rows(model, "AA-base", "ri")) {
		base.set(r.taskId, d(r).reading === "both");
	}
	for (const r of rows(model, "AA-memo", "ri")) {
		memo.set(r.taskId, d(r).reading === "both");
	}
	let memoOnly = 0;
	let baseOnly = 0;
	for (const [id, mm] of memo) {
		const b = base.get(id) ?? false;
		if (mm && !b) memoOnly += 1;
		if (!mm && b) baseOnly += 1;
	}
	const m = mcnemarExact(baseOnly, memoOnly);
	console.log(
		`  ${model}: base both=${[...base.values()].filter(Boolean).length}/12 → memo both=${[...memo.values()].filter(Boolean).length}/12 (p=${m.pValue.toFixed(4)})${model.includes("sonnet") ? "  ← the gate" : ""}`,
	);
}

console.log("\n=== C-rr (descriptive): which rule wins, by listing order ===");
for (const model of MODELS) {
	for (const arm of ARMS) {
		const parts: string[] = [];
		for (const order of ["phrase-first", "city-first"]) {
			const cells = rows(model, arm, "rr").filter(
				(r) => d(r).ruleOrder === order,
			);
			const counts = new Map<string, number>();
			for (const r of cells) {
				counts.set(
					String(d(r).reading),
					(counts.get(String(d(r).reading)) ?? 0) + 1,
				);
			}
			parts.push(
				`${order}: ${[...counts.entries()]
					.map(([k, n]) => `${k}=${n}`)
					.join(" ")}`,
			);
		}
		console.log(`  ${model} ${arm}: ${parts.join("  |  ")}`);
	}
}

console.log("\n=== Caching totals ===");
for (const model of MODELS) {
	let input = 0;
	let read = 0;
	let write = 0;
	for (const r of rows(model)) {
		for (const c of r.calls) {
			input += c.inputTokens;
			read += c.cacheReadTokens ?? 0;
			write += c.cacheWriteTokens ?? 0;
		}
	}
	console.log(
		`  ${model}: input=${input} cacheRead=${read} cacheWrite=${write}`,
	);
}
