/**
 * Protocol-v2 re-run of the main study's reference-family cells in the
 * tools conditions (C, D): the original run predated the tool-history
 * fix (see the 2026-07-06 "protocol v2" commit), so the model's own
 * tool calls were invisible in phase-2 history. Rewrite/patch arms are
 * unaffected and are not re-run. Results land in separate files —
 * results/raw/reference-v2-<model>-<regime>.jsonl — and REPORT.md's H4
 * section is corrected from the comparison.
 *
 *   bun run scripts/rerun-reference-v2.ts [--models a,b] [--regimes parity,best]
 */
import { readFileSync } from "node:fs";
import type { Regime } from "../src/conditions/index.js";
import { conditionsForRegime } from "../src/conditions/index.js";
import type { Corpus } from "../src/corpus/tasks.js";
import { runAll } from "../src/harness/runner.js";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"openai/gpt-5.4",
	"google/gemini-3.5-flash",
	"anthropic/claude-haiku-4.5",
];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const regimes = arg("regimes", "parity,best").split(",") as Regime[];
const corpus = JSON.parse(readFileSync("corpus/main.json", "utf8")) as Corpus;
const tasks = corpus.tasks.filter((t) => t.family === "reference");

for (const model of models) {
	for (const regime of regimes) {
		const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
		const outPath = `results/raw/reference-v2-${slug}-${regime}.jsonl`;
		console.log(`\n=== ${model} × ${regime} → ${outPath}`);
		const records = await runAll({
			model,
			regime,
			conditions: conditionsForRegime(regime, ["C", "D"]),
			tasks,
			outPath,
			concurrency: 4,
		});
		const ok = records.filter((r) => r.success).length;
		console.log(`=== done: ${ok}/${records.length} passed`);
	}
}
console.log("\nReference v2 re-run complete.");
