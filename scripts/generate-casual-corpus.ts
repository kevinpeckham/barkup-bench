/**
 * Study Y corpus (docs/BRIEF-Y.md): 12 twin pairs (7 l, 5 xl) × 12
 * steps — the same session dressed in formulaic and casual riders.
 * Committed as corpus/sessions-casual.json before any scored Y call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { YPair } from "../src/corpus/casual.js";
import { generateYPair, validateYPair } from "../src/corpus/casual.js";
import { createRng } from "../src/corpus/rng.js";
import type { BucketName } from "../src/corpus/trees.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";

/** Pre-registered Study Y seed. */
export const Y_SEED = 20260719;

const PER_BUCKET: [BucketName, number][] = [
	["l", 7],
	["xl", 5],
];

const pairs: YPair[] = [];
for (const [bucket, count] of PER_BUCKET) {
	const trees = sampleTrees(BUCKETS[bucket], Y_SEED, count);
	trees.forEach((tree, index) => {
		const rng = createRng(Y_SEED + index * 313 + 7);
		const riderRng = createRng(Y_SEED + index * 719 + 13);
		const pair = generateYPair(
			tree,
			rng,
			riderRng,
			`sessy-${bucket}-${index + 1}`,
			bucket,
		);
		const problems = validateYPair(pair);
		if (problems.length > 0) {
			throw new Error(
				`corpus bug ${pair.formulaic.id}:\n${problems.join("\n")}`,
			);
		}
		pairs.push(pair);
	});
	console.log(`${bucket}: ${count} pairs generated`);
}

mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/sessions-casual.json",
	`${JSON.stringify({ version: 1, seed: Y_SEED, pairs }, null, "\t")}\n`,
);
console.log(
	`corpus/sessions-casual.json — ${pairs.length} twin pairs × 12 steps`,
);
console.log(
	`  example casual rider: ${pairs[0]?.casual.steps[0]?.instruction.split(". ").slice(-1)[0]}`,
);
