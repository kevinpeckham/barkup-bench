/**
 * Study AS — aggregation + registered-gate evaluation over raw per-item
 * records produced by scripts/run-study-as.ts. Pure functions; unit-tested
 * in tests/study-as-stats.test.ts (graders get unit tests).
 *
 * Gates (registered in docs/BRIEF-AS.md):
 *   G1 completion: ≥ 11 of 12 items complete every stage.
 *   G2 fidelity: median finalScore (all pages) ≥ 0.70 AND T1 median ≥ 0.80.
 *   G3 refinement: (a) finalScore ≥ initialScore on EVERY page;
 *      (b) median uplift ≥ +0.05 among pages with initialScore < 0.92.
 *   G4 build integrity: fallback widgets ≤ 10% of built widgets.
 */

export type StudyAsTier = "T1" | "T2" | "T3";

export interface StudyAsPageResult {
	pageIndex: number;
	initialScore: number;
	finalScore: number;
	iterations: number;
	findingsApplied: number;
	reverted: boolean;
}

export interface StudyAsItemResult {
	slug: string;
	tier: StudyAsTier;
	/** All six stages completed without a pipeline error. */
	completed: boolean;
	/** Stage that failed when completed=false (e.g. "decompose p2"). */
	failedStage?: string;
	pages: StudyAsPageResult[];
	regionCount: number;
	reuseCount: number;
	buildCount: number;
	/** Count of built widgets flagged fallback. */
	fallbackCount: number;
	totalMs: number;
}

export interface StudyAsGateVerdicts {
	g1Completion: { pass: boolean; completed: number; required: number };
	g2Fidelity: {
		pass: boolean;
		medianAll: number | null;
		medianT1: number | null;
	};
	g3Refinement: {
		pass: boolean;
		invariantViolations: string[];
		medianUplift: number | null;
		correctedPageCount: number;
	};
	g4BuildIntegrity: {
		pass: boolean;
		fallbacks: number;
		built: number;
		rate: number | null;
	};
}

export interface StudyAsSummary {
	itemCount: number;
	completedCount: number;
	pageCount: number;
	gates: StudyAsGateVerdicts;
	perTier: Record<
		StudyAsTier,
		{
			items: number;
			pages: number;
			medianInitial: number | null;
			medianFinal: number | null;
			reuseRate: number | null;
		}
	>;
}

/** Threshold below which a page enters the correction loop (shipped). */
export const VERIFY_THRESHOLD = 0.92;

export function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid] ?? null;
	return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function tierOf(slug: string): StudyAsTier {
	if (slug.startsWith("t1-")) return "T1";
	if (slug.startsWith("t2-")) return "T2";
	return "T3";
}

export function evaluateGates(items: StudyAsItemResult[]): StudyAsGateVerdicts {
	const completed = items.filter((i) => i.completed).length;
	const pages = items.flatMap((i) =>
		i.pages.map((p) => ({ ...p, slug: i.slug, tier: i.tier })),
	);

	const allFinals = pages.map((p) => p.finalScore);
	const t1Finals = pages
		.filter((p) => p.tier === "T1")
		.map((p) => p.finalScore);
	const medianAll = median(allFinals);
	const medianT1 = median(t1Finals);

	const invariantViolations = pages
		.filter((p) => p.finalScore < p.initialScore)
		.map((p) => `${p.slug} p${p.pageIndex}`);
	const correctedPages = pages.filter((p) => p.initialScore < VERIFY_THRESHOLD);
	const medianUplift = median(
		correctedPages.map((p) => p.finalScore - p.initialScore),
	);

	const built = items.reduce((n, i) => n + i.buildCount, 0);
	const fallbacks = items.reduce((n, i) => n + i.fallbackCount, 0);
	const fallbackRate = built > 0 ? fallbacks / built : null;

	return {
		g1Completion: {
			completed,
			pass: completed >= 11,
			required: 11,
		},
		g2Fidelity: {
			medianAll,
			medianT1,
			pass:
				medianAll !== null &&
				medianAll >= 0.7 &&
				medianT1 !== null &&
				medianT1 >= 0.8,
		},
		g3Refinement: {
			correctedPageCount: correctedPages.length,
			invariantViolations,
			medianUplift,
			pass:
				invariantViolations.length === 0 &&
				medianUplift !== null &&
				medianUplift >= 0.05,
		},
		g4BuildIntegrity: {
			built,
			fallbacks,
			pass: built === 0 || fallbacks / built <= 0.1,
			rate: fallbackRate,
		},
	};
}

export function summarizeStudyAs(items: StudyAsItemResult[]): StudyAsSummary {
	const tiers: StudyAsTier[] = ["T1", "T2", "T3"];
	const perTier = {} as StudyAsSummary["perTier"];
	for (const tier of tiers) {
		const tierItems = items.filter((i) => i.tier === tier);
		const tierPages = tierItems.flatMap((i) => i.pages);
		const decisions = tierItems.reduce(
			(acc, i) => ({
				build: acc.build + i.buildCount,
				reuse: acc.reuse + i.reuseCount,
			}),
			{ build: 0, reuse: 0 },
		);
		const totalDecisions = decisions.build + decisions.reuse;
		perTier[tier] = {
			items: tierItems.length,
			medianFinal: median(tierPages.map((p) => p.finalScore)),
			medianInitial: median(tierPages.map((p) => p.initialScore)),
			pages: tierPages.length,
			reuseRate: totalDecisions > 0 ? decisions.reuse / totalDecisions : null,
		};
	}
	return {
		completedCount: items.filter((i) => i.completed).length,
		gates: evaluateGates(items),
		itemCount: items.length,
		pageCount: items.reduce((n, i) => n + i.pages.length, 0),
		perTier,
	};
}
