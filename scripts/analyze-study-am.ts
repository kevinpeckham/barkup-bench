/**
 * Study AM analysis (docs/BRIEF-AM.md): H1 elicitation on the shipped
 * tier (opus lossless-recovery among notice-delivered cells, invite vs
 * control, paired McNemar), H2 no new damage (zero degraded invite
 * cells on any model), H3 sub-frontier elicitation (descriptive), H4
 * cost/shape/drift (descriptive).
 *
 *   bun run scripts/analyze-study-am.ts > results/analysis-study-am.txt
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
const OPUS = "anthropic/claude-opus-4.8";

/** AK/AL eviction-arm K=20 pathway splits, for the drift check. */
const PRIOR_OVERSENDS: Record<string, { ak: number; al: number }> = {
	"anthropic/claude-sonnet-4.5": { ak: 6, al: 8 },
	"google/gemini-3.5-flash": { ak: 4, al: 7 },
	"anthropic/claude-opus-4.8": { ak: 9, al: 10 },
};

interface Consolidation {
	noticeDelivered: boolean;
	outcome: string;
	needlesPresent: number;
	goalsInGoalNotes: boolean;
	extraEvictions: number;
	survivingInOriginalKind: number;
	survivingOld: number;
	finalNoteCount: number;
}

interface Detail {
	arm: string;
	toolCalls: number;
	rawLengths: number[];
	prunedKinds: string[];
	consolidation?: Consolidation;
}

const records: TaskRunRecord[] = [];
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const lines = readFileSync(`results/raw/studyam-${slug}.jsonl`, "utf8")
		.trim()
		.split("\n");
	for (const line of lines) records.push(JSON.parse(line) as TaskRunRecord);
}
const det = (r: TaskRunRecord): Detail => r.detail as unknown as Detail;
const con = (r: TaskRunRecord): Consolidation | undefined =>
	det(r).consolidation;
const pct = (ok: number, n: number): string => {
	if (n === 0) return "0/0";
	const w = wilson(ok, n);
	return `${ok}/${n} (${(100 * w.proportion).toFixed(1)}% [${(100 * w.low).toFixed(1)}%,${(100 * w.high).toFixed(1)}%])`;
};

console.log(`# Study AM — consolidation-on-notice (${records.length} records)`);

function pairs(
	model: string,
): Map<string, { invite?: TaskRunRecord; ctl?: TaskRunRecord }> {
	const byTask = new Map<
		string,
		{ invite?: TaskRunRecord; ctl?: TaskRunRecord }
	>();
	for (const r of records.filter((x) => x.model === model)) {
		const slot = byTask.get(r.taskId) ?? {};
		if (det(r).arm === "AM-invite") slot.invite = r;
		if (det(r).arm === "AM-control") slot.ctl = r;
		byTask.set(r.taskId, slot);
	}
	return byTask;
}

// H1 — elicitation on the shipped tier
console.log(
	"\n## AM-H1 — opus lossless-recovery among notice-delivered cells (gate: McNemar p<.05 AND invite >=60%)",
);
let h1p = 1;
let h1rate = 0;
for (const model of MODELS) {
	const byTask = pairs(model);
	let bothNoticed = 0;
	let inviteOnly = 0;
	let ctlOnly = 0;
	let inviteLossless = 0;
	let inviteNoticed = 0;
	let ctlLossless = 0;
	let ctlNoticed = 0;
	for (const slot of byTask.values()) {
		const iv = slot.invite ? con(slot.invite) : undefined;
		const cv = slot.ctl ? con(slot.ctl) : undefined;
		if (iv?.noticeDelivered) {
			inviteNoticed += 1;
			if (iv.outcome === "lossless-recovery") inviteLossless += 1;
		}
		if (cv?.noticeDelivered) {
			ctlNoticed += 1;
			if (cv.outcome === "lossless-recovery") ctlLossless += 1;
		}
		if (iv?.noticeDelivered && cv?.noticeDelivered) {
			bothNoticed += 1;
			const a = iv.outcome === "lossless-recovery";
			const b = cv.outcome === "lossless-recovery";
			if (a && !b) inviteOnly += 1;
			if (!a && b) ctlOnly += 1;
		}
	}
	const p = mcnemarExact(inviteOnly, ctlOnly).pValue;
	if (model === OPUS) {
		h1p = p;
		h1rate = inviteNoticed === 0 ? 0 : inviteLossless / inviteNoticed;
	}
	console.log(
		`  ${model}: invite lossless ${pct(inviteLossless, inviteNoticed)} vs control ${pct(ctlLossless, ctlNoticed)} — both-noticed pairs ${bothNoticed}, invite-only ${inviteOnly}, control-only ${ctlOnly}, p=${p.toFixed(4)}`,
	);
}
const h1pass = h1p < 0.05 && h1rate >= 0.6;

// H2 — no new damage (zero degraded invite cells, any model)
console.log("\n## AM-H2 — no new damage (gate: zero degraded invite cells)");
const degraded = records.filter(
	(r) => det(r).arm === "AM-invite" && con(r)?.outcome === "degraded",
);
for (const model of MODELS) {
	const inv = records.filter(
		(r) => r.model === model && det(r).arm === "AM-invite",
	);
	const bad = inv.filter((r) => con(r)?.outcome === "degraded");
	const ctlBad = records.filter(
		(r) =>
			r.model === model &&
			det(r).arm === "AM-control" &&
			con(r)?.outcome === "degraded",
	);
	console.log(
		`  ${model}: invite degraded ${bad.length}/${inv.length} (control ${ctlBad.length})`,
	);
	for (const r of bad) {
		const c = con(r) as Consolidation;
		console.log(
			`    DEGRADED ${r.taskId}: needles ${c.needlesPresent}, goalsInGoalNotes=${c.goalsInGoalNotes}, extraEvictions=${c.extraEvictions}`,
		);
	}
}
const h2pass = degraded.length === 0;

// H3 — sub-frontier reactions (descriptive)
console.log("\n## AM-H3 — reactions by tier (descriptive)");
for (const model of MODELS) {
	for (const arm of ["AM-invite", "AM-control"]) {
		const cells = records.filter(
			(r) => r.model === model && det(r).arm === arm,
		);
		const noticed = cells.filter((r) => con(r)?.noticeDelivered);
		const reacted = noticed.filter((r) => det(r).toolCalls > 1);
		const accepted = noticed.filter(
			(r) => con(r)?.outcome === "eviction-accepted",
		);
		const lossless = noticed.filter(
			(r) => con(r)?.outcome === "lossless-recovery",
		);
		console.log(
			`  ${model} ${arm}: noticed ${noticed.length}/${cells.length}, reacted ${reacted.length}, lossless ${lossless.length}, accepted ${accepted.length}`,
		);
	}
}

// H4 — cost, shape, drift (descriptive)
console.log("\n## AM-H4 — cost, shape, drift (descriptive)");
for (const model of MODELS) {
	const inv = records.filter(
		(r) => r.model === model && det(r).arm === "AM-invite",
	);
	const noticed = inv.filter((r) => con(r)?.noticeDelivered);
	const lossless = noticed.filter(
		(r) => con(r)?.outcome === "lossless-recovery",
	);
	const meanOut = (xs: TaskRunRecord[]) =>
		xs.length === 0
			? 0
			: xs.reduce((s, r) => s + r.totalOutputTokens, 0) / xs.length;
	const kindStats = lossless.reduce(
		(acc, r) => {
			const c = con(r) as Consolidation;
			return {
				faithful: acc.faithful + c.survivingInOriginalKind,
				surviving: acc.surviving + c.survivingOld,
			};
		},
		{ faithful: 0, surviving: 0 },
	);
	const notes = lossless.map((r) => (con(r) as Consolidation).finalNoteCount);
	const churn = inv.reduce((s, r) => s + (con(r)?.extraEvictions ?? 0), 0);
	console.log(
		`  ${model}: invite mean output tokens ${meanOut(inv).toFixed(0)} (control ${meanOut(
			records.filter((r) => r.model === model && det(r).arm === "AM-control"),
		).toFixed(
			0,
		)}); lossless note counts [${notes.join(",")}]; kind fidelity ${kindStats.faithful}/${kindStats.surviving}; re-add churn evictions ${churn}`,
	);
}
console.log("  over-send drift check (this run vs AK/AL eviction arms /10):");
for (const model of MODELS) {
	for (const arm of ["AM-control", "AM-invite"]) {
		const cells = records.filter(
			(r) => r.model === model && det(r).arm === arm,
		);
		const noticed = cells.filter((r) => con(r)?.noticeDelivered).length;
		const prior = PRIOR_OVERSENDS[model] as { ak: number; al: number };
		console.log(
			`    ${model} ${arm}: notice-delivered ${noticed}/${cells.length} · AK ${prior.ak}/10, AL ${prior.al}/10`,
		);
	}
}

// Totals + gates
const inTok = records.reduce((s, r) => s + r.totalInputTokens, 0);
const outTok = records.reduce((s, r) => s + r.totalOutputTokens, 0);
console.log(
	`\n## Totals\n  ${records.length} records, ${inTok} in + ${outTok} out`,
);

console.log("\n## Pre-registered gates");
console.log(
	`  ${h1pass ? "PASS " : "FAIL "} AM-H1: opus invite lossless-recovery ${(100 * h1rate).toFixed(0)}% (gate >=60%), McNemar p=${h1p.toFixed(4)} (gate <.05)`,
);
console.log(
	`  ${h2pass ? "PASS " : "FAIL "} AM-H2: degraded invite cells ${degraded.length} (gate: zero)`,
);
console.log(
	`\n  STUDY GATE (AM-H1..H2): ${h1pass && h2pass ? "PASS" : "FAIL"}`,
);
