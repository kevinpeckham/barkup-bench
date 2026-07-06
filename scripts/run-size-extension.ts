/**
 * Study H scored runs (docs/BRIEF-H.md): conditions A, E, F over the
 * size-extension corpus. F applies via the shipped
 * @kevinpeckham/barkup/patch (Tier-1-verified identical to the
 * reference; recorded under its pre-registered id "F").
 *
 *   bun run scripts/run-size-extension.ts [--models a,b] [--concurrency 3]
 */
import { readFileSync } from "node:fs";
import { conditionA } from "../src/conditions/a.js";
import { conditionE } from "../src/conditions/e.js";
import { conditionF2 } from "../src/conditions/f2.js";
import type { Condition } from "../src/conditions/types.js";
import type { Corpus } from "../src/corpus/tasks.js";
import { runAll } from "../src/harness/runner.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

const DEFAULT_MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "3"));
const corpus = JSON.parse(
	readFileSync("corpus/size-extension.json", "utf8"),
) as Corpus;

const conditionF: Condition = { ...conditionF2, id: "F" };

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/sizeext-${slug}.jsonl`;
	console.log(`\n=== ${model} → ${outPath}`);
	const records = await runAll({
		model,
		regime: "parity",
		conditions: [conditionA, conditionE, conditionF],
		tasks: corpus.tasks,
		outPath,
		concurrency,
	});
	const ok = records.filter((r) => r.success).length;
	const tokens = records.reduce(
		(s, r) => s + r.totalInputTokens + r.totalOutputTokens,
		0,
	);
	console.log(
		`=== done: ${ok}/${records.length} passed, ${(tokens / 1e6).toFixed(2)}M tokens`,
	);
}
console.log("\nStudy H runs complete.");
