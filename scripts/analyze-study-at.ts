/**
 * Study AT analyzer — paired AS↔AT tables and the five registered gate
 * verdicts (docs/BRIEF-AT.md). Pairing/gate logic lives in
 * src/harness/study-at-stats.ts (unit-tested); this is presentation.
 */

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { ItemRunRecord } from "../src/harness/pdf-pipeline-runner";
import { median } from "../src/harness/study-as-stats";
import { collectPages, evaluateStudyAt } from "../src/harness/study-at-stats";

const RAW = resolve(import.meta.dir, "../results/raw");

async function loadDir(dir: string): Promise<ItemRunRecord[]> {
	const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
	const records: ItemRunRecord[] = [];
	for (const file of files.sort()) {
		records.push((await Bun.file(`${dir}/${file}`).json()) as ItemRunRecord);
	}
	return records;
}

function fmt(n: number | null | undefined, digits = 3): string {
	return n === null || n === undefined ? "  —  " : n.toFixed(digits);
}

async function main() {
	const baseline = await loadDir(`${RAW}/study-as`);
	const brand = await loadDir(`${RAW}/study-at/brand`);
	const match = await loadDir(`${RAW}/study-at/match`);

	const baselineByKey = new Map(
		collectPages(baseline).map((p) => [`${p.slug}#${p.pageIndex}`, p]),
	);
	const matchByKey = new Map(
		collectPages(match).map((p) => [`${p.slug}#${p.pageIndex}`, p]),
	);

	console.log(
		"Study AT — paired pages (appearance final: AS → AT-brand → AT-match; structure init→final per arm)\n",
	);
	for (const page of collectPages(brand)) {
		const key = `${page.slug}#${page.pageIndex}`;
		const base = baselineByKey.get(key);
		const m = matchByKey.get(key);
		console.log(
			`  ${page.slug.padEnd(18)} p${page.pageIndex}  AS ${fmt(base?.appearanceFinal)} → brand ${fmt(page.appearanceFinal)} → match ${fmt(m?.appearanceFinal)}   | struct brand ${fmt(page.structureInitial)}→${fmt(page.structureFinal)}  match ${fmt(m?.structureInitial)}→${fmt(m?.structureFinal)}`,
		);
	}

	const brandPages = collectPages(brand);
	const matchPages = collectPages(match);
	console.log(
		`\nMedians — appearance final: AS ${fmt(median(collectPages(baseline).map((p) => p.appearanceFinal)))}, brand ${fmt(median(brandPages.map((p) => p.appearanceFinal)))}, match ${fmt(median(matchPages.map((p) => p.appearanceFinal)))}`,
	);
	console.log(
		`Medians — structure final: brand ${fmt(median(brandPages.map((p) => p.structureFinal ?? -1).filter((v) => v >= 0)))}, match ${fmt(median(matchPages.map((p) => p.structureFinal ?? -1).filter((v) => v >= 0)))}`,
	);

	const v = evaluateStudyAt({ baseline, brand, match });
	console.log("\nRegistered gates:");
	console.log(
		`  AT-G1 completion       ${v.g1.pass ? "PASS" : "FAIL"} — brand ${v.g1.brandCompleted}/12, match ${v.g1.matchCompleted}/12 (need ≥ 11 each)`,
	);
	console.log(
		`  AT-G2 fidelity recovery ${v.g2.pass ? "PASS" : "FAIL"} — match beats AS on ${v.g2.wins}/${v.g2.pairedPages} pages (need ≥ 12; losses ${v.g2.losses}, ties ${v.g2.ties})`,
	);
	console.log(
		`  AT-G3 verify (brand)    ${v.g3Brand.pass ? "PASS" : "FAIL"} — violations: ${v.g3Brand.invariantViolations.length === 0 ? "none" : v.g3Brand.invariantViolations.join(", ")}; median structure uplift ${fmt(v.g3Brand.medianStructureUplift)} over ${v.g3Brand.correctedPageCount} pages (≥ +0.030)`,
	);
	console.log(
		`  AT-G3 verify (match)    ${v.g3Match.pass ? "PASS" : "FAIL"} — violations: ${v.g3Match.invariantViolations.length === 0 ? "none" : v.g3Match.invariantViolations.join(", ")}; median structure uplift ${fmt(v.g3Match.medianStructureUplift)} over ${v.g3Match.correctedPageCount} pages (≥ +0.030)`,
	);
	console.log(
		`  AT-G4 build integrity   ${v.g4.pass ? "PASS" : "FAIL"} — brand ${v.g4.brandFallbacks}/${v.g4.brandBuilds}, match ${v.g4.matchFallbacks}/${v.g4.matchBuilds} fallbacks (≤ 10%)`,
	);
	console.log(
		`  AT-G5 brand non-regress ${v.g5.pass ? "PASS" : "FAIL"} — brand median ${fmt(v.g5.brandMedianAppearance)} vs AS ${fmt(v.g5.baselineMedianAppearance)} (tolerance −0.030)`,
	);
}

await main();
