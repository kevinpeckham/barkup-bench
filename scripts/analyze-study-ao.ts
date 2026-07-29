/**
 * Study AO analysis (docs/BRIEF-AO.md): canonical-tag steering gates
 * AO-H1..H4 plus per-class anatomy.
 *
 *   bun run scripts/analyze-study-ao.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";

const MODELS = [
	"google/gemini-3.5-flash",
	"anthropic/claude-sonnet-4.5",
	"anthropic/claude-opus-4.8",
	// Open-weight backfill (docs/BRIEF-OW.md): descriptive tier-map
	// columns only — the registered gates stay opus-anchored.
	"moonshotai/kimi-k3",
	"openai/gpt-oss-120b",
	"anthropic/claude-fable-5",
];
const ARMS = ["AO-bare", "AO-shipped", "AO-warnings-only"];

const records: TaskRunRecord[] = [];
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const path = `results/raw/studyao-${slug}.jsonl`;
	if (!existsSync(path)) continue;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (line.trim() !== "") records.push(JSON.parse(line) as TaskRunRecord);
	}
}
const d = (r: TaskRunRecord) => (r.detail ?? {}) as Record<string, unknown>;
const short = (m: string) => m.split("/")[1] as string;
const rows = (m: string, arm: string) =>
	records.filter((r) => r.model === m && r.condition === arm);
const clean = (rs: TaskRunRecord[]) => rs.filter((r) => r.success).length;

const GATE_MODELS = new Set([
	"google/gemini-3.5-flash",
	"anthropic/claude-sonnet-4.5",
	"anthropic/claude-opus-4.8",
]);
let h1 = true;
let h4 = true;
for (const model of MODELS) {
	console.log(`--- ${short(model)} ---`);
	for (const arm of ARMS) {
		const rs = rows(model, arm);
		const byCls = ["covered", "trap", "uncovered"]
			.map(
				(c) =>
					`${c} ${clean(rs.filter((r) => r.bucket === c))}/${rs.filter((r) => r.bucket === c).length}`,
			)
			.join(", ");
		const empty = rs.filter(
			(r) =>
				Array.isArray(d(r).finalTags) &&
				(d(r).finalTags as unknown[]).length === 0,
		).length;
		const warned = rs.filter((r) => Number(d(r).firstWarnings ?? 0) > 0);
		const toolUsed = rs.filter((r) => Number(d(r).toolCalls ?? 0) > 0).length;
		console.log(
			`${arm}: clean ${clean(rs)}/${rs.length} (${byCls}) | empty ${empty} | tool ${toolUsed} | warned ${warned.length} → clean-after ${clean(warned)}`,
		);
		if (GATE_MODELS.has(model) && arm === "AO-bare" && clean(rs) > 28)
			h1 = false;
		if (GATE_MODELS.has(model) && arm !== "AO-bare" && empty > 2) h4 = false;
	}
}
const opusShipped = rows("anthropic/claude-opus-4.8", "AO-shipped");
const opusTrap = clean(opusShipped.filter((r) => r.bucket === "trap"));
const h2 = clean(opusShipped) >= 33 && opusTrap >= 10;
const opusWarned = [
	...rows("anthropic/claude-opus-4.8", "AO-shipped"),
	...rows("anthropic/claude-opus-4.8", "AO-warnings-only"),
].filter((r) => Number(d(r).firstWarnings ?? 0) > 0);
const h3 =
	opusWarned.length === 0 || clean(opusWarned) / opusWarned.length >= 0.9;
console.log("\n=== Gates ===");
console.log(`AO-H1 (drift anchor): ${h1 ? "PASS" : "FAIL"}`);
console.log(
	`AO-H2 (opus shipped ≥33/36, trap ≥10/12): ${h2 ? "PASS" : "FAIL"} (${clean(opusShipped)}/36, trap ${opusTrap}/12)`,
);
console.log(
	`AO-H3 (opus warned→clean ≥90%): ${h3 ? "PASS" : "FAIL"} (${clean(opusWarned)}/${opusWarned.length})`,
);
console.log(`AO-H4 (no omission, empty ≤2): ${h4 ? "PASS" : "FAIL"}`);
console.log(`STUDY GATE: ${h1 && h2 && h3 && h4 ? "PASS" : "FAIL"}`);
