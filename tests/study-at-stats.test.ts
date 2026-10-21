/**
 * Grader tests for Study AT pairing + gate evaluation
 * (src/harness/study-at-stats.ts) — thresholds pinned BEFORE the first
 * scored run (docs/BRIEF-AT.md).
 */

import { describe, expect, test } from "bun:test";
import type {
	ItemRunRecord,
	VerifyReport,
} from "../src/harness/pdf-pipeline-runner";
import {
	AT_G2_REQUIRED_WINS,
	evaluateArmStructure,
	evaluatePairedWins,
	evaluateStudyAt,
} from "../src/harness/study-at-stats";

function report(overrides: Partial<VerifyReport>): VerifyReport {
	return {
		finalScore: 0.7,
		finalStructureScore: 0.85,
		findingsApplied: 2,
		initialScore: 0.6,
		initialStructureScore: 0.8,
		iterations: 1,
		reverted: false,
		...overrides,
	};
}

function record(
	slug: string,
	reports: VerifyReport[],
	overrides: Partial<ItemRunRecord> = {},
): ItemRunRecord {
	return {
		baseUrl: "",
		buildCount: 5,
		cleanup: null,
		completed: true,
		fallbackCount: 0,
		finalState: null,
		invariantViolations: [],
		pdfSha256: "",
		regionCountByPage: {},
		replicatorCommit: "",
		reuseCount: 2,
		slug,
		stages: [],
		startedAtIso: "",
		tier: "T1",
		totalMs: 0,
		verify: Object.fromEntries(reports.map((r, i) => [String(i), r])),
		...overrides,
	};
}

/** 12 items / 16 pages matching the corpus shape. */
function corpus(reportFor: (slug: string, page: number) => VerifyReport) {
	const shape: Array<[string, number]> = [
		["t1-memo", 1],
		["t1-event-flyer", 1],
		["t1-press-release", 1],
		["t1-menu", 1],
		["t2-product-sheet", 1],
		["t2-stat-onepager", 1],
		["t2-newsletter", 1],
		["t2-agenda", 1],
		["t3-annual-report", 2],
		["t3-case-study", 2],
		["t3-brochure", 2],
		["t3-prospectus", 2],
	];
	return shape.map(([slug, pages]) =>
		record(
			slug,
			Array.from({ length: pages }, (_, i) => reportFor(slug, i)),
		),
	);
}

describe("evaluateArmStructure", () => {
	test("passes on clean uplift, fails on an invariant violation", () => {
		const good = corpus(() =>
			report({ finalStructureScore: 0.86, initialStructureScore: 0.8 }),
		);
		const verdict = evaluateArmStructure(good);
		expect(verdict.pass).toBe(true);
		expect(verdict.correctedPageCount).toBe(16);
		expect(verdict.medianStructureUplift).toBeCloseTo(0.06, 5);

		const bad = corpus((slug, page) =>
			slug === "t1-menu" && page === 0
				? report({ finalStructureScore: 0.7, initialStructureScore: 0.8 })
				: report({}),
		);
		const badVerdict = evaluateArmStructure(bad);
		expect(badVerdict.pass).toBe(false);
		expect(badVerdict.invariantViolations).toEqual(["t1-menu p0"]);
	});

	test("fails when median uplift is under +0.03", () => {
		const flat = corpus(() =>
			report({ finalStructureScore: 0.81, initialStructureScore: 0.8 }),
		);
		expect(evaluateArmStructure(flat).pass).toBe(false);
	});

	test("pages above the 0.95 threshold don't count as corrected", () => {
		const high = corpus(() =>
			report({ finalStructureScore: 0.97, initialStructureScore: 0.96 }),
		);
		const verdict = evaluateArmStructure(high);
		expect(verdict.correctedPageCount).toBe(0);
		expect(verdict.medianStructureUplift).toBeNull();
		expect(verdict.pass).toBe(false); // no refinement evidence → fail closed
	});
});

describe("evaluatePairedWins", () => {
	test("counts wins/losses/ties against the baseline by slug+page", () => {
		const baseline = corpus(() => report({ finalScore: 0.6 }));
		const arm = corpus((slug) =>
			slug === "t1-memo"
				? report({ finalScore: 0.5 })
				: report({ finalScore: 0.7 }),
		);
		const verdict = evaluatePairedWins(arm, baseline);
		expect(verdict.pairedPages).toBe(16);
		expect(verdict.wins).toBe(15);
		expect(verdict.losses).toBe(1);
		expect(verdict.pass).toBe(true);
	});

	test(`exactly ${AT_G2_REQUIRED_WINS} wins passes; one fewer fails`, () => {
		const baseline = corpus(() => report({ finalScore: 0.6 }));
		let winBudget = AT_G2_REQUIRED_WINS;
		const arm = corpus(() => {
			const win = winBudget > 0;
			if (win) winBudget--;
			return report({ finalScore: win ? 0.7 : 0.6 });
		});
		expect(evaluatePairedWins(arm, baseline).wins).toBe(AT_G2_REQUIRED_WINS);
		expect(evaluatePairedWins(arm, baseline).pass).toBe(true);

		let smallerBudget = AT_G2_REQUIRED_WINS - 1;
		const weaker = corpus(() => {
			const win = smallerBudget > 0;
			if (win) smallerBudget--;
			return report({ finalScore: win ? 0.7 : 0.6 });
		});
		expect(evaluatePairedWins(weaker, baseline).pass).toBe(false);
	});
});

describe("evaluateStudyAt", () => {
	test("full verdict wiring across arms", () => {
		// AS-era baseline records carry no structure fields.
		const baseline = corpus(() => {
			const {
				finalStructureScore: _f,
				initialStructureScore: _i,
				...rest
			} = report({ finalScore: 0.6 });
			return rest;
		});
		const brand = corpus(() => report({ finalScore: 0.62 }));
		const match = corpus(() => report({ finalScore: 0.75 }));

		const verdicts = evaluateStudyAt({ baseline, brand, match });
		expect(verdicts.g1.pass).toBe(true);
		expect(verdicts.g2.pass).toBe(true);
		expect(verdicts.g3Brand.pass).toBe(true);
		expect(verdicts.g3Match.pass).toBe(true);
		expect(verdicts.g4.pass).toBe(true);
		expect(verdicts.g5.pass).toBe(true);
	});

	test("G5 trips when the brand arm visibly spends appearance", () => {
		const baseline = corpus(() => report({ finalScore: 0.634 }));
		const brand = corpus(() => report({ finalScore: 0.59 }));
		const match = corpus(() => report({ finalScore: 0.75 }));
		expect(evaluateStudyAt({ baseline, brand, match }).g5.pass).toBe(false);
	});

	test("G1 trips on a failed arm", () => {
		const baseline = corpus(() => report({}));
		const brand = corpus(() => report({}));
		brand[0] = { ...(brand[0] as ItemRunRecord), completed: false };
		brand[1] = { ...(brand[1] as ItemRunRecord), completed: false };
		const match = corpus(() => report({}));
		expect(evaluateStudyAt({ baseline, brand, match }).g1.pass).toBe(false);
	});
});
