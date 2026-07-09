/**
 * Study Q corpus generation (docs/BRIEF-Q.md): 45 fan-out tasks on the
 * unchanged size-extension trees, seed 20260710, kinds alternating.
 * Committed before any scored Q call.
 *
 *   bun run scripts/generate-fanout-corpus.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { FanKind, FanoutTask } from "../src/corpus/fanout.js";
import { generateFanoutTask } from "../src/corpus/fanout.js";
import { createRng } from "../src/corpus/rng.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";

export const FANOUT_SEED = 20260710;

const source = JSON.parse(
	readFileSync("corpus/size-extension.json", "utf8"),
) as Corpus;
const sourceTasks = source.tasks as TransformationTask[];

const tasks: FanoutTask[] = [];
sourceTasks.forEach((sourceTask, i) => {
	const preferred: FanKind = i % 2 === 0 ? "set-attribute-all" : "remove-all";
	const id = sourceTask.id.replace(/^trans-/, "fan-");
	const task = generateFanoutTask(
		sourceTask.tree,
		sourceTask.bucket,
		id,
		createRng(FANOUT_SEED + i),
		preferred,
	);
	if (/"n\d+"/.test(task.instruction)) {
		throw new Error(`id leak in ${id}: ${task.instruction}`);
	}
	tasks.push(task);
	console.log(
		`${id}: ${task.fanKind} × ${task.targetIds.length} ${task.targetType} — ${task.instruction}`,
	);
});

const byKind = new Map<string, number>();
const counts = tasks.map((t) => t.targetIds.length);
for (const t of tasks) {
	byKind.set(t.fanKind, (byKind.get(t.fanKind) ?? 0) + 1);
}
writeFileSync(
	"corpus/fanout.json",
	`${JSON.stringify({ seed: FANOUT_SEED, generatedFrom: "corpus/size-extension.json", tasks }, null, "\t")}\n`,
);
console.log(
	`\ncorpus/fanout.json written: ${tasks.length} tasks (${[...byKind.entries()]
		.map(([k, n]) => `${k}×${n}`)
		.join(
			", ",
		)}), targets min ${Math.min(...counts)} / median ${[...counts].sort((a, b) => a - b)[22]} / max ${Math.max(...counts)}`,
);
