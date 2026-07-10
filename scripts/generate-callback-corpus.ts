/**
 * Study T corpus (docs/BRIEF-T.md): 10 callback sessions per bucket
 * (l ~150, xl ~300 nodes), 12 steps each with 4 conversation-carried
 * callback steps. Committed as corpus/sessions-callback.json before
 * any scored T call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
	generateCallbackSession,
	validateCallbackSession,
} from "../src/corpus/callbacks.js";
import { createRng } from "../src/corpus/rng.js";
import type { SessionCorpus, SessionTask } from "../src/corpus/sessions.js";
import type { BucketName } from "../src/corpus/trees.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import { countNodes } from "../src/tree.js";

/** Pre-registered Study T seed. */
export const CALLBACK_SEED = 20260713;

const sessions: SessionTask[] = [];
for (const bucket of ["l", "xl"] as BucketName[]) {
	const trees = sampleTrees(BUCKETS[bucket], CALLBACK_SEED, 10);
	trees.forEach((tree, index) => {
		const rng = createRng(CALLBACK_SEED + index * 313 + 7);
		const task = generateCallbackSession(
			tree,
			rng,
			`sesscb-${bucket}-${index + 1}`,
			bucket,
		);
		const problems = validateCallbackSession(task);
		if (problems.length > 0) {
			throw new Error(`corpus bug:\n${problems.join("\n")}`);
		}
		sessions.push(task);
	});
	console.log(`${bucket}: 10 sessions generated`);
}

const corpus: SessionCorpus = { version: 1, seed: CALLBACK_SEED, sessions };
mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/sessions-callback.json",
	`${JSON.stringify(corpus, null, "\t")}\n`,
);

const callbacks = sessions.flatMap((s) => s.steps).filter((s) => s.callback);
console.log(
	`corpus/sessions-callback.json — ${sessions.length} sessions × 12 steps; ${callbacks.length} callback steps (${callbacks.filter((s) => s.callback === "fact").length} fact, ${callbacks.filter((s) => s.callback === "rule").length} rule)`,
);
for (const bucket of ["l", "xl"]) {
	const counts = sessions
		.filter((s) => s.bucket === bucket)
		.map((s) => countNodes(s.tree));
	console.log(
		`  ${bucket}: nodes min ${Math.min(...counts)}, max ${Math.max(...counts)}`,
	);
}
