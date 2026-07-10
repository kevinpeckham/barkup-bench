/**
 * Study U corpus (docs/BRIEF-U.md): one dependent-edit task per
 * size-extension tree (45 tasks, 15 per bucket; 8 value-copy + 7
 * structure-read per bucket). Committed as corpus/dependent.json
 * before any scored U call.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { DependentTask } from "../src/corpus/dependent.js";
import {
	generateDependentTask,
	validateDependentTask,
} from "../src/corpus/dependent.js";
import { createRng } from "../src/corpus/rng.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";

/** Pre-registered Study U seed. */
export const DEPENDENT_SEED = 20260714;

const source = JSON.parse(
	readFileSync("corpus/size-extension.json", "utf8"),
) as Corpus;
const sourceTasks = source.tasks as TransformationTask[];

const tasks: DependentTask[] = [];
const perBucket = new Map<string, number>();
for (const src of sourceTasks) {
	const nth = (perBucket.get(src.bucket) ?? 0) + 1;
	perBucket.set(src.bucket, nth);
	// Pre-registered kind split: first 8 per bucket value-copy, rest structure-read.
	const kind = nth <= 8 ? "value" : "structure";
	const rng = createRng(DEPENDENT_SEED + tasks.length * 313 + 7);
	const task = generateDependentTask(src.tree, rng, kind);
	task.id = `dep-${src.bucket}-${nth}`;
	task.bucket = src.bucket;
	const problems = validateDependentTask(task);
	if (problems.length > 0) {
		throw new Error(`corpus bug ${task.id}: ${problems.join("; ")}`);
	}
	tasks.push(task);
}

const corpus = { version: 1 as const, seed: DEPENDENT_SEED, tasks };
mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/dependent.json",
	`${JSON.stringify(corpus, null, "\t")}\n`,
);

const value = tasks.filter((t) => t.depKind === "value").length;
console.log(
	`corpus/dependent.json — ${tasks.length} tasks (${value} value-copy, ${tasks.length - value} structure-read), all validated`,
);
for (const task of tasks.slice(0, 2)) {
	console.log(`  ${task.id}: ${task.instruction.slice(0, 110)}`);
}
