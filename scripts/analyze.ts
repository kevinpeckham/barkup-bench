/**
 * Per-hypothesis analysis over the full-matrix results. Pre-registered
 * comparisons (BRIEF.md):
 *
 *   H1 format fluency — first-pass validity, A vs B (rewrite) and D vs C
 *     (tools): HTML side listed first in each pair.
 *   H2 strategy — task success, A vs C per size bucket (the crossover),
 *     plus A vs E and B vs C.
 *   H3 cost — total tokens (and $ where pricing known) per solved task,
 *     by condition × bucket.
 *   H4 reference stability — reference-family success and id-reference
 *     failures, A vs C.
 *   H5 reading — reading accuracy, A vs B (primary; same tasks, HTML vs
 *     JSON serialization), pooled HTML (A,D) vs JSON (B,C,E) secondary.
 *
 * Paired stats: McNemar exact over discordant pairs; Wilson intervals
 * per cell; effect size = risk difference.
 *
 *   bun run scripts/analyze.ts results/raw/main-*.jsonl
 */
import { readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const paths = process.argv.slice(2);
if (paths.length === 0) {
	throw new Error("usage: bun run scripts/analyze.ts <results.jsonl> ...");
}

const records: TaskRunRecord[] = paths.flatMap((path) =>
	readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as TaskRunRecord),
);

const models = [...new Set(records.map((r) => r.model))].sort();
const conditionIds = [...new Set(records.map((r) => r.condition))].sort();
const regimes = [...new Set(records.map((r) => r.regime))].sort();
const buckets = ["xs", "s", "m", "l"] as const;

function pct(x: number): string {
	return Number.isNaN(x) ? "—" : `${(100 * x).toFixed(1)}%`;
}

type Extract = (r: TaskRunRecord) => boolean | null;

const SUCCESS: Extract = (r) => r.success;
const FIRST_VALID: Extract = (r) => r.firstPassValid;

interface Paired {
	n: number;
	firstRate: number;
	secondRate: number;
	riskDiff: number;
	firstOnly: number;
	secondOnly: number;
	p: number;
}

/** Paired comparison of two conditions over identical tasks (within model+regime). */
function paired(
	rows: TaskRunRecord[],
	condFirst: string,
	condSecond: string,
	extract: Extract,
	filter: (r: TaskRunRecord) => boolean = () => true,
): Paired {
	const byKey = new Map<string, { first?: boolean; second?: boolean }>();
	for (const r of rows) {
		if (!filter(r)) continue;
		const value = extract(r);
		if (value === null) continue;
		const key = `${r.taskId}::${r.model}::${r.regime}`;
		const entry = byKey.get(key) ?? {};
		if (r.condition === condFirst) entry.first = value;
		if (r.condition === condSecond) entry.second = value;
		byKey.set(key, entry);
	}
	let n = 0;
	let firstPass = 0;
	let secondPass = 0;
	let firstOnly = 0;
	let secondOnly = 0;
	for (const { first, second } of byKey.values()) {
		if (first === undefined || second === undefined) continue;
		n += 1;
		if (first) firstPass += 1;
		if (second) secondPass += 1;
		if (first && !second) firstOnly += 1;
		if (!first && second) secondOnly += 1;
	}
	const test = mcnemarExact(firstOnly, secondOnly);
	return {
		n,
		firstRate: firstPass / n,
		secondRate: secondPass / n,
		riskDiff: (firstPass - secondPass) / n,
		firstOnly,
		secondOnly,
		p: test.pValue,
	};
}

function printPaired(label: string, p: Paired): void {
	console.log(
		`  ${label}: n=${p.n}  ${pct(p.firstRate)} vs ${pct(p.secondRate)}  Δ=${(
			100 * p.riskDiff
		).toFixed(
			1,
		)}pp  discordant ${p.firstOnly}/${p.secondOnly}  p=${p.p.toFixed(4)}`,
	);
}

function cellRows(
	condition: string,
	extra: (r: TaskRunRecord) => boolean = () => true,
): TaskRunRecord[] {
	return records.filter((r) => r.condition === condition && extra(r));
}

console.log(`# barkup-bench analysis — ${records.length} records`);
console.log(`models: ${models.join(", ")}`);
console.log(`regimes: ${regimes.join(", ")}\n`);

const errors = records.filter((r) => r.error !== undefined);
console.log(
	`harness errors: ${errors.length}${
		errors.length > 0
			? ` (${[...new Set(errors.map((r) => `${r.model}:${r.error?.slice(0, 60)}`))].slice(0, 5).join(" | ")})`
			: ""
	}\n`,
);

console.log("## H1 — format fluency (first-pass validity, HTML vs JSON)");
for (const regime of regimes) {
	const inRegime = (r: TaskRunRecord) => r.regime === regime;
	printPaired(
		`[${regime}] A vs B (rewrite)`,
		paired(records, "A", "B", FIRST_VALID, inRegime),
	);
	printPaired(
		`[${regime}] D vs C (tools)`,
		paired(records, "D", "C", FIRST_VALID, inRegime),
	);
}
for (const model of models) {
	printPaired(
		`[parity, ${model}] A vs B`,
		paired(
			records,
			"A",
			"B",
			FIRST_VALID,
			(r) => r.regime === "parity" && r.model === model,
		),
	);
}

console.log("\n## H2 — strategy (success; crossover by bucket)");
for (const regime of regimes) {
	const inRegime = (r: TaskRunRecord) => r.regime === regime;
	printPaired(
		`[${regime}] A vs C`,
		paired(records, "A", "C", SUCCESS, inRegime),
	);
	printPaired(
		`[${regime}] A vs E`,
		paired(records, "A", "E", SUCCESS, inRegime),
	);
	printPaired(
		`[${regime}] B vs C`,
		paired(records, "B", "C", SUCCESS, inRegime),
	);
}
for (const bucket of buckets) {
	printPaired(
		`[parity, bucket ${bucket}] A vs C`,
		paired(
			records,
			"A",
			"C",
			SUCCESS,
			(r) => r.regime === "parity" && r.bucket === bucket,
		),
	);
}

console.log(
	"\n## Success by condition × bucket (parity, pooled models) — crossover data",
);
for (const condition of conditionIds) {
	const line = buckets
		.map((bucket) => {
			const rows = cellRows(
				condition,
				(r) => r.regime === "parity" && r.bucket === bucket,
			);
			const ok = rows.filter((r) => r.success).length;
			const w = wilson(ok, rows.length);
			return `${bucket}: ${ok}/${rows.length} (${pct(w.proportion)} [${pct(w.low)},${pct(w.high)}])`;
		})
		.join("  ");
	console.log(`  ${condition}: ${line}`);
}

console.log("\n## H3 — cost (tokens per SOLVED task, parity, pooled models)");
for (const condition of conditionIds) {
	const line = buckets
		.map((bucket) => {
			const rows = cellRows(
				condition,
				(r) => r.regime === "parity" && r.bucket === bucket && r.success,
			);
			if (rows.length === 0) return `${bucket}: —`;
			const tokens =
				rows.reduce(
					(sum, r) => sum + r.totalInputTokens + r.totalOutputTokens,
					0,
				) / rows.length;
			return `${bucket}: ${Math.round(tokens / 100) / 10}k`;
		})
		.join("  ");
	console.log(`  ${condition}: ${line}`);
}

console.log("\n## H4 — reference stability (reference family, parity)");
for (const pair of [
	["A", "C"],
	["A", "B"],
	["A", "E"],
] as const) {
	printPaired(
		`${pair[0]} vs ${pair[1]} (success)`,
		paired(
			records,
			pair[0],
			pair[1],
			SUCCESS,
			(r) => r.regime === "parity" && r.family === "reference",
		),
	);
}
for (const condition of conditionIds) {
	const rows = cellRows(
		condition,
		(r) => r.regime === "parity" && r.family === "reference",
	);
	const fails = rows.filter((r) => r.idRefFailure === true).length;
	console.log(`  ${condition}: idRefFailures ${fails}/${rows.length}`);
}

console.log("\n## H5 — reading (accuracy, HTML vs JSON serialization)");
for (const regime of regimes) {
	printPaired(
		`[${regime}] A vs B (primary)`,
		paired(
			records,
			"A",
			"B",
			SUCCESS,
			(r) => r.regime === regime && r.family === "reading",
		),
	);
}
for (const model of models) {
	printPaired(
		`[parity, ${model}] A vs B (reading)`,
		paired(
			records,
			"A",
			"B",
			SUCCESS,
			(r) =>
				r.regime === "parity" && r.family === "reading" && r.model === model,
		),
	);
}

if (conditionIds.includes("F")) {
	console.log("\n## H6 — id-anchored patches (F vs E, F vs A)");
	for (const regime of regimes) {
		const inRegime = (r: TaskRunRecord) => r.regime === regime;
		printPaired(
			`[${regime}] F vs E`,
			paired(records, "F", "E", SUCCESS, inRegime),
		);
		printPaired(
			`[${regime}] F vs A`,
			paired(records, "F", "A", SUCCESS, inRegime),
		);
	}
	for (const bucket of buckets) {
		printPaired(
			`[parity, bucket ${bucket}] F vs E`,
			paired(
				records,
				"F",
				"E",
				SUCCESS,
				(r) => r.regime === "parity" && r.bucket === bucket,
			),
		);
	}
	printPaired(
		"[parity, reference family] F vs A",
		paired(
			records,
			"F",
			"A",
			SUCCESS,
			(r) => r.regime === "parity" && r.family === "reference",
		),
	);
	printPaired(
		"[parity, reference family] F vs E",
		paired(
			records,
			"F",
			"E",
			SUCCESS,
			(r) => r.regime === "parity" && r.family === "reference",
		),
	);
}

console.log("\n## Per model × regime × condition (success overall)");
for (const model of models) {
	for (const regime of regimes) {
		const line = conditionIds
			.map((condition) => {
				const rows = records.filter(
					(r) =>
						r.model === model &&
						r.regime === regime &&
						r.condition === condition,
				);
				const ok = rows.filter((r) => r.success).length;
				return `${condition} ${ok}/${rows.length}`;
			})
			.join("  ");
		console.log(`  ${model} [${regime}]: ${line}`);
	}
}

console.log("\n## Totals (for the cost table)");
for (const model of models) {
	const rows = records.filter((r) => r.model === model);
	const input = rows.reduce((s, r) => s + r.totalInputTokens, 0);
	const output = rows.reduce((s, r) => s + r.totalOutputTokens, 0);
	const cached = rows.reduce(
		(s, r) =>
			s + r.calls.reduce((c, call) => c + (call.cacheReadTokens ?? 0), 0),
		0,
	);
	const latency = rows.reduce((s, r) => s + r.totalLatencyMs, 0);
	console.log(
		`  ${model}: ${rows.length} records, ${input} in (${cached} cached) + ${output} out, ${(latency / 3600000).toFixed(1)}h model-time`,
	);
}
