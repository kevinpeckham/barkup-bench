/**
 * Study V judge gate (docs/BRIEF-V.md): runs BEFORE any scored editing
 * call. Both judges, both orders per pair. The primary judge must pass
 * or the study halts.
 *
 *   bun run scripts/run-judge-calibration.ts
 */
import {
	appendFileSync,
	existsSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import type { CalibrationPair } from "../src/corpus/calibration.js";
import { CALIBRATION_GATE } from "../src/corpus/calibration.js";
import {
	judgeBothOrders,
	PRIMARY_JUDGE,
	SENSITIVITY_JUDGE,
} from "../src/judging/judge.js";

const corpus = JSON.parse(
	readFileSync("corpus/judge-calibration.json", "utf8"),
) as { pairs: CalibrationPair[] };

const lines: string[] = ["# Study V — judge calibration gate\n"];
let primaryPassed = false;

for (const judge of [PRIMARY_JUDGE, SENSITIVITY_JUDGE]) {
	const slug = judge.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyv-calibration-${slug}.jsonl`;
	const done = new Map<string, { verdict: string }>();
	if (existsSync(outPath)) {
		for (const line of readFileSync(outPath, "utf8").split("\n")) {
			if (!line.trim()) continue;
			const r = JSON.parse(line) as { id: string; verdict: string };
			done.set(r.id, r);
		}
	}

	let known = 0;
	let identityTies = 0;
	let length = 0;
	for (const pair of corpus.pairs) {
		let verdict: string;
		const existing = done.get(pair.id);
		if (existing) {
			verdict = existing.verdict;
		} else {
			const result = await judgeBothOrders(
				judge,
				pair.thesis,
				pair.original,
				pair.a,
				pair.b,
			);
			verdict = result.verdict;
			appendFileSync(
				outPath,
				`${JSON.stringify({ id: pair.id, kind: pair.kind, expected: pair.expected, ...result })}\n`,
			);
		}
		if (pair.kind === "known" && verdict === pair.expected) known += 1;
		if (pair.kind === "identity" && verdict === "tie") identityTies += 1;
		if (pair.kind === "length" && verdict === pair.expected) length += 1;
	}

	const pass =
		known >= CALIBRATION_GATE.knownMin &&
		identityTies >= CALIBRATION_GATE.identityTieMin &&
		length >= CALIBRATION_GATE.lengthMin;
	if (judge === PRIMARY_JUDGE) primaryPassed = pass;
	const line = `${judge}: known ${known}/30 (gate ≥${CALIBRATION_GATE.knownMin}) · identity ties ${identityTies}/10 (≥${CALIBRATION_GATE.identityTieMin}) · length ${length}/10 (≥${CALIBRATION_GATE.lengthMin}) → ${pass ? "PASS" : "FAIL"}`;
	lines.push(line);
	console.log(line);
}

writeFileSync(
	"results/analysis-judge-calibration.txt",
	`${lines.join("\n")}\n`,
);
if (!primaryPassed) {
	console.error("\nPRIMARY JUDGE FAILED ITS GATE — study halts (BRIEF-V).");
	process.exit(1);
}
console.log("\nJudge gate passed — scored editing runs may proceed.");
