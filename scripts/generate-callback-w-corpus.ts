/**
 * Study W corpus (docs/BRIEF-W.md): 12 callback sessions (7 l, 5 xl)
 * × 36 steps on the fixed window-crossing schedule. Committed as
 * corpus/sessions-callback-long.json before any scored W call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { WTask } from "../src/corpus/callbacks-w.js";
import { generateWTask, validateWTask } from "../src/corpus/callbacks-w.js";
import { createRng } from "../src/corpus/rng.js";
import type { BucketName } from "../src/corpus/trees.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import { countNodes } from "../src/tree.js";

/** Pre-registered Study W seed. */
export const W_SEED = 20260717;

const PER_BUCKET: [BucketName, number][] = [
	["l", 7],
	["xl", 5],
];

const sessions: WTask[] = [];
for (const [bucket, count] of PER_BUCKET) {
	const trees = sampleTrees(BUCKETS[bucket], W_SEED, count);
	trees.forEach((tree, index) => {
		const rng = createRng(W_SEED + index * 313 + 7);
		const task = generateWTask(
			tree,
			rng,
			`sessw-${bucket}-${index + 1}`,
			bucket,
		);
		const problems = validateWTask(task);
		if (problems.length > 0) {
			throw new Error(`corpus bug ${task.id}:\n${problems.join("\n")}`);
		}
		sessions.push(task);
	});
	console.log(`${bucket}: ${count} sessions generated`);
}

mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/sessions-callback-long.json",
	`${JSON.stringify({ version: 1, seed: W_SEED, sessions }, null, "\t")}\n`,
);

const callbacks = sessions.flatMap((s) => s.steps).filter((s) => s.callback);
console.log(
	`corpus/sessions-callback-long.json — ${sessions.length} sessions × 36 steps; ${callbacks.length} callback steps (${callbacks.filter((s) => s.callback === "fact").length} fact, ${callbacks.filter((s) => s.callback === "rule").length} rule)`,
);
for (const [bucket] of PER_BUCKET) {
	const counts = sessions
		.filter((s) => s.bucket === bucket)
		.map((s) => countNodes(s.tree));
	console.log(
		`  ${bucket}: nodes min ${Math.min(...counts)}, max ${Math.max(...counts)}`,
	);
}
