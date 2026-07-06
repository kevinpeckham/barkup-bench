/**
 * Study H corpus (docs/BRIEF-H.md): 15 transformation tasks per size
 * bucket xl/xxl/xxxl, all five edit kinds cycling, fresh seed.
 * Committed as corpus/size-extension.json before any scored H call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { Edit } from "../src/corpus/edits.js";
import { applyEdit, describeEdit, generateEdit } from "../src/corpus/edits.js";
import { createRng } from "../src/corpus/rng.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import type { BucketName } from "../src/corpus/trees.js";
import { countNodes } from "../src/tree.js";

/** Pre-registered Study H seed. */
export const SIZE_EXT_SEED = 20260708;

const EDIT_KINDS: Edit["kind"][] = [
	"set-attribute",
	"set-name",
	"remove-node",
	"insert-node",
	"move-node",
];

const tasks: TransformationTask[] = [];
for (const bucket of ["xl", "xxl", "xxxl"] as BucketName[]) {
	const trees = sampleTrees(BUCKETS[bucket], SIZE_EXT_SEED, 15);
	trees.forEach((tree, index) => {
		const rng = createRng(SIZE_EXT_SEED + index * 211 + 13);
		const edit = generateEdit(tree, rng, EDIT_KINDS[index % EDIT_KINDS.length]);
		tasks.push({
			id: `trans-${bucket}-${index + 1}`,
			family: "transformation",
			bucket,
			tree,
			edit,
			instruction: describeEdit(tree, edit),
			expected: applyEdit(tree, edit),
		});
	});
	console.log(`${bucket}: 15 tasks generated`);
}

const corpus: Corpus = { version: 1, seed: SIZE_EXT_SEED, tasks };
mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/size-extension.json",
	`${JSON.stringify(corpus, null, "\t")}\n`,
);
console.log(
	`corpus/size-extension.json — ${tasks.length} tasks; node counts per bucket:`,
);
for (const bucket of ["xl", "xxl", "xxxl"]) {
	const counts = tasks
		.filter((t) => t.bucket === bucket)
		.map((t) => countNodes(t.tree));
	console.log(
		`  ${bucket}: min ${Math.min(...counts)}, max ${Math.max(...counts)}`,
	);
}
