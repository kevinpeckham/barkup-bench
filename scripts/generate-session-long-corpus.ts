/**
 * Study S corpus (docs/BRIEF-S.md): 5 sessions per bucket (l ~150,
 * xl ~300 nodes), 36 sequential edits each, fresh seed. Committed as
 * corpus/sessions-long.json before any scored S call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRng } from "../src/corpus/rng.js";
import type { SessionCorpus, SessionTask } from "../src/corpus/sessions.js";
import { generateSession, validateSession } from "../src/corpus/sessions.js";
import type { BucketName } from "../src/corpus/trees.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import { countNodes } from "../src/tree.js";

/** Pre-registered Study S seed. */
export const LONG_SESSION_SEED = 20260712;
/** Pre-registered Study S horizon. */
export const LONG_SESSION_STEPS = 36;

const sessions: SessionTask[] = [];
for (const bucket of ["l", "xl"] as BucketName[]) {
	const trees = sampleTrees(BUCKETS[bucket], LONG_SESSION_SEED, 5);
	trees.forEach((tree, index) => {
		const rng = createRng(LONG_SESSION_SEED + index * 313 + 7);
		const task = generateSession(
			tree,
			rng,
			`sesslong-${bucket}-${index + 1}`,
			bucket,
			LONG_SESSION_STEPS,
		);
		const problems = validateSession(task);
		if (problems.length > 0) {
			throw new Error(`corpus bug:\n${problems.join("\n")}`);
		}
		sessions.push(task);
	});
	console.log(`${bucket}: 5 sessions generated`);
}

const corpus: SessionCorpus = {
	version: 1,
	seed: LONG_SESSION_SEED,
	sessions,
};
mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/sessions-long.json",
	`${JSON.stringify(corpus, null, "\t")}\n`,
);

const refBacks = sessions
	.flatMap((s) => s.steps)
	.filter((s) => s.referenceBack);
console.log(
	`corpus/sessions-long.json — ${sessions.length} sessions × ${LONG_SESSION_STEPS} steps; ${refBacks.length} reference-back steps`,
);
for (const bucket of ["l", "xl"]) {
	const counts = sessions
		.filter((s) => s.bucket === bucket)
		.map((s) => countNodes(s.tree));
	console.log(
		`  ${bucket}: nodes min ${Math.min(...counts)}, max ${Math.max(...counts)}`,
	);
}
