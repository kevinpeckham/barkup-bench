/**
 * Study AV analyzer — see docs/BRIEF-AV.md (pre-registered). Aggregates
 * results/raw/study-av/{fable,jev}/*.json: gates AV-G1..G3, paired
 * per-page structure deltas, reuse/build economics, match-stage
 * wall-clock, divergence anatomy (|Δstructure| > 0.05).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { median, tierOf } from "../src/harness/study-as-stats";

interface Raw {
	slug: string;
	completed: boolean;
	reuseCount: number;
	buildCount: number;
	fallbackCount: number;
	totalMs: number;
	replicatorCommit: string;
	regionCountByPage: Record<string, number>;
	verify: Record<string, { finalScore: number; finalStructureScore: number }>;
	stages: { stage: string; ms: number }[];
}

const DIR = resolve(import.meta.dir, "../results/raw/study-av");
const load = (arm: string): Raw[] =>
	readdirSync(`${DIR}/${arm}`)
		.filter((f) => f.endsWith(".json"))
		.map((f) => JSON.parse(readFileSync(`${DIR}/${arm}/${f}`, "utf8")) as Raw);

const fable = load("fable");
const jev = load("jev");
const commits = new Set([...fable, ...jev].map((r) => r.replicatorCommit));
console.log(`Study AV — ${fable.length} fable / ${jev.length} jev items, commit(s): ${[...commits].map((c) => c.slice(0, 7)).join(", ")}`);

function armStats(items: Raw[], name: string) {
	const completed = items.filter((i) => i.completed).length;
	const regions = items.reduce((a, i) => a + Object.values(i.regionCountByPage).reduce((x, y) => x + y, 0), 0);
	const reuse = items.reduce((a, i) => a + i.reuseCount, 0);
	const build = items.reduce((a, i) => a + i.buildCount, 0);
	const fallback = items.reduce((a, i) => a + i.fallbackCount, 0);
	const matchMs = items.reduce((a, i) => a + i.stages.filter((s) => s.stage === "match").reduce((x, s) => x + s.ms, 0), 0);
	const totalMs = items.reduce((a, i) => a + i.totalMs, 0);
	const structs = items.flatMap((i) => Object.values(i.verify).map((v) => v.finalStructureScore));
	console.log(
		`${name}: completed ${completed}/${items.length}, regions ${regions}, reuse ${reuse} (${((100 * reuse) / Math.max(1, reuse + build)).toFixed(1)}%), build ${build}, fallback ${fallback} (${((100 * fallback) / Math.max(1, build)).toFixed(1)}%), match ${(matchMs / 1000).toFixed(0)}s, total ${(totalMs / 60000).toFixed(1)}min, median structure ${median(structs)?.toFixed(3)}`,
	);
	return { completed, reuse, build, fallback, matchMs, totalMs };
}
const fs_ = armStats(fable, "AV-fable");
const js_ = armStats(jev, "AV-jev  ");

console.log("\nGates:");
console.log(`  AV-G1 completion: fable ${fs_.completed}/12 ${fs_.completed === 12 ? "PASS" : "FAIL"}, jev ${js_.completed}/12 ${js_.completed === 12 ? "PASS" : "FAIL"}`);
const fFall = fs_.fallback / Math.max(1, fs_.build);
const jFall = js_.fallback / Math.max(1, js_.build);
console.log(`  AV-G2 build integrity: fable ${(100 * fFall).toFixed(1)}% ${fFall <= 0.1 ? "PASS" : "FAIL"}, jev ${(100 * jFall).toFixed(1)}% ${jFall <= 0.1 ? "PASS" : "FAIL"}`);

// AV-G3: paired per page on finalStructureScore.
const deltas: { slug: string; page: string; f: number; j: number; d: number }[] = [];
for (const fi of fable) {
	const ji = jev.find((x) => x.slug === fi.slug);
	if (!ji) continue;
	for (const page of Object.keys(fi.verify)) {
		const f = fi.verify[page]?.finalStructureScore;
		const j = ji.verify[page]?.finalStructureScore;
		if (f === undefined || j === undefined) continue;
		deltas.push({ slug: fi.slug, page, f, j, d: j - f });
	}
}
const medDelta = median(deltas.map((x) => x.d));
console.log(`  AV-G3 fidelity no-harm: median Δstructure (jev − fable) = ${medDelta?.toFixed(3)} over ${deltas.length} pages → ${medDelta !== null && medDelta >= -0.03 ? "PASS" : "FAIL"}`);

console.log("\nPer-tier paired medians (jev − fable):");
for (const tier of ["T1", "T2", "T3"] as const) {
	const t = deltas.filter((x) => tierOf(x.slug) === tier);
	console.log(`  ${tier}: Δ ${median(t.map((x) => x.d))?.toFixed(3)} over ${t.length} pages (fable ${median(t.map((x) => x.f))?.toFixed(3)} → jev ${median(t.map((x) => x.j))?.toFixed(3)})`);
}

console.log("\nDivergent pages (|Δ| > 0.05):");
for (const x of deltas.filter((x) => Math.abs(x.d) > 0.05).sort((a, b) => a.d - b.d)) {
	console.log(`  ${x.slug} p${x.page}: fable ${x.f.toFixed(3)} vs jev ${x.j.toFixed(3)} (Δ ${x.d >= 0 ? "+" : ""}${x.d.toFixed(3)})`);
}

console.log("\nEconomics:");
console.log(`  match wall-clock: fable ${(fs_.matchMs / 1000).toFixed(0)}s vs jev ${(js_.matchMs / 1000).toFixed(0)}s (×${(fs_.matchMs / Math.max(1, js_.matchMs)).toFixed(1)})`);
console.log(`  total wall-clock: fable ${(fs_.totalMs / 60000).toFixed(1)}min vs jev ${(js_.totalMs / 60000).toFixed(1)}min`);
console.log(`  widgets built: fable ${fs_.build} vs jev ${js_.build} (${(100 * (1 - js_.build / Math.max(1, fs_.build))).toFixed(1)}% fewer)`);
