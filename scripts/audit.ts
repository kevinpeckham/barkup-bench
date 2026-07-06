/**
 * Re-run specific task×condition cells with full tree logging and print
 * the graded diff — for post-hoc failure analysis. Writes to
 * results/raw/audit.jsonl (never the scored results file).
 *
 *   bun run scripts/audit.ts <model> <taskId:conditionId> [...]
 */
import { readFileSync } from "node:fs";
import { conditionA } from "../src/conditions/a.js";
import { conditionC } from "../src/conditions/c.js";
import type { Corpus } from "../src/corpus/tasks.js";
import { eraseIdsExcept } from "../src/grading/equal.js";
import { runTask } from "../src/harness/runner.js";
import { allIds } from "../src/tree.js";

const [model, ...cells] = process.argv.slice(2);
if (!model || cells.length === 0) {
	throw new Error("usage: bun run scripts/audit.ts <model> <taskId:cond> ...");
}

const corpus = JSON.parse(readFileSync("corpus/pilot.json", "utf8")) as Corpus;
const conditions = { A: conditionA, C: conditionC };

for (const cell of cells) {
	const [taskId, conditionId] = cell.split(":") as [string, "A" | "C"];
	const task = corpus.tasks.find((t) => t.id === taskId);
	const condition = conditions[conditionId];
	if (!task || !condition) throw new Error(`Unknown cell ${cell}`);

	console.log(`\n===== ${cell} =====`);
	const record = await runTask(task, condition, model);
	console.log(`success: ${record.success}, rounds: ${record.rounds}`);
	if (task.family === "transformation") {
		const keep = new Set(allIds(task.tree));
		console.log("--- expected (modulo new ids) ---");
		console.log(JSON.stringify(eraseIdsExcept(task.expected, keep)));
		console.log("--- actual (modulo new ids) ---");
		const finalTree = record.detail?.finalTree;
		console.log(
			finalTree
				? JSON.stringify(
						eraseIdsExcept(finalTree as Parameters<typeof allIds>[0], keep),
					)
				: "(none)",
		);
	} else {
		console.log("detail:", JSON.stringify(record.detail));
	}
}
