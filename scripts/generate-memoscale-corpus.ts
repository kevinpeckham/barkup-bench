/**
 * Study AH corpus (docs/BRIEF-AH.md): 60 read-side tasks (recall +
 * rule × N ∈ {5,20} × 3 positions × 5 reps) and 30 integrity tasks
 * (K ∈ {10,19,20} × 10), generated from the size-extension trees.
 * Committed as corpus/memo-scale.json before any scored AH call.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type {
	IntegrityTask,
	MemoScaleTask,
	MemoTaskKind,
	NotePosition,
} from "../src/corpus/memoscale.js";
import {
	tryIntegrityTask,
	tryRecallTask,
	tryRuleTask,
	validateIntegrityTask,
	validateMemoScaleTask,
} from "../src/corpus/memoscale.js";
import { createRng } from "../src/corpus/rng.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";

/** Pre-registered Study AH seed (BRIEF-AH.md). */
export const MEMOSCALE_SEED = 20260718;

const source = JSON.parse(
	readFileSync("corpus/size-extension.json", "utf8"),
) as Corpus;
const trees = source.tasks as TransformationTask[];

const tasks: MemoScaleTask[] = [];
const integrity: IntegrityTask[] = [];
let cellSeq = 0;

function nextTask(
	make: (tree: TransformationTask, seq: number) => MemoScaleTask | null,
): MemoScaleTask {
	for (let offset = 0; offset < trees.length; offset += 1) {
		const tree = trees[(cellSeq + offset) % trees.length] as TransformationTask;
		const task = make(tree, cellSeq * 977 + offset * 13);
		if (task) {
			task.bucket = tree.bucket;
			cellSeq += 1;
			return task;
		}
	}
	throw new Error("no tree yields a valid task for this cell");
}

const KINDS: MemoTaskKind[] = ["recall", "rule"];
const LEVELS: (5 | 20)[] = [5, 20];
const POSITIONS: NotePosition[] = ["first", "middle", "last"];

for (const kind of KINDS) {
	for (const nLevel of LEVELS) {
		for (const position of POSITIONS) {
			for (let rep = 1; rep <= 5; rep += 1) {
				const task = nextTask((tree, seq) =>
					kind === "recall"
						? tryRecallTask(
								tree.tree,
								createRng(MEMOSCALE_SEED + seq),
								nLevel,
								position,
							)
						: tryRuleTask(
								tree.tree,
								createRng(MEMOSCALE_SEED + seq),
								nLevel,
								position,
							),
				);
				task.id = `ah-${kind}-n${nLevel}-${position}-${rep}`;
				const problems = validateMemoScaleTask(task);
				if (problems.length > 0) {
					throw new Error(`corpus bug ${task.id}: ${problems.join("; ")}`);
				}
				tasks.push(task);
			}
		}
	}
}

const K_LEVELS: (10 | 19 | 20)[] = [10, 19, 20];
for (const kLevel of K_LEVELS) {
	for (let rep = 1; rep <= 10; rep += 1) {
		let made: IntegrityTask | null = null;
		for (let offset = 0; offset < trees.length && !made; offset += 1) {
			const tree = trees[
				(cellSeq + offset) % trees.length
			] as TransformationTask;
			made = tryIntegrityTask(
				tree.tree,
				createRng(MEMOSCALE_SEED + cellSeq * 977 + offset * 13 + 500_000),
				kLevel,
			);
			if (made) made.bucket = tree.bucket;
		}
		if (!made) throw new Error(`no tree yields integrity k${kLevel} rep${rep}`);
		cellSeq += 1;
		made.id = `ah-integrity-k${kLevel}-${rep}`;
		const problems = validateIntegrityTask(made);
		if (problems.length > 0) {
			throw new Error(`corpus bug ${made.id}: ${problems.join("; ")}`);
		}
		integrity.push(made);
	}
}

const corpus = { version: 1 as const, seed: MEMOSCALE_SEED, tasks, integrity };
mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/memo-scale.json",
	`${JSON.stringify(corpus, null, "\t")}\n`,
);
console.log(
	`corpus/memo-scale.json — ${tasks.length} read tasks + ${integrity.length} integrity tasks, all validated`,
);
console.log(`  ${tasks[0]?.id}: ${tasks[0]?.instruction.slice(0, 100)}`);
console.log(`  ${tasks[30]?.id}: ${tasks[30]?.instruction.slice(0, 100)}`);
console.log(`  ${integrity[0]?.id}: ${integrity[0]?.message.slice(0, 110)}`);
