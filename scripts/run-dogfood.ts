/**
 * Tier-1 dogfood: run condition F2 (the shipped
 * @kevinpeckham/barkup/patch applier, identical prompts to F) on the
 * main corpus with one model, then compare F vs F2 paired. Any
 * systematic discordance indicates behavioral drift between the
 * benchmark-validated reference and the released artifact.
 *
 *   bun run scripts/run-dogfood.ts [--model anthropic/claude-haiku-4.5]
 */
import { readFileSync } from "node:fs";
import { conditionF2 } from "../src/conditions/f2.js";
import type { Corpus } from "../src/corpus/tasks.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { runAll } from "../src/harness/runner.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const model = arg("model", "anthropic/claude-haiku-4.5");
const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
const corpus = JSON.parse(readFileSync("corpus/main.json", "utf8")) as Corpus;
const tasks = corpus.tasks.filter(
	(t) => !(t.family === "construction" && t.specVerified !== true),
);

const outPath = `results/raw/dogfood-${slug}.jsonl`;
await runAll({
	model,
	regime: "parity",
	conditions: [conditionF2],
	tasks,
	outPath,
	concurrency: 5,
});

// Paired comparison against the existing F records for the same model.
const f2 = readFileSync(outPath, "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line) as TaskRunRecord);
const f = readFileSync(`results/raw/main-${slug}-parity.jsonl`, "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line) as TaskRunRecord)
	.filter((r) => r.condition === "F");

const fByTask = new Map(f.map((r) => [r.taskId, r.success]));
let n = 0;
let fPass = 0;
let f2Pass = 0;
let fOnly = 0;
let f2Only = 0;
for (const record of f2) {
	const fSuccess = fByTask.get(record.taskId);
	if (fSuccess === undefined) continue;
	n += 1;
	if (fSuccess) fPass += 1;
	if (record.success) f2Pass += 1;
	if (fSuccess && !record.success) fOnly += 1;
	if (!fSuccess && record.success) f2Only += 1;
}
const test = mcnemarExact(fOnly, f2Only);
console.log(
	`\nDogfood ${model}: F ${fPass}/${n} vs F2(shipped) ${f2Pass}/${n} — discordant ${fOnly}/${f2Only}, McNemar p=${test.pValue.toFixed(4)}`,
);
console.log(
	test.pValue > 0.05 && Math.abs(fPass - f2Pass) <= Math.max(3, n * 0.02)
		? "VERDICT: no behavioral drift detected between reference and shipped applier."
		: "VERDICT: investigate — F and F2 differ beyond noise.",
);
