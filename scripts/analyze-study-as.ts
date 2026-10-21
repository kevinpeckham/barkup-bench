/**
 * Study AS analyzer — aggregates results/raw/study-as/*.json into per-tier
 * tables and the four registered gate verdicts (docs/BRIEF-AS.md).
 * Aggregation + gate logic live in src/harness/study-as-stats.ts (unit
 * tested); this script is presentation only.
 */

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { ItemRunRecord } from "../src/harness/pdf-pipeline-runner";
import {
	type StudyAsItemResult,
	summarizeStudyAs,
	tierOf,
} from "../src/harness/study-as-stats";

const RESULTS_DIR = resolve(import.meta.dir, "../results/raw/study-as");

function toItemResult(record: ItemRunRecord): StudyAsItemResult {
	return {
		buildCount: record.buildCount,
		completed: record.completed,
		fallbackCount: record.fallbackCount,
		...(record.failedStage ? { failedStage: record.failedStage } : {}),
		pages: Object.entries(record.verify).map(([index, r]) => ({
			finalScore: r.finalScore,
			findingsApplied: r.findingsApplied,
			initialScore: r.initialScore,
			iterations: r.iterations,
			pageIndex: Number(index),
			reverted: r.reverted,
		})),
		regionCount: Object.values(record.regionCountByPage).reduce(
			(a, b) => a + b,
			0,
		),
		reuseCount: record.reuseCount,
		slug: record.slug,
		tier: tierOf(record.slug),
		totalMs: record.totalMs,
	};
}

function fmt(n: number | null, digits = 3): string {
	return n === null ? "—" : n.toFixed(digits);
}

async function main() {
	const files = (await readdir(RESULTS_DIR)).filter(
		(f) => f.endsWith(".json") && !f.startsWith("tmp-"),
	);
	const records: ItemRunRecord[] = [];
	for (const file of files.sort()) {
		records.push(
			(await Bun.file(`${RESULTS_DIR}/${file}`).json()) as ItemRunRecord,
		);
	}
	const items = records.map(toItemResult);
	const summary = summarizeStudyAs(items);

	console.log(
		`Study AS — ${summary.itemCount} items, ${summary.pageCount} scored pages\n`,
	);

	console.log("Per item:");
	for (const item of items) {
		const scores = item.pages
			.map(
				(p) =>
					`p${p.pageIndex} ${p.initialScore.toFixed(3)}→${p.finalScore.toFixed(3)} (${p.iterations} iter${p.reverted ? ", reverted" : ""})`,
			)
			.join("; ");
		console.log(
			`  ${item.slug.padEnd(18)} ${item.completed ? "ok  " : "FAIL"} regions=${String(item.regionCount).padStart(2)} reuse=${item.reuseCount} build=${item.buildCount} fb=${item.fallbackCount} ${(item.totalMs / 1000).toFixed(0).padStart(4)}s ${scores}${item.failedStage ? ` [${item.failedStage}]` : ""}`,
		);
	}

	console.log("\nPer tier:");
	for (const [tier, t] of Object.entries(summary.perTier)) {
		console.log(
			`  ${tier}: ${t.items} items, ${t.pages} pages — median initial ${fmt(t.medianInitial)}, median final ${fmt(t.medianFinal)}, reuse rate ${fmt(t.reuseRate, 2)}`,
		);
	}

	const g = summary.gates;
	console.log("\nRegistered gates:");
	console.log(
		`  G1 completion     ${g.g1Completion.pass ? "PASS" : "FAIL"} — ${g.g1Completion.completed}/${summary.itemCount} completed (need ≥ ${g.g1Completion.required})`,
	);
	console.log(
		`  G2 fidelity       ${g.g2Fidelity.pass ? "PASS" : "FAIL"} — median all ${fmt(g.g2Fidelity.medianAll)} (≥ 0.700), T1 ${fmt(g.g2Fidelity.medianT1)} (≥ 0.800)`,
	);
	console.log(
		`  G3 refinement     ${g.g3Refinement.pass ? "PASS" : "FAIL"} — keep-best violations: ${g.g3Refinement.invariantViolations.length === 0 ? "none" : g.g3Refinement.invariantViolations.join(", ")}; median uplift ${fmt(g.g3Refinement.medianUplift)} over ${g.g3Refinement.correctedPageCount} corrected pages (≥ +0.050)`,
	);
	console.log(
		`  G4 build integrity ${g.g4BuildIntegrity.pass ? "PASS" : "FAIL"} — ${g.g4BuildIntegrity.fallbacks}/${g.g4BuildIntegrity.built} fallbacks (${fmt(g.g4BuildIntegrity.rate, 3)} ≤ 0.100)`,
	);
}

await main();
