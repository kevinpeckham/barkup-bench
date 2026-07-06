/**
 * Generate all corpora deterministically from the pre-registered seeds
 * and write them to corpus/ (committed). Construction specs are null
 * until scripts/describe-construction.ts fills them.
 *
 * Seeds are pre-registered constants; changing one after a scored run
 * against its corpus is forbidden.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Corpus } from "../src/corpus/tasks.js";
import {
	DEV_PLAN,
	generateCorpus,
	MAIN_PLAN,
	PILOT_PLAN,
} from "../src/corpus/tasks.js";
import { countNodes } from "../src/tree.js";

export const PILOT_SEED = 20260705;
export const MAIN_SEED = 20260706;
/** Dev split: used ONLY for best-effort prompt sanity checks, never scored. */
export const DEV_SEED = 910001;

function write(name: string, corpus: Corpus): void {
	const path = `corpus/${name}.json`;
	// Regeneration must never wipe committed describer output: carry
	// over spec/specVerified (and the describer stamp) for construction
	// tasks whose target is unchanged.
	if (existsSync(path)) {
		const existing = JSON.parse(readFileSync(path, "utf8")) as Corpus & {
			describer?: string;
		};
		for (const task of corpus.tasks) {
			if (task.family !== "construction") continue;
			const prior = existing.tasks.find(
				(t) =>
					t.id === task.id &&
					t.family === "construction" &&
					JSON.stringify(t.target) === JSON.stringify(task.target),
			);
			if (prior && prior.family === "construction" && prior.spec !== null) {
				task.spec = prior.spec;
				if (prior.specVerified !== undefined) {
					task.specVerified = prior.specVerified;
				}
			}
		}
		if (existing.describer !== undefined) {
			(corpus as Corpus & { describer?: string }).describer =
				existing.describer;
		}
	}
	writeFileSync(path, `${JSON.stringify(corpus, null, "\t")}\n`);
	const byFamily = new Map<string, number>();
	let nodes = 0;
	for (const task of corpus.tasks) {
		byFamily.set(task.family, (byFamily.get(task.family) ?? 0) + 1);
		nodes += countNodes(
			task.family === "construction" ? task.target : task.tree,
		);
	}
	console.log(
		`corpus/${name}.json — ${corpus.tasks.length} tasks (${[...byFamily]
			.map(([f, n]) => `${f} ${n}`)
			.join(", ")}), ${nodes} total nodes, seed ${corpus.seed}`,
	);
}

mkdirSync("corpus", { recursive: true });
write("pilot", generateCorpus(PILOT_PLAN, PILOT_SEED));
write("main", generateCorpus(MAIN_PLAN, MAIN_SEED));
write("dev", generateCorpus(DEV_PLAN, DEV_SEED));
