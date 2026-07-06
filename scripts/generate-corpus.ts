/**
 * Generate the pilot corpus deterministically from the pre-registered
 * seed and write it to corpus/pilot.json (committed). Construction specs
 * are null until scripts/describe-construction.ts fills them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generatePilotCorpus } from "../src/corpus/tasks.js";
import { countNodes } from "../src/tree.js";

/** Pre-registered corpus seed. Changing it after a scored run is forbidden. */
export const PILOT_SEED = 20260705;

const corpus = generatePilotCorpus(PILOT_SEED);
mkdirSync("corpus", { recursive: true });
writeFileSync("corpus/pilot.json", `${JSON.stringify(corpus, null, "\t")}\n`);

console.log(
	`corpus/pilot.json — ${corpus.tasks.length} tasks, seed ${PILOT_SEED}`,
);
for (const task of corpus.tasks) {
	const tree = task.family === "construction" ? task.target : task.tree;
	const extra =
		task.family === "transformation"
			? ` edit=${task.edit.kind}`
			: task.family === "reading"
				? ` q="${task.question.prompt.slice(0, 60)}..."`
				: "";
	console.log(
		`  ${task.id} (${task.family}, bucket ${task.bucket}, ${countNodes(tree)} nodes)${extra}`,
	);
}
