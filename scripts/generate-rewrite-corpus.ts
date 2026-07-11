/**
 * Study V corpus (docs/BRIEF-V.md): 30 planted-defect rewrite tasks
 * plus the judge-calibration suite. Committed before any scored call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
	CALIBRATION_GATE,
	generateCalibration,
} from "../src/corpus/calibration.js";
import {
	domainVocabularyProblems,
	generateRewriteTask,
	validateRewriteTask,
} from "../src/corpus/rewrite.js";
import { createRng } from "../src/corpus/rng.js";

/** Pre-registered Study V seeds. */
export const REWRITE_SEED = 20260715;
export const CALIBRATION_SEED = 20260716;

const vocab = domainVocabularyProblems();
if (vocab.length > 0) {
	throw new Error(`domain vocabulary bug:\n${vocab.join("\n")}`);
}

const rng = createRng(REWRITE_SEED);
const tasks = Array.from({ length: 30 }, (_, i) => generateRewriteTask(rng, i));
for (const task of tasks) {
	const problems = validateRewriteTask(task);
	if (problems.length > 0) {
		throw new Error(`corpus bug ${task.id}:\n${problems.join("\n")}`);
	}
}

mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/rewrite.json",
	`${JSON.stringify({ version: 1, seed: REWRITE_SEED, tasks }, null, "\t")}\n`,
);
console.log(`corpus/rewrite.json — ${tasks.length} tasks, all validated`);
console.log(`  example: ${tasks[0]?.thesis}`);
console.log(`  planted: ${tasks[0]?.original.slice(0, 100)}`);

const calibration = generateCalibration(createRng(CALIBRATION_SEED));
writeFileSync(
	"corpus/judge-calibration.json",
	`${JSON.stringify({ version: 1, seed: CALIBRATION_SEED, pairs: calibration }, null, "\t")}\n`,
);
console.log(
	`corpus/judge-calibration.json — ${calibration.length} pairs (gate: ≥${CALIBRATION_GATE.knownMin}/30 known, ≥${CALIBRATION_GATE.identityTieMin}/10 identity ties, ≥${CALIBRATION_GATE.lengthMin}/10 length)`,
);
