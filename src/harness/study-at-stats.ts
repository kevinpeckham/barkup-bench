/**
 * Study AT — pairing + registered-gate evaluation (docs/BRIEF-AT.md).
 * Pure functions over raw runner records; unit-tested in
 * tests/study-at-stats.test.ts before the first scored run.
 *
 * Gates:
 *   AT-G1 completion ≥ 11/12 per arm.
 *   AT-G2 match arm beats the AS baseline on appearance finalScore on
 *         ≥ 12 of 16 paired pages.
 *   AT-G3 per arm: structure keep-best holds on every page; median
 *         structure uplift ≥ +0.03 among pages entering correction
 *         (structure initial < 0.95).
 *   AT-G4 fallbacks ≤ 10% of builds per arm.
 *   AT-G5 brand-arm median appearance finalScore ≥ baseline median − 0.03.
 */

import type { ItemRunRecord } from "./pdf-pipeline-runner";
import { median } from "./study-as-stats";

export const AT_STRUCTURE_THRESHOLD = 0.95;
export const AT_MIN_STRUCTURE_UPLIFT = 0.03;
export const AT_G2_REQUIRED_WINS = 12;
export const AT_G5_TOLERANCE = 0.03;

export interface AtPage {
	slug: string;
	pageIndex: number;
	appearanceInitial: number;
	appearanceFinal: number;
	structureInitial: number | null;
	structureFinal: number | null;
}

export function collectPages(records: readonly ItemRunRecord[]): AtPage[] {
	return records.flatMap((record) =>
		Object.entries(record.verify).map(([index, report]) => ({
			appearanceFinal: report.finalScore,
			appearanceInitial: report.initialScore,
			pageIndex: Number(index),
			slug: record.slug,
			structureFinal: report.finalStructureScore ?? null,
			structureInitial: report.initialStructureScore ?? null,
		})),
	);
}

export interface ArmStructureVerdict {
	invariantViolations: string[];
	correctedPageCount: number;
	medianStructureUplift: number | null;
	pass: boolean;
}

export function evaluateArmStructure(
	records: readonly ItemRunRecord[],
): ArmStructureVerdict {
	const pages = collectPages(records);
	const withStructure = pages.filter(
		(p) => p.structureInitial !== null && p.structureFinal !== null,
	);
	const invariantViolations = withStructure
		.filter(
			(p) => (p.structureFinal as number) < (p.structureInitial as number),
		)
		.map((p) => `${p.slug} p${p.pageIndex}`);
	const corrected = withStructure.filter(
		(p) => (p.structureInitial as number) < AT_STRUCTURE_THRESHOLD,
	);
	const medianStructureUplift = median(
		corrected.map(
			(p) => (p.structureFinal as number) - (p.structureInitial as number),
		),
	);
	return {
		correctedPageCount: corrected.length,
		invariantViolations,
		medianStructureUplift,
		pass:
			invariantViolations.length === 0 &&
			medianStructureUplift !== null &&
			medianStructureUplift >= AT_MIN_STRUCTURE_UPLIFT,
	};
}

export interface PairedWinVerdict {
	pairedPages: number;
	wins: number;
	losses: number;
	ties: number;
	pass: boolean;
}

/** AT-G2: match-arm appearance finalScore vs the AS baseline, per page. */
export function evaluatePairedWins(
	armRecords: readonly ItemRunRecord[],
	baselineRecords: readonly ItemRunRecord[],
): PairedWinVerdict {
	const baselineByKey = new Map(
		collectPages(baselineRecords).map((p) => [`${p.slug}#${p.pageIndex}`, p]),
	);
	let wins = 0;
	let losses = 0;
	let ties = 0;
	let pairedPages = 0;
	for (const page of collectPages(armRecords)) {
		const baseline = baselineByKey.get(`${page.slug}#${page.pageIndex}`);
		if (!baseline) continue;
		pairedPages++;
		if (page.appearanceFinal > baseline.appearanceFinal) wins++;
		else if (page.appearanceFinal < baseline.appearanceFinal) losses++;
		else ties++;
	}
	return {
		losses,
		pairedPages,
		pass: wins >= AT_G2_REQUIRED_WINS,
		ties,
		wins,
	};
}

export interface StudyAtVerdicts {
	g1: { brandCompleted: number; matchCompleted: number; pass: boolean };
	g2: PairedWinVerdict;
	g3Brand: ArmStructureVerdict;
	g3Match: ArmStructureVerdict;
	g4: {
		brandFallbacks: number;
		brandBuilds: number;
		matchFallbacks: number;
		matchBuilds: number;
		pass: boolean;
	};
	g5: {
		brandMedianAppearance: number | null;
		baselineMedianAppearance: number | null;
		pass: boolean;
	};
}

export function evaluateStudyAt(args: {
	brand: readonly ItemRunRecord[];
	match: readonly ItemRunRecord[];
	baseline: readonly ItemRunRecord[];
}): StudyAtVerdicts {
	const brandCompleted = args.brand.filter((r) => r.completed).length;
	const matchCompleted = args.match.filter((r) => r.completed).length;

	const fallbackRateOk = (records: readonly ItemRunRecord[]) => {
		const builds = records.reduce((n, r) => n + r.buildCount, 0);
		const fallbacks = records.reduce((n, r) => n + r.fallbackCount, 0);
		return { builds, fallbacks, ok: builds === 0 || fallbacks / builds <= 0.1 };
	};
	const brandFb = fallbackRateOk(args.brand);
	const matchFb = fallbackRateOk(args.match);

	const brandMedianAppearance = median(
		collectPages(args.brand).map((p) => p.appearanceFinal),
	);
	const baselineMedianAppearance = median(
		collectPages(args.baseline).map((p) => p.appearanceFinal),
	);

	return {
		g1: {
			brandCompleted,
			matchCompleted,
			pass: brandCompleted >= 11 && matchCompleted >= 11,
		},
		g2: evaluatePairedWins(args.match, args.baseline),
		g3Brand: evaluateArmStructure(args.brand),
		g3Match: evaluateArmStructure(args.match),
		g4: {
			brandBuilds: brandFb.builds,
			brandFallbacks: brandFb.fallbacks,
			matchBuilds: matchFb.builds,
			matchFallbacks: matchFb.fallbacks,
			pass: brandFb.ok && matchFb.ok,
		},
		g5: {
			baselineMedianAppearance,
			brandMedianAppearance,
			pass:
				brandMedianAppearance !== null &&
				baselineMedianAppearance !== null &&
				brandMedianAppearance >= baselineMedianAppearance - AT_G5_TOLERANCE,
		},
	};
}
