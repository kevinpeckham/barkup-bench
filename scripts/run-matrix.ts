/**
 * The full-matrix runner: corpus × conditions × regimes × models.
 * One JSONL per model × regime under results/raw/; every run is
 * resumable — rerun the same command to continue.
 *
 *   bun run matrix [--corpus corpus/main.json] [--models a,b,c]
 *                  [--regimes parity,best] [--conditions A,B,C,D,E]
 *                  [--concurrency 4]
 */
import { readFileSync } from "node:fs";
import type { Regime } from "../src/conditions/index.js";
import { conditionsForRegime } from "../src/conditions/index.js";
import type { Corpus } from "../src/corpus/tasks.js";
import { runAll } from "../src/harness/runner.js";

/** Pre-registered roster: three vendors, tier spread; describer (xai) is held out. */
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

const corpusPath = arg("corpus", "corpus/main.json");
const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const regimes = arg("regimes", "parity,best").split(",") as Regime[];
const conditionIds = arg("conditions", "A,B,C,D,E").split(",");
const concurrency = Number(arg("concurrency", "4"));

const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as Corpus;
const corpusName = corpusPath.replace(/^.*\//, "").replace(/\.json$/, "");

const excluded = corpus.tasks.filter(
	(task) =>
		task.family === "construction" &&
		(task.spec === null || task.specVerified !== true),
);
const tasks = corpus.tasks.filter((task) => !excluded.includes(task));
if (excluded.length > 0) {
	console.log(
		`Excluding ${excluded.length} construction tasks without verified specs: ${excluded
			.map((t) => t.id)
			.join(", ")}`,
	);
}

for (const model of models) {
	for (const regime of regimes) {
		const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
		const outPath = `results/raw/${corpusName}-${slug}-${regime}.jsonl`;
		console.log(`\n=== ${model} × ${regime} → ${outPath}`);
		const records = await runAll({
			model,
			regime,
			conditions: conditionsForRegime(regime, conditionIds),
			tasks,
			outPath,
			concurrency,
		});
		const ok = records.filter((r) => r.success).length;
		console.log(`=== done: ${ok}/${records.length} new records passed`);
	}
}
console.log("\nMatrix complete.");
