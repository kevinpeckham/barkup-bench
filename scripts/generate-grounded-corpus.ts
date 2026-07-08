/**
 * Study L corpus (docs/BRIEF-L.md): the size-extension tasks with
 * id-free grounded instructions. Trees, edits, expected states, and
 * task ids are unchanged; only the instruction text is regenerated.
 * Committed as corpus/grounded.json before any scored L call.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
	describeGroundedEdit,
	validateGrounding,
} from "../src/corpus/grounded.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";

const source = JSON.parse(
	readFileSync("corpus/size-extension.json", "utf8"),
) as Corpus;

const tasks = (source.tasks as TransformationTask[]).map((task) => {
	const problems = validateGrounding(task.tree, task.edit);
	if (problems.length > 0) {
		throw new Error(`corpus bug ${task.id}: ${problems.join("; ")}`);
	}
	const instruction = describeGroundedEdit(task.tree, task.edit);
	if (/"n\d+"/.test(instruction)) {
		throw new Error(`corpus bug ${task.id}: instruction leaks an id`);
	}
	return { ...task, instruction };
});

const corpus: Corpus = { version: 1, seed: source.seed, tasks };
mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/grounded.json",
	`${JSON.stringify(corpus, null, "\t")}\n`,
);
console.log(
	`corpus/grounded.json — ${tasks.length} tasks, all refs verified unique`,
);
for (const task of tasks.slice(0, 3)) {
	console.log(`  ${task.id}: ${task.instruction.slice(0, 110)}`);
}
