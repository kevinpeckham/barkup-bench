/**
 * The regression-gate manifest (docs/REGRESSION.md): the benchmark's
 * sharpest shipped-guardrail constructions, packaged as pass/fail
 * gates that can be re-run against any gateway model id. Thresholds
 * are registered in REGRESSION.md and encoded here; they are fixed
 * per run and never adjusted after looking at a result (amendments
 * happen by commit, before the next run).
 *
 * This module holds gate metadata and the PURE evaluation functions
 * over TaskRunRecord[]; scripts/regress.ts owns cell construction
 * and execution.
 */
import type { TaskRunRecord } from "../harness/records.js";

export interface GateCheck {
	name: string;
	value: number;
	/** Human-readable registered threshold, e.g. ">=43/45" or "==0". */
	threshold: string;
	pass: boolean;
}

export interface GateResult {
	id: string;
	title: string;
	pass: boolean;
	/** True when the record set is too small to evaluate (run incomplete). */
	incomplete: boolean;
	checks: GateCheck[];
}

export interface GateDef {
	id: string;
	title: string;
	/** The shipped mechanism this gate protects (replicator surface). */
	protects: string;
	sourceStudy: string;
	/** Total records the runner is expected to produce for this gate. */
	expectedRecords: number;
	evaluate: (records: TaskRunRecord[]) => GateResult;
}

function detail(r: TaskRunRecord): Record<string, unknown> {
	return (r.detail ?? {}) as Record<string, unknown>;
}

function scorable(r: TaskRunRecord): boolean {
	return typeof detail(r).blocked !== "string";
}

function successCount(rows: TaskRunRecord[]): number {
	return rows.filter((r) => r.success).length;
}

function atLeast(
	name: string,
	value: number,
	min: number,
	denominator: number,
): GateCheck {
	return {
		name,
		value,
		threshold: `>=${min}/${denominator}`,
		pass: value >= min,
	};
}

function atMost(
	name: string,
	value: number,
	max: number,
	denominator: number,
): GateCheck {
	return {
		name,
		value,
		threshold: `<=${max}/${denominator}`,
		pass: value <= max,
	};
}

function result(
	id: string,
	title: string,
	incomplete: boolean,
	checks: GateCheck[],
): GateResult {
	return {
		id,
		title,
		incomplete,
		pass: !incomplete && checks.every((c) => c.pass),
		checks,
	};
}

/** Simple success-rate gate over a fixed cell count. */
function successGate(
	def: Omit<GateDef, "evaluate"> & { min: number },
): GateDef {
	return {
		...def,
		evaluate: (records) =>
			result(def.id, def.title, records.length < def.expectedRecords, [
				atLeast("solved", successCount(records), def.min, def.expectedRecords),
			]),
	};
}

export const GATES: GateDef[] = [
	successGate({
		id: "dialect",
		title: "Anchored-patch dialect (condition F, main-corpus slice)",
		protects: "apply_template_patch funnel (every editing surface)",
		sourceStudy: "F/AD",
		expectedRecords: 20,
		min: 17,
	}),
	successGate({
		id: "views",
		title: "HTML focused views at ~1000 nodes (FVH, xxxl)",
		protects: "get_template_view at the >=300-node threshold",
		sourceStudy: "I/J/AD",
		expectedRecords: 15,
		min: 13,
	}),
	successGate({
		id: "search",
		title: "Search-then-patch grounding (N-search slice)",
		protects: "find_nodes content search",
		sourceStudy: "N/AD",
		expectedRecords: 15,
		min: 11,
	}),
	{
		id: "focus-solve",
		title: "Focus-ids contract, solvable cells (U-view2 construction)",
		protects: "view scope as a correctness contract (U fences, v3.182.0)",
		sourceStudy: "U/AC/AD",
		expectedRecords: 45,
		evaluate: (records) => {
			const solved = records.filter(
				(r) => detail(r).outcome === "solved",
			).length;
			const wrong = records.filter(
				(r) => detail(r).outcome === "wrong-patch",
			).length;
			return result(
				"focus-solve",
				"Focus-ids contract, solvable cells (U-view2 construction)",
				records.length < 45,
				[
					atLeast("solved", solved, 43, 45),
					atMost("silent wrong patches", wrong, 2, 45),
				],
			);
		},
	},
	{
		id: "ask-hatch",
		title: "NEED-INFO escape hatch fires and calibrates (AC-rule)",
		protects: "ask-path prompt rules (v3.191.0)",
		sourceStudy: "AC",
		expectedRecords: 90,
		evaluate: (records) => {
			const view1 = records.filter((r) => r.condition === "AC-rule-view1");
			const view2 = records.filter((r) => r.condition === "AC-rule-view2");
			const asked1 = view1.filter((r) => detail(r).outcome === "asked").length;
			const falseAsks = view2.filter(
				(r) => detail(r).outcome === "asked",
			).length;
			const solved2 = view2.filter(
				(r) => detail(r).outcome === "solved",
			).length;
			return result(
				"ask-hatch",
				"NEED-INFO escape hatch fires and calibrates (AC-rule)",
				view1.length < 45 || view2.length < 45,
				[
					atLeast("asked on unsolvable", asked1, 43, 45),
					atMost("false asks on solvable", falseAsks, 2, 45),
					atLeast("solved on solvable", solved2, 43, 45),
				],
			);
		},
	},
	{
		id: "echo",
		title: "Last-edit echo carries anaphora (X-lastedit)",
		protects: "lastEditEcho (v3.184.0)",
		sourceStudy: "X",
		expectedRecords: 144,
		evaluate: (records) => {
			const rows = records.filter(scorable);
			const anaphora = rows.filter((r) => detail(r).anaphora != null);
			const ordinary = rows.filter((r) => detail(r).anaphora == null);
			return result(
				"echo",
				"Last-edit echo carries anaphora (X-lastedit)",
				anaphora.length < 48,
				[
					atLeast("anaphora steps", successCount(anaphora), 45, 48),
					atLeast(
						"ordinary steps",
						successCount(ordinary),
						Math.ceil(ordinary.length * 0.95),
						ordinary.length,
					),
				],
			);
		},
	},
	{
		id: "memo-block",
		title: "Session-notes block carries callbacks (T-notes slice)",
		protects: "sessionNotes prompt block (v3.183.0)",
		sourceStudy: "T",
		expectedRecords: 120,
		evaluate: (records) => {
			const callbacks = records.filter(
				(r) => scorable(r) && detail(r).callback != null,
			);
			return result(
				"memo-block",
				"Session-notes block carries callbacks (T-notes slice)",
				callbacks.length < 40,
				[atLeast("callback steps", successCount(callbacks), 38, 40)],
			);
		},
	},
	{
		id: "memo-agent",
		title: "Agent-maintained memo extraction (W-agent slice)",
		protects: "update_session_notes tool loop (v3.183.0)",
		sourceStudy: "W",
		expectedRecords: 216,
		evaluate: (records) => {
			const callbacks = records.filter(
				(r) => scorable(r) && detail(r).callback != null,
			);
			return result(
				"memo-agent",
				"Agent-maintained memo extraction (W-agent slice)",
				callbacks.length < 36,
				[atLeast("callback steps", successCount(callbacks), 32, 36)],
			);
		},
	},
	{
		id: "precedence",
		title:
			"PRECEDENCE clause: countermands honored, steering intact (AB-clause)",
		protects: "formatSessionNotesBlockV2 precedence clause (v3.188.1)",
		sourceStudy: "AB",
		expectedRecords: 24,
		evaluate: (records) => {
			const override = records.filter((r) => detail(r).kind === "override");
			const ri = records.filter((r) => detail(r).kind === "ri");
			const violations = records.filter(
				(r) => detail(r).reading === "violation",
			).length;
			return result(
				"precedence",
				"PRECEDENCE clause: countermands honored, steering intact (AB-clause)",
				override.length < 12 || ri.length < 12,
				[
					atLeast(
						"countermands honored",
						override.filter((r) => detail(r).reading === "honored").length,
						10,
						12,
					),
					atLeast(
						"satisfy-both on rule-instruction",
						ri.filter((r) => detail(r).reading === "both").length,
						10,
						12,
					),
					atMost("violations", violations, 0, 24),
				],
			);
		},
	},
	{
		id: "standing-pack",
		title:
			"Standing brand pack: facts, rules, zero contamination (Z-full slice)",
		protects: "per-org Context block + buildCachedSystem (v3.185.0)",
		sourceStudy: "Z",
		expectedRecords: 24,
		evaluate: (records) => {
			const contamination = records.reduce(
				(sum, r) =>
					sum +
					((detail(r).contamination as string[] | undefined)?.length ?? 0),
				0,
			);
			return result(
				"standing-pack",
				"Standing brand pack: facts, rules, zero contamination (Z-full slice)",
				records.length < 24,
				[
					atLeast("fact+rule cells passed", successCount(records), 22, 24),
					atMost("contamination events", contamination, 0, 24),
				],
			);
		},
	},
];

export function gateById(id: string): GateDef {
	const gate = GATES.find((g) => g.id === id);
	if (!gate) throw new Error(`unknown gate: ${id}`);
	return gate;
}
