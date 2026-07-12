/**
 * Study X corpus (docs/BRIEF-X.md): 12 anaphora sessions (7 l, 5 xl)
 * × 12 steps on the fixed predecessor→anaphora schedule. Committed as
 * corpus/sessions-anaphora.json before any scored X call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { XTask } from "../src/corpus/anaphora.js";
import { generateXTask, validateXTask } from "../src/corpus/anaphora.js";
import { createRng } from "../src/corpus/rng.js";
import type { BucketName } from "../src/corpus/trees.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import { countNodes } from "../src/tree.js";

/** Pre-registered Study X seed. */
export const X_SEED = 20260718;

const PER_BUCKET: [BucketName, number][] = [
	["l", 7],
	["xl", 5],
];

const sessions: XTask[] = [];
for (const [bucket, count] of PER_BUCKET) {
	const trees = sampleTrees(BUCKETS[bucket], X_SEED, count);
	trees.forEach((tree, index) => {
		const rng = createRng(X_SEED + index * 313 + 7);
		const task = generateXTask(
			tree,
			rng,
			`sessx-${bucket}-${index + 1}`,
			bucket,
		);
		const problems = validateXTask(task);
		if (problems.length > 0) {
			throw new Error(`corpus bug ${task.id}:\n${problems.join("\n")}`);
		}
		sessions.push(task);
	});
	console.log(`${bucket}: ${count} sessions generated`);
}

mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/sessions-anaphora.json",
	`${JSON.stringify({ version: 1, seed: X_SEED, sessions }, null, "\t")}\n`,
);

const anaphora = sessions.flatMap((s) => s.steps).filter((s) => s.anaphora);
console.log(
	`corpus/sessions-anaphora.json — ${sessions.length} sessions × 12 steps; ${anaphora.length} anaphora steps (${anaphora.filter((s) => s.anaphora === "amend").length} amend, ${anaphora.filter((s) => s.anaphora === "repeat").length} repeat, ${anaphora.filter((s) => s.anaphora === "undo").length} undo)`,
);
for (const [bucket] of PER_BUCKET) {
	const counts = sessions
		.filter((s) => s.bucket === bucket)
		.map((s) => countNodes(s.tree));
	console.log(
		`  ${bucket}: nodes min ${Math.min(...counts)}, max ${Math.max(...counts)}`,
	);
}
