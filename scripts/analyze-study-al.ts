/**
 * Study AL analysis (docs/BRIEF-AL.md): H1 prune closure at K=20
 * (pooled pruner-tier McNemar + per-tier ceiling), H2 goal-safe
 * closure downstream, H3 no new damage (under-cap no-op + the opus
 * guard), H4 fence cost (descriptive with a 2x flag), H5 post-notice
 * behavior. Control arm records carry arm "AK-eviction" — AL's one
 * variable is the prompt rule, so its control IS that arm, run
 * contemporaneously into the studyal files.
 *
 *   bun run scripts/analyze-study-al.ts > results/analysis-study-al.txt
 */
import { readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

const MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const PRUNER_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];
const OPUS = "anthropic/claude-opus-4.8";

/** AK's eviction-arm K=20 residue (results/analysis-study-ak.txt),
 * for the control-arm replication check. */
const AK_RESIDUE: Record<string, { overSends: number; prunes: number }> = {
	"anthropic/claude-sonnet-4.5": { overSends: 6, prunes: 4 },
	"google/gemini-3.5-flash": { overSends: 4, prunes: 6 },
	"anthropic/claude-opus-4.8": { overSends: 9, prunes: 0 },
};

interface Detail {
	arm: string;
	kLevel: number;
	outcome: string;
	toolCalls: number;
	rawLength: number | null;
	rawLengths: number[];
	overCap: boolean;
	goalSafe: boolean;
	designedEviction: boolean | null;
	evictedKinds: string[];
	prunedKinds: string[];
	lostPost: string[];
	readdedEvicted: boolean | null;
	editApplied: boolean;
}

const records: TaskRunRecord[] = [];
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const lines = readFileSync(`results/raw/studyal-${slug}.jsonl`, "utf8")
		.trim()
		.split("\n");
	for (const line of lines) records.push(JSON.parse(line) as TaskRunRecord);
}
const det = (r: TaskRunRecord): Detail => r.detail as unknown as Detail;
const pruned = (r: TaskRunRecord): boolean => det(r).prunedKinds.length > 0;
const pct = (ok: number, n: number): string => {
	const w = wilson(ok, n);
	return `${ok}/${n} (${(100 * w.proportion).toFixed(1)}% [${(100 * w.low).toFixed(1)}%,${(100 * w.high).toFixed(1)}%])`;
};
const mean = (xs: number[]): number =>
	xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;

console.log(`# Study AL — the prompt-side fence (${records.length} records)`);

// Paired K=20 slots per model: fence vs control (arm "AK-eviction").
function k20Pairs(
	model: string,
): Map<string, { fence?: TaskRunRecord; ctl?: TaskRunRecord }> {
	const byTask = new Map<
		string,
		{ fence?: TaskRunRecord; ctl?: TaskRunRecord }
	>();
	for (const r of records.filter(
		(x) => x.model === model && det(x).kLevel === 20,
	)) {
		const slot = byTask.get(r.taskId) ?? {};
		if (det(r).arm === "AL-fence") slot.fence = r;
		if (det(r).arm === "AK-eviction") slot.ctl = r;
		byTask.set(r.taskId, slot);
	}
	return byTask;
}

// H1 — prune closure at K=20 (pooled pruner tiers + per-tier ceiling)
console.log(
	"\n## AL-H1 — prune closure at K=20 (gate: pooled pruner McNemar p<.05 AND fence prunes <=1/10 per pruner tier)",
);
let pooledFenceCleanOnly = 0; // control pruned, fence did not
let pooledCtlCleanOnly = 0; // fence pruned, control did not
const fencePrunesByModel: Record<string, number> = {};
for (const model of MODELS) {
	const pairs = k20Pairs(model);
	let fencePrunes = 0;
	let ctlPrunes = 0;
	for (const slot of pairs.values()) {
		if (!slot.fence || !slot.ctl) continue;
		const f = pruned(slot.fence);
		const c = pruned(slot.ctl);
		if (f) fencePrunes += 1;
		if (c) ctlPrunes += 1;
		if (PRUNER_MODELS.includes(model)) {
			if (c && !f) pooledFenceCleanOnly += 1;
			if (f && !c) pooledCtlCleanOnly += 1;
		}
	}
	fencePrunesByModel[model] = fencePrunes;
	const fenceKinds = [...pairs.values()]
		.filter((s) => s.fence && pruned(s.fence))
		.flatMap((s) => det(s.fence as TaskRunRecord).prunedKinds);
	console.log(
		`  ${model}: control prunes ${ctlPrunes}/10 → fence prunes ${fencePrunes}/10 (fence victim kinds: ${fenceKinds.join(",") || "none"})`,
	);
}
const h1p = mcnemarExact(pooledFenceCleanOnly, pooledCtlCleanOnly).pValue;
const h1ceiling = PRUNER_MODELS.every(
	(m) => (fencePrunesByModel[m] ?? 99) <= 1,
);
const h1pass = h1p < 0.05 && h1ceiling;
console.log(
	`  pooled pruner tiers: closed ${pooledFenceCleanOnly}, opened ${pooledCtlCleanOnly}, McNemar exact p=${h1p.toFixed(4)}; per-tier ceiling ${h1ceiling ? "met" : "MISSED"}`,
);

// H2 — goal-safe closure downstream (fence, K=20, pruner tiers)
console.log(
	"\n## AL-H2 — goal-safe at K=20 (gate: fence >=9/10 per pruner tier)",
);
let h2pass = true;
for (const model of MODELS) {
	const pairs = k20Pairs(model);
	const fenceOk = [...pairs.values()].filter(
		(s) => s.fence && det(s.fence).goalSafe,
	).length;
	const ctlOk = [...pairs.values()].filter(
		(s) => s.ctl && det(s.ctl).goalSafe,
	).length;
	if (PRUNER_MODELS.includes(model) && fenceOk < 9) h2pass = false;
	console.log(
		`  ${model}: fence ${pct(fenceOk, pairs.size)} vs control ${pct(ctlOk, pairs.size)}`,
	);
}

// H3 — no new damage (fence under-cap no-op + the opus guard)
console.log(
	"\n## AL-H3 — no new damage (gate: fence clean >=9/10 per model per K in {10,19} AND opus fence K=20 goal-safe >=9/10)",
);
const h3fail: string[] = [];
for (const model of MODELS) {
	for (const k of [10, 19]) {
		const cells = records.filter(
			(r) =>
				r.model === model && det(r).arm === "AL-fence" && det(r).kLevel === k,
		);
		const clean = cells.filter((r) => det(r).outcome === "clean-update");
		if (clean.length < 9) h3fail.push(`${model} K=${k}`);
		console.log(
			`  ${model} K=${k}: fence clean updates ${pct(clean.length, cells.length)}`,
		);
	}
}
const opusPairs = k20Pairs(OPUS);
const opusFenceOk = [...opusPairs.values()].filter(
	(s) => s.fence && det(s.fence).goalSafe,
).length;
if (opusFenceOk < 9) h3fail.push(`${OPUS} K=20 goal-safe ${opusFenceOk}/10`);
console.log(`  opus guard: fence K=20 goal-safe ${pct(opusFenceOk, 10)}`);
const h3pass = h3fail.length === 0;

// H4 — cost of the fence (descriptive; flag if fence outTok > 2x control)
console.log(
	"\n## AL-H4 — fence cost at K=20 (flag: fence output tokens > 2x control)",
);
let h4flag = false;
for (const model of MODELS) {
	const pairs = [...k20Pairs(model).values()].filter((s) => s.fence && s.ctl);
	const fRaw = mean(
		pairs.map((s) => det(s.fence as TaskRunRecord).rawLength ?? 0),
	);
	const cRaw = mean(
		pairs.map((s) => det(s.ctl as TaskRunRecord).rawLength ?? 0),
	);
	const fOut = mean(
		pairs.map((s) => (s.fence as TaskRunRecord).totalOutputTokens),
	);
	const cOut = mean(
		pairs.map((s) => (s.ctl as TaskRunRecord).totalOutputTokens),
	);
	const flagged = cOut > 0 && fOut > 2 * cOut;
	if (flagged) h4flag = true;
	console.log(
		`  ${model}: raw list ${fRaw.toFixed(1)} vs ${cRaw.toFixed(1)}; output tokens ${fOut.toFixed(0)} vs ${cOut.toFixed(0)}${flagged ? " — FLAG" : ""}`,
	);
}
for (const model of MODELS) {
	for (const k of [10, 19]) {
		const cells = records.filter(
			(r) =>
				r.model === model && det(r).arm === "AL-fence" && det(r).kLevel === k,
		);
		const raws = mean(cells.map((r) => det(r).rawLength ?? 0));
		console.log(
			`  ${model} K=${k}: fence mean raw list ${raws.toFixed(1)} (expected ${k + 1})`,
		);
	}
}

// H5 — descriptive: post-notice behavior + control replication vs AK
console.log("\n## AL-H5 — descriptive");
for (const model of MODELS) {
	const fence20 = records.filter(
		(r) =>
			r.model === model && det(r).arm === "AL-fence" && det(r).kLevel === 20,
	);
	const overs = fence20.filter((r) => det(r).overCap).length;
	const multi = fence20.filter((r) => det(r).toolCalls > 1);
	const readded = fence20.filter((r) => det(r).readdedEvicted === true);
	// Consolidation signature: reacted to the notice with a shorter final
	// list that still carries every needle (the AK opus observation).
	const consolidated = fence20.filter((r) => {
		const d = det(r);
		const lens = d.rawLengths;
		return (
			d.toolCalls > 1 &&
			d.goalSafe &&
			lens.length > 1 &&
			(lens[lens.length - 1] as number) < (lens[0] as number)
		);
	});
	console.log(
		`  ${model} fence K=20: over-sends ${overs}/10, multi-call ${multi.length}, re-added evicted ${readded.length}, consolidation-like ${consolidated.length}`,
	);
}
console.log("  control-arm K=20 residue vs AK (replication check):");
for (const model of MODELS) {
	const ctl20 = records.filter(
		(r) =>
			r.model === model && det(r).arm === "AK-eviction" && det(r).kLevel === 20,
	);
	const overs = ctl20.filter((r) => det(r).overCap).length;
	const prunes = ctl20.filter((r) => pruned(r)).length;
	const ak = AK_RESIDUE[model] as { overSends: number; prunes: number };
	console.log(
		`    ${model}: now over-sends ${overs}/10, prunes ${prunes}/10 · AK [over-sends ${ak.overSends}/10, prunes ${ak.prunes}/10]`,
	);
}

// Totals + gates
const inTok = records.reduce((s, r) => s + r.totalInputTokens, 0);
const outTok = records.reduce((s, r) => s + r.totalOutputTokens, 0);
console.log(
	`\n## Totals\n  ${records.length} records, ${inTok} in + ${outTok} out`,
);

console.log("\n## Pre-registered gates");
console.log(
	`  ${h1pass ? "PASS " : "FAIL "} AL-H1: pooled p=${h1p.toFixed(4)} (gate <.05), per-tier fence prunes ${PRUNER_MODELS.map((m) => `${m.split("/")[1]} ${fencePrunesByModel[m]}/10`).join(", ")} (gate <=1/10 each)`,
);
console.log(
	`  ${h2pass ? "PASS " : "FAIL "} AL-H2: fence goal-safe >=9/10 per pruner tier`,
);
console.log(
	`  ${h3pass ? "PASS " : "FAIL "} AL-H3: no new damage (failures: ${h3fail.join("; ") || "none"})`,
);
console.log(
	`  ${h4flag ? "FLAG " : "ok   "} AL-H4: fence cost ${h4flag ? "exceeds 2x control output tokens" : "within 2x control"}`,
);
console.log(
	`\n  STUDY GATE (AL-H1..H3): ${h1pass && h2pass && h3pass ? "PASS" : "FAIL"}`,
);
