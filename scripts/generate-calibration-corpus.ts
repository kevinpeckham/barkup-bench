/**
 * Study AE calibration-ladder corpus (docs/BRIEF-AE.md): 75 tasks —
 * 15 per level, 5 per size bucket. L0/L4 are registered reuses of the
 * first 5 dependent tasks per bucket; L1–L3 are generated here from
 * the size-extension trees (per level, walk the bucket's trees in
 * corpus order and take the first 5 that yield a valid construction).
 * Committed as corpus/calibration.json before any scored AE call.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { DependentTask } from "../src/corpus/dependent.js";
import type { CalibrationTask } from "../src/corpus/ladder.js";
import {
	fromDependent,
	tryLevel1,
	tryLevel2,
	tryLevel3,
	validateCalibrationTask,
} from "../src/corpus/ladder.js";
import { createRng } from "../src/corpus/rng.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import type { BucketName } from "../src/corpus/trees.js";

/** Pre-registered Study AE seed (BRIEF-AE.md). */
export const CALIBRATION_SEED = 20260717;

const BUCKETS: BucketName[] = ["xl", "xxl", "xxxl"];
const PER_BUCKET = 5;

const source = JSON.parse(
	readFileSync("corpus/size-extension.json", "utf8"),
) as Corpus;
const trees = source.tasks as TransformationTask[];
const dependent = JSON.parse(readFileSync("corpus/dependent.json", "utf8")) as {
	tasks: DependentTask[];
};

const tasks: CalibrationTask[] = [];

function push(task: CalibrationTask, level: number, bucket: BucketName): void {
	const nth =
		tasks.filter((t) => t.level === level && t.bucket === bucket).length + 1;
	task.id = `cal-l${level}-${bucket}-${nth}`;
	task.bucket = bucket;
	const problems = validateCalibrationTask(task);
	if (problems.length > 0) {
		throw new Error(`corpus bug ${task.id}: ${problems.join("; ")}`);
	}
	tasks.push(task);
}

// L0 and L4: the first 5 dependent tasks per bucket, embedded verbatim.
for (const level of [0, 4] as const) {
	for (const bucket of BUCKETS) {
		const slice = dependent.tasks
			.filter((t) => t.bucket === bucket)
			.slice(0, PER_BUCKET);
		if (slice.length !== PER_BUCKET) {
			throw new Error(`dependent corpus has <5 tasks in ${bucket}`);
		}
		for (const dep of slice) push(fromDependent(dep, level), level, bucket);
	}
}

// L1–L3: first 5 trees per bucket (corpus order) that yield a valid task.
const GENERATORS = [
	{
		level: 1 as const,
		make: (tree: TransformationTask["tree"], rngSeed: number, n: number) =>
			tryLevel1(tree, createRng(rngSeed), `cal-one-${n}`),
	},
	{
		level: 2 as const,
		make: (tree: TransformationTask["tree"], rngSeed: number, _n: number) =>
			tryLevel2(tree, createRng(rngSeed)),
	},
	{
		level: 3 as const,
		make: (tree: TransformationTask["tree"], rngSeed: number, n: number) =>
			tryLevel3(tree, createRng(rngSeed), `cal-three-${n}`),
	},
];

for (const generator of GENERATORS) {
	for (const bucket of BUCKETS) {
		const bucketTrees = trees.filter((t) => t.bucket === bucket);
		let taken = 0;
		for (const [index, src] of bucketTrees.entries()) {
			if (taken >= PER_BUCKET) break;
			const rngSeed =
				CALIBRATION_SEED + generator.level * 10_007 + index * 313 + 7;
			const task = generator.make(src.tree, rngSeed, taken + 1);
			if (task === null) continue;
			push(task, generator.level, bucket);
			taken += 1;
		}
		if (taken < PER_BUCKET) {
			throw new Error(
				`bucket ${bucket} yielded only ${taken} L${generator.level} tasks`,
			);
		}
	}
}

const corpus = { version: 1 as const, seed: CALIBRATION_SEED, tasks };
mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/calibration.json",
	`${JSON.stringify(corpus, null, "\t")}\n`,
);

const byLevel = new Map<number, number>();
for (const t of tasks) byLevel.set(t.level, (byLevel.get(t.level) ?? 0) + 1);
console.log(
	`corpus/calibration.json — ${tasks.length} tasks (${[...byLevel.entries()]
		.sort()
		.map(([l, n]) => `L${l}: ${n}`)
		.join(", ")}), all validated`,
);
for (const level of [1, 2, 3]) {
	const first = tasks.find((t) => t.level === level);
	console.log(`  ${first?.id}: ${first?.instruction.slice(0, 110)}`);
}
