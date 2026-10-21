/**
 * Grader tests for Study AS aggregation + gate evaluation
 * (src/harness/study-as-stats.ts). The gates are registered in
 * docs/BRIEF-AS.md — these tests pin the thresholds and edge semantics
 * BEFORE the first scored run.
 */

import { describe, expect, test } from "bun:test";
import {
	evaluateGates,
	median,
	type StudyAsItemResult,
	summarizeStudyAs,
	tierOf,
	VERIFY_THRESHOLD,
} from "../src/harness/study-as-stats";

function item(overrides: Partial<StudyAsItemResult>): StudyAsItemResult {
	return {
		buildCount: 2,
		completed: true,
		fallbackCount: 0,
		pages: [
			{
				finalScore: 0.8,
				findingsApplied: 3,
				initialScore: 0.6,
				iterations: 1,
				pageIndex: 0,
				reverted: false,
			},
		],
		regionCount: 5,
		reuseCount: 3,
		slug: "t1-memo",
		tier: "T1",
		totalMs: 60_000,
		...overrides,
	};
}

/** 12 completed items passing every gate: T1/T2 4 each (1 page), T3 4 (2 pages). */
function passingCorpus(): StudyAsItemResult[] {
	const slugs: Array<[string, number]> = [
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
	return slugs.map(([slug, pageCount]) =>
		item({
			pages: Array.from({ length: pageCount }, (_, i) => ({
				finalScore: slug.startsWith("t1-") ? 0.85 : 0.75,
				findingsApplied: 2,
				initialScore: 0.55,
				iterations: 1,
				pageIndex: i,
				reverted: false,
			})),
			slug,
			tier: tierOf(slug),
		}),
	);
}

function at(corpus: StudyAsItemResult[], i: number): StudyAsItemResult {
	const entry = corpus[i];
	if (!entry) throw new Error(`no corpus item at ${i}`);
	return entry;
}

describe("median", () => {
	test("empty → null", () => {
		expect(median([])).toBeNull();
	});
	test("odd and even lengths", () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 2, 3])).toBe(2.5);
	});
	test("does not mutate input", () => {
		const input = [3, 1, 2];
		median(input);
		expect(input).toEqual([3, 1, 2]);
	});
});

describe("tierOf", () => {
	test("maps slug prefixes", () => {
		expect(tierOf("t1-menu")).toBe("T1");
		expect(tierOf("t2-agenda")).toBe("T2");
		expect(tierOf("t3-brochure")).toBe("T3");
	});
});

describe("evaluateGates", () => {
	test("full passing corpus passes all four gates", () => {
		const gates = evaluateGates(passingCorpus());
		expect(gates.g1Completion.pass).toBe(true);
		expect(gates.g2Fidelity.pass).toBe(true);
		expect(gates.g3Refinement.pass).toBe(true);
		expect(gates.g4BuildIntegrity.pass).toBe(true);
	});

	test("G1: 10/12 completed fails, 11/12 passes", () => {
		const corpus = passingCorpus();
		corpus[0] = {
			...at(corpus, 0),
			completed: false,
			failedStage: "decompose p1",
		};
		expect(evaluateGates(corpus).g1Completion.pass).toBe(true); // 11/12
		corpus[1] = { ...at(corpus, 1), completed: false };
		expect(evaluateGates(corpus).g1Completion.pass).toBe(false); // 10/12
	});

	test("G2: overall median below 0.70 fails", () => {
		const corpus = passingCorpus().map((i) =>
			i.tier === "T1"
				? i
				: {
						...i,
						pages: i.pages.map((p) => ({ ...p, finalScore: 0.5 })),
					},
		);
		const gates = evaluateGates(corpus);
		expect(gates.g2Fidelity.medianT1).toBeCloseTo(0.85, 5);
		expect(gates.g2Fidelity.pass).toBe(false);
	});

	test("G2: T1 median below 0.80 fails even when overall passes", () => {
		const corpus = passingCorpus().map((i) =>
			i.tier === "T1"
				? { ...i, pages: i.pages.map((p) => ({ ...p, finalScore: 0.79 })) }
				: { ...i, pages: i.pages.map((p) => ({ ...p, finalScore: 0.95 })) },
		);
		const gates = evaluateGates(corpus);
		expect(gates.g2Fidelity.medianAll).toBeGreaterThanOrEqual(0.7);
		expect(gates.g2Fidelity.pass).toBe(false);
	});

	test("G3a: a single keep-best violation fails and is named", () => {
		const corpus = passingCorpus();
		corpus[3] = {
			...at(corpus, 3),
			pages: [
				{
					finalScore: 0.5,
					findingsApplied: 1,
					initialScore: 0.6,
					iterations: 1,
					pageIndex: 0,
					reverted: false,
				},
			],
		};
		const gates = evaluateGates(corpus);
		expect(gates.g3Refinement.pass).toBe(false);
		expect(gates.g3Refinement.invariantViolations).toEqual(["t1-menu p0"]);
	});

	test("G3b: uplift measured only on pages entering correction", () => {
		// All pages start ABOVE threshold → no corrected pages → medianUplift
		// null → gate fails closed (no refinement evidence).
		const corpus = passingCorpus().map((i) => ({
			...i,
			pages: i.pages.map((p) => ({
				...p,
				finalScore: 0.96,
				initialScore: 0.95,
			})),
		}));
		const gates = evaluateGates(corpus);
		expect(gates.g3Refinement.correctedPageCount).toBe(0);
		expect(gates.g3Refinement.medianUplift).toBeNull();
		expect(gates.g3Refinement.pass).toBe(false);
		// Sanity: threshold constant matches the shipped pipeline.
		expect(VERIFY_THRESHOLD).toBe(0.92);
	});

	test("G3b: median uplift below +0.05 fails", () => {
		const corpus = passingCorpus().map((i) => ({
			...i,
			pages: i.pages.map((p) => ({
				...p,
				finalScore: 0.62,
				initialScore: 0.6,
			})),
		}));
		expect(evaluateGates(corpus).g3Refinement.pass).toBe(false);
	});

	test("G4: fallback rate above 10% fails; zero builds passes", () => {
		const corpus = passingCorpus();
		// 12 items × 2 builds = 24 built; 3 fallbacks = 12.5% → fail.
		corpus[0] = { ...at(corpus, 0), fallbackCount: 3 };
		expect(evaluateGates(corpus).g4BuildIntegrity.pass).toBe(false);
		// 2/24 ≈ 8.3% → pass.
		corpus[0] = { ...at(corpus, 0), fallbackCount: 2 };
		expect(evaluateGates(corpus).g4BuildIntegrity.pass).toBe(true);
		const noBuilds = passingCorpus().map((i) => ({
			...i,
			buildCount: 0,
			fallbackCount: 0,
		}));
		expect(evaluateGates(noBuilds).g4BuildIntegrity.pass).toBe(true);
	});
});

describe("summarizeStudyAs", () => {
	test("per-tier medians and reuse rates", () => {
		const summary = summarizeStudyAs(passingCorpus());
		expect(summary.itemCount).toBe(12);
		expect(summary.pageCount).toBe(16);
		expect(summary.perTier.T1.medianFinal).toBeCloseTo(0.85, 5);
		expect(summary.perTier.T3.pages).toBe(8);
		// Each item: 3 reuse / 2 build → reuse rate 0.6 everywhere.
		expect(summary.perTier.T2.reuseRate).toBeCloseTo(0.6, 5);
	});
});
