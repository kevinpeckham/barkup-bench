/**
 * Fill construction-task specs using the held-out describer model, then
 * rewrite corpus/pilot.json (the filled corpus is committed — scored runs
 * never call the describer). The describer is from a vendor family that
 * is NOT among the subject models (limitation noted in the report).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { generateText } from "ai";
import { DESCRIBER_SYSTEM, describerPrompt } from "../src/corpus/describe.js";
import type { Corpus } from "../src/corpus/tasks.js";

const DESCRIBER_MODEL = process.env.DESCRIBER_MODEL ?? "xai/grok-4";

const corpus = JSON.parse(
	readFileSync("corpus/pilot.json", "utf8"),
) as Corpus & {
	describer?: string;
};

let filled = 0;
for (const task of corpus.tasks) {
	if (task.family !== "construction" || task.spec !== null) continue;
	const result = await generateText({
		model: DESCRIBER_MODEL,
		system: DESCRIBER_SYSTEM,
		prompt: describerPrompt(task.target),
		temperature: 0,
		maxRetries: 4,
	});
	task.spec = result.text.trim();
	filled += 1;
	console.log(`  ${task.id}: spec written (${task.spec.length} chars)`);
}

corpus.describer = DESCRIBER_MODEL;
writeFileSync("corpus/pilot.json", `${JSON.stringify(corpus, null, "\t")}\n`);
console.log(`Filled ${filled} construction specs with ${DESCRIBER_MODEL}.`);
