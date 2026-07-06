/**
 * Study G scored runs (docs/BRIEF-G.md). One JSONL per model under
 * results/raw/; resumable.
 *
 *   bun run scripts/run-followup.ts [--models a,b] [--concurrency 4]
 */
import { readFileSync } from "node:fs";
import type { FollowupCorpus } from "../src/corpus/followup.js";
import { runFollowupAll } from "../src/harness/followup-runner.js";

/** Pre-registered roster (BRIEF-G.md): three vendors × two tiers. */
const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"anthropic/claude-haiku-4.5",
	"openai/gpt-5.4",
	"openai/gpt-5.4-mini",
	"google/gemini-3.5-flash",
	"google/gemini-2.5-flash-lite",
];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "4"));
const corpus = JSON.parse(
	readFileSync("corpus/followup.json", "utf8"),
) as FollowupCorpus;

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/followup-${slug}.jsonl`;
	console.log(`\n=== ${model} → ${outPath}`);
	const records = await runFollowupAll({
		model,
		tasks: corpus.tasks,
		outPath,
		concurrency,
	});
	const applied = records.filter((r) => r.finalApplied).length;
	console.log(
		`=== done: ${applied}/${records.length} new cells applied the final edit`,
	);
}
console.log("\nStudy G runs complete.");
