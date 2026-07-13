/**
 * Study AA corpus (docs/BRIEF-AA.md): 12 conflict packs × 3 kinds =
 * 36 tasks. Committed as corpus/conflict.json before any scored AA
 * call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { ConflictTask } from "../src/corpus/conflict.js";
import {
	generateConflictPack,
	validateConflictTask,
} from "../src/corpus/conflict.js";
import { createRng } from "../src/corpus/rng.js";

/** Pre-registered Study AA seed (BRIEF-AA.md). */
export const CONFLICT_SEED = 20260721;

const tasks: ConflictTask[] = [];
for (let packIndex = 0; packIndex < 12; packIndex += 1) {
	const rng = createRng(CONFLICT_SEED + packIndex * 977 + 5);
	const packTasks = generateConflictPack(rng, packIndex);
	for (const task of packTasks) {
		const problems = validateConflictTask(task);
		if (problems.length > 0) {
			throw new Error(`corpus bug ${task.id}: ${problems.join("; ")}`);
		}
		tasks.push(task);
	}
}

const kinds = new Map<string, number>();
const orders = new Map<string, number>();
for (const task of tasks) {
	kinds.set(task.kind, (kinds.get(task.kind) ?? 0) + 1);
	if (task.kind === "rr") {
		orders.set(task.ruleOrder, (orders.get(task.ruleOrder) ?? 0) + 1);
	}
}
console.log(
	`Generated ${tasks.length} tasks: ${[...kinds.entries()]
		.map(([k, n]) => `${n} ${k}`)
		.join(", ")}; rr order ${[...orders.entries()]
		.map(([o, n]) => `${o}=${n}`)
		.join(", ")}`,
);
const sizes = tasks
	.filter((t) => t.kind === "ri")
	.map((t) => Math.round(t.pack.length / 4));
console.log(`Pack size ≈ ${Math.min(...sizes)}–${Math.max(...sizes)} tokens`);

mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/conflict.json",
	`${JSON.stringify({ seed: CONFLICT_SEED, tasks }, null, "\t")}\n`,
);
console.log(`Wrote corpus/conflict.json (seed ${CONFLICT_SEED})`);
