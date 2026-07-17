/**
 * Study AK analysis (docs/BRIEF-AK.md): H1 mechanical guarantee on
 * over-cap cells, H2 goal-safe eviction vs control at K=20 (McNemar
 * per model), H3 no new damage at K=10/19, H4 descriptive residue.
 *
 *   bun run scripts/analyze-study-ak.ts > results/analysis-study-ak.txt
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

/** AH's K=20 taxonomy (results/analysis-study-ah.txt), for the
 * control-arm replication check. */
const AH_K20: Record<string, Record<string, number>> = {
	"anthropic/claude-sonnet-4.5": { "over-cap-lost-old": 7, "pruned-old": 3 },
	"google/gemini-3.5-flash": { "pruned-old": 8, "over-cap-lost-old": 2 },
	"anthropic/claude-opus-4.8": { "over-cap-lost-old": 10 },
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
	const lines = readFileSync(`results/raw/studyak-${slug}.jsonl`, "utf8")
		.trim()
		.split("\n");
	for (const line of lines) records.push(JSON.parse(line) as TaskRunRecord);
}
const det = (r: TaskRunRecord): Detail => r.detail as unknown as Detail;
const pct = (ok: number, n: number): string => {
	const w = wilson(ok, n);
	return `${ok}/${n} (${(100 * w.proportion).toFixed(1)}% [${(100 * w.low).toFixed(1)}%,${(100 * w.high).toFixed(1)}%])`;
};

console.log(`# Study AK — eviction validation (${records.length} records)`);

// H1 — mechanical guarantee on over-cap cells (pooled, eviction arm)
console.log(
	"\n## AK-H1 — mechanical guarantee (eviction arm, raw > cap; gate: 100%)",
);
const overCap = records.filter(
	(r) => det(r).arm === "AK-eviction" && det(r).overCap,
);
const violations = overCap.filter(
	(r) =>
		det(r).evictedKinds.includes("goal") || det(r).designedEviction !== true,
);
console.log(
	`  over-cap eviction cells: ${overCap.length} — designed evictions ${overCap.length - violations.length}, violations ${violations.length}`,
);
for (const r of violations) {
	console.log(
		`    VIOLATION ${r.model} ${r.taskId}: evictedKinds=${det(r).evictedKinds.join(",")} lostPost=${det(r).lostPost.join(",")}`,
	);
}

// H2 — goal-safe at K=20, eviction vs control, McNemar per model
console.log("\n## AK-H2 — goal-safe at K=20, eviction vs control (per model)");
const h2: Record<string, { p: number; evOk: number }> = {};
for (const model of MODELS) {
	const k20 = records.filter((r) => r.model === model && det(r).kLevel === 20);
	const byTask = new Map<string, { ev?: boolean; ctl?: boolean }>();
	for (const r of k20) {
		const slot = byTask.get(r.taskId) ?? {};
		if (det(r).arm === "AK-eviction") slot.ev = det(r).goalSafe;
		if (det(r).arm === "AK-control") slot.ctl = det(r).goalSafe;
		byTask.set(r.taskId, slot);
	}
	let evOk = 0;
	let ctlOk = 0;
	let evOnly = 0;
	let ctlOnly = 0;
	for (const slot of byTask.values()) {
		if (slot.ev) evOk += 1;
		if (slot.ctl) ctlOk += 1;
		if (slot.ev && !slot.ctl) evOnly += 1;
		if (!slot.ev && slot.ctl) ctlOnly += 1;
	}
	const p = mcnemarExact(evOnly, ctlOnly).pValue;
	h2[model] = { p, evOk };
	console.log(
		`  ${model}: eviction ${pct(evOk, byTask.size)} vs control ${pct(ctlOk, byTask.size)} — eviction-only ${evOnly}, control-only ${ctlOnly}, p=${p.toFixed(4)}`,
	);
}

// H3 — no new damage under the cap (eviction arm, K=10/19)
console.log(
	"\n## AK-H3 — no new damage under the cap (eviction arm; gate >=9/10 per K per model)",
);
const h3fail: string[] = [];
for (const model of MODELS) {
	for (const k of [10, 19]) {
		const cells = records.filter(
			(r) =>
				r.model === model &&
				det(r).arm === "AK-eviction" &&
				det(r).kLevel === k,
		);
		const clean = cells.filter((r) => det(r).outcome === "clean-update");
		const pass = clean.length >= 9;
		if (!pass) h3fail.push(`${model} K=${k}`);
		console.log(
			`  ${model} K=${k}: clean updates ${pct(clean.length, cells.length)} → ${pass ? "PASS" : "FAIL"}`,
		);
	}
}

// H4 — descriptive: prune residue, post-notice behavior, control replication
console.log("\n## AK-H4 — descriptive");
for (const model of MODELS) {
	const ev20 = records.filter(
		(r) =>
			r.model === model && det(r).arm === "AK-eviction" && det(r).kLevel === 20,
	);
	const overs = ev20.filter((r) => det(r).overCap).length;
	const prunes = ev20.filter((r) => det(r).prunedKinds.length > 0);
	const pruneKinds = prunes.flatMap((r) => det(r).prunedKinds);
	const multi = ev20.filter((r) => det(r).toolCalls > 1);
	const readded = ev20.filter((r) => det(r).readdedEvicted === true);
	console.log(
		`  ${model} eviction K=20: over-sends ${overs}/10, client prunes ${prunes.length}/10 (victim kinds: ${pruneKinds.join(",") || "none"}), multi-call ${multi.length}, re-added evicted ${readded.length}`,
	);
}
console.log("  control-arm K=20 taxonomy vs AH:");
for (const model of MODELS) {
	const ctl = records.filter(
		(r) =>
			r.model === model && det(r).arm === "AK-control" && det(r).kLevel === 20,
	);
	const counts = new Map<string, number>();
	for (const r of ctl)
		counts.set(det(r).outcome, (counts.get(det(r).outcome) ?? 0) + 1);
	const now = [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([k, v]) => `${k} ${v}`)
		.join(", ");
	const ah = Object.entries(AH_K20[model] ?? {})
		.map(([k, v]) => `${k} ${v}`)
		.join(", ");
	const ctlGoalSafe = ctl.filter((r) => det(r).goalSafe).length;
	console.log(
		`    ${model}: now [${now}] goal-safe ${ctlGoalSafe}/10 · AH [${ah}]`,
	);
}
const edits = records.filter((r) => det(r).editApplied).length;
console.log(`  edit applied alongside the update: ${edits}/${records.length}`);

// Totals + gates
const inTok = records.reduce((s, r) => s + r.totalInputTokens, 0);
const outTok = records.reduce((s, r) => s + r.totalOutputTokens, 0);
console.log(
	`\n## Totals\n  ${records.length} records, ${inTok} in + ${outTok} out`,
);

console.log("\n## Pre-registered gates");
const h1pass = violations.length === 0 && overCap.length > 0;
console.log(
	`  ${h1pass ? "PASS " : "FAIL "} AK-H1: ${overCap.length - violations.length}/${overCap.length} over-cap cells designed evictions (gate 100%)`,
);
const sigModels = MODELS.filter((m) => (h2[m] as { p: number }).p < 0.05);
const opusOk = (h2["anthropic/claude-opus-4.8"] as { evOk: number }).evOk >= 9;
const h2pass = sigModels.length >= 2 && opusOk;
console.log(
	`  ${h2pass ? "PASS " : "FAIL "} AK-H2: significant on ${sigModels.length}/3 models (gate >=2) AND opus eviction goal-safe ${(h2["anthropic/claude-opus-4.8"] as { evOk: number }).evOk}/10 (gate >=9)`,
);
const h3pass = h3fail.length === 0;
console.log(
	`  ${h3pass ? "PASS " : "FAIL "} AK-H3: under-cap clean (failures: ${h3fail.join("; ") || "none"})`,
);
console.log(
	`\n  STUDY GATE (AK-H1..H3): ${h1pass && h2pass && h3pass ? "PASS" : "FAIL"}`,
);
