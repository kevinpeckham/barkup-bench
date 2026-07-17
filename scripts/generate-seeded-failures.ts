/**
 * Study AJ corpus (docs/BRIEF-AJ.md): 45 seeded-failure cells — one
 * registered corruption per size-extension task, assigned by the
 * kind × class matrix cycling in corpus order within each kind.
 * Committed as corpus/seeded-failures.json before any scored call.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { referencedIds } from "../src/conditions/views.js";
import type { SeededTask } from "../src/corpus/seeded.js";
import {
	CORRUPTION_MATRIX,
	correctOpFor,
	corruptOp,
	validateSeededTask,
} from "../src/corpus/seeded.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";

/** Pre-registered Study AJ seed (BRIEF-AJ.md; generation is fully
 * deterministic — the seed labels the corpus build). */
export const SEEDED_FAILURES_SEED = 20260719;

const source = JSON.parse(
	readFileSync("corpus/size-extension.json", "utf8"),
) as Corpus;
const tasks: SeededTask[] = [];
const perKind = new Map<string, number>();

for (const src of source.tasks as TransformationTask[]) {
	const kind = src.edit.kind;
	const classes = CORRUPTION_MATRIX[kind];
	if (!classes) throw new Error(`no matrix row for edit kind ${kind}`);
	const nth = perKind.get(kind) ?? 0;
	perKind.set(kind, nth + 1);
	const corruption = classes[nth % classes.length] as SeededTask["corruption"];

	const op = correctOpFor(src.tree, src.edit, src.expected);
	if (!op) throw new Error(`no valid op for ${src.id}`);
	const corrupted = corruptOp(op, corruption, src.tree);

	const task: SeededTask = {
		id: `aj-${src.id}`,
		family: "transformation",
		bucket: src.bucket,
		editKind: kind,
		corruption,
		tree: src.tree,
		instruction: src.instruction,
		focusIds: referencedIds(src.edit),
		expected: src.expected,
		correctPatch: [op],
		corruptedPatch: [corrupted],
	};
	const problems = validateSeededTask(task);
	if (problems.length > 0) {
		throw new Error(`corpus bug ${task.id}: ${problems.join("; ")}`);
	}
	tasks.push(task);
}

const corpus = { version: 1 as const, seed: SEEDED_FAILURES_SEED, tasks };
mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/seeded-failures.json",
	`${JSON.stringify(corpus, null, "\t")}\n`,
);

const byClass = new Map<string, number>();
for (const t of tasks)
	byClass.set(t.corruption, (byClass.get(t.corruption) ?? 0) + 1);
console.log(
	`corpus/seeded-failures.json — ${tasks.length} cells (${[...byClass.entries()]
		.sort()
		.map(([c, n]) => `${c} ${n}`)
		.join(", ")}), all validated`,
);
