/** Generate the Study G corpus (corpus/followup.json, committed). */
import { mkdirSync, writeFileSync } from "node:fs";
import { generateFollowupCorpus } from "../src/corpus/followup.js";
import { countNodes } from "../src/tree.js";

/** Pre-registered Study G corpus seed. */
export const FOLLOWUP_SEED = 20260707;

const corpus = generateFollowupCorpus(FOLLOWUP_SEED);
mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/followup.json",
	`${JSON.stringify(corpus, null, "\t")}\n`,
);
console.log(
	`corpus/followup.json — ${corpus.tasks.length} tasks, seed ${FOLLOWUP_SEED}`,
);
for (const task of corpus.tasks.slice(0, 4)) {
	console.log(
		`  ${task.id}: ${countNodes(task.tree)} nodes, insert ${task.newNodeType} "${task.newNodeName}", final ${task.finalKey}`,
	);
}
