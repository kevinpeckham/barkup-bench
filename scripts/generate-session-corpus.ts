/**
 * Study K corpus (docs/BRIEF-K.md): 10 sessions per bucket (l ~150,
 * xl ~300 nodes), 12 sequential edits each, fresh seed. Committed as
 * corpus/sessions.json before any scored K call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRng } from "../src/corpus/rng.js";
import type { SessionCorpus, SessionTask } from "../src/corpus/sessions.js";
import { generateSession, validateSession } from "../src/corpus/sessions.js";
import type { BucketName } from "../src/corpus/trees.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import { countNodes } from "../src/tree.js";

/** Pre-registered Study K seed. */
export const SESSION_SEED = 20260709;

const sessions: SessionTask[] = [];
for (const bucket of ["l", "xl"] as BucketName[]) {
	const trees = sampleTrees(BUCKETS[bucket], SESSION_SEED, 10);
	trees.forEach((tree, index) => {
		const rng = createRng(SESSION_SEED + index * 313 + 7);
		const task = generateSession(
			tree,
			rng,
			`sess-${bucket}-${index + 1}`,
			bucket,
		);
		const problems = validateSession(task);
		if (problems.length > 0) {
			throw new Error(`corpus bug:\n${problems.join("\n")}`);
		}
		sessions.push(task);
	});
	console.log(`${bucket}: 10 sessions generated`);
}

const corpus: SessionCorpus = { version: 1, seed: SESSION_SEED, sessions };
mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/sessions.json",
	`${JSON.stringify(corpus, null, "\t")}\n`,
);

const refBacks = sessions
	.flatMap((s) => s.steps)
	.filter((s) => s.referenceBack);
console.log(
	`corpus/sessions.json — ${sessions.length} sessions × 12 steps; ${refBacks.length} reference-back steps`,
);
for (const bucket of ["l", "xl"]) {
	const counts = sessions
		.filter((s) => s.bucket === bucket)
		.map((s) => countNodes(s.tree));
	console.log(
		`  ${bucket}: nodes min ${Math.min(...counts)}, max ${Math.max(...counts)}`,
	);
}
