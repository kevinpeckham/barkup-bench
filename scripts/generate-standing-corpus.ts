/**
 * Study Z corpus (docs/BRIEF-Z.md): 12 seeded org packs × 3 tasks
 * (fact / rule / combined) = 36 tasks. Committed as
 * corpus/standing.json before any scored Z call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRng } from "../src/corpus/rng.js";
import type { StandingTask } from "../src/corpus/standing.js";
import {
	generateStandingPack,
	validateStandingTask,
} from "../src/corpus/standing.js";

/** Pre-registered Study Z seed (BRIEF-Z.md). */
export const STANDING_SEED = 20260720;

const tasks: StandingTask[] = [];
for (let packIndex = 0; packIndex < 12; packIndex += 1) {
	const rng = createRng(STANDING_SEED + packIndex * 733 + 11);
	const packTasks = generateStandingPack(rng, packIndex);
	for (const task of packTasks) {
		const problems = validateStandingTask(task);
		if (problems.length > 0) {
			throw new Error(`corpus bug ${task.id}: ${problems.join("; ")}`);
		}
		tasks.push(task);
	}
}

const byKind = new Map<string, number>();
for (const task of tasks) {
	byKind.set(task.kind, (byKind.get(task.kind) ?? 0) + 1);
}
console.log(
	`Generated ${tasks.length} tasks: ${[...byKind.entries()]
		.map(([k, n]) => `${n} ${k}`)
		.join(", ")}`,
);
const positions = new Map<string, number>();
for (const task of tasks) {
	if (task.rulePosition) {
		positions.set(
			task.rulePosition,
			(positions.get(task.rulePosition) ?? 0) + 1,
		);
	}
}
console.log(
	`Rule positions (rule+combined): ${[...positions.entries()]
		.map(([p, n]) => `${p}=${n}`)
		.join(", ")}`,
);
const packTokens = tasks
	.filter((t) => t.kind === "fact")
	.map((t) => Math.round(t.pack.length / 4));
console.log(
	`Pack size ≈ ${Math.min(...packTokens)}–${Math.max(...packTokens)} tokens`,
);

mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/standing.json",
	`${JSON.stringify({ seed: STANDING_SEED, tasks }, null, "\t")}\n`,
);
console.log(`Wrote corpus/standing.json (seed ${STANDING_SEED})`);
