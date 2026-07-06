/**
 * Phase 0 pilot: 20 tasks × conditions A and C × ONE model × parity
 * prompts. Results append to results/raw/ (gitignored); the run is
 * resumable — rerun the script to continue after an interruption.
 */
import { readFileSync } from "node:fs";
import { conditionA } from "../src/conditions/a.js";
import { conditionC } from "../src/conditions/c.js";
import type { Corpus } from "../src/corpus/tasks.js";
import { runAll } from "../src/harness/runner.js";

const model = process.argv[2] ?? "anthropic/claude-sonnet-4.5";
const corpus = JSON.parse(readFileSync("corpus/pilot.json", "utf8")) as Corpus;

const missingSpecs = corpus.tasks.filter(
	(task) => task.family === "construction" && task.spec === null,
);
if (missingSpecs.length > 0) {
	throw new Error(
		`${missingSpecs.length} construction tasks have no spec — run \`bun run describe\` first.`,
	);
}

const outPath = `results/raw/pilot-${model.replace(/[^a-z0-9.-]+/gi, "_")}.jsonl`;
const records = await runAll({
	model,
	conditions: [conditionA, conditionC],
	tasks: corpus.tasks,
	outPath,
	concurrency: 3,
});

const ok = records.filter((r) => r.success).length;
console.log(`\nDone: ${ok}/${records.length} new records passed → ${outPath}`);
console.log(`Next: bun run report ${outPath}`);
