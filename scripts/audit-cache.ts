/**
 * Prompt-caching audit over every raw result file (results/raw/*.jsonl).
 *
 * Default provider-side prompt caching cannot be disabled uniformly
 * across vendors (OpenAI caches automatically at >=1024-token prefixes;
 * Gemini 2.5+ implicit caching is on by default; Anthropic caching is
 * opt-in via cache_control, which this harness never sets EXCEPT in
 * Studies Z and AA, whose runners deliberately ship the v3.185.0
 * cached-system layout for the caching appendices — so all other Anthropic runs are
 * cache-free by construction). The harness records
 * the provider-reported cached-input reads per call
 * (CallLog.cacheReadTokens, from the AI SDK's
 * inputTokenDetails.cacheReadTokens) so the effect can be AUDITED
 * rather than pretended away.
 *
 * This script backs the REPORT.md prompt-caching-audit addendum:
 *
 *   bun run scripts/audit-cache.ts > results/analysis-cache-audit.txt
 *
 * It verifies the subset invariant (cacheReadTokens <= inputTokens on
 * every call — i.e. reported input tokens are TOTAL prompt tokens,
 * cached included, so token-count metrics are cache-independent) and
 * tabulates cache-read incidence per file and per
 * (study group, vendor, condition).
 */
import { readdirSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";

const RAW_DIR = "results/raw";

interface Cell {
	records: number;
	calls: number;
	callsWithCache: number;
	inputTokens: number;
	cacheReadTokens: number;
}

function emptyCell(): Cell {
	return {
		records: 0,
		calls: 0,
		callsWithCache: 0,
		inputTokens: 0,
		cacheReadTokens: 0,
	};
}

function addRecord(cell: Cell, record: TaskRunRecord): void {
	cell.records += 1;
	cell.inputTokens += record.totalInputTokens;
	for (const call of record.calls) {
		cell.calls += 1;
		const cached = call.cacheReadTokens ?? 0;
		if (cached > 0) {
			cell.callsWithCache += 1;
			cell.cacheReadTokens += cached;
		}
	}
}

function pct(cell: Cell): string {
	if (cell.inputTokens === 0) return "—";
	return `${((cell.cacheReadTokens / cell.inputTokens) * 100).toFixed(1)}%`;
}

/** Study group from the raw file name (prefix before the model slug). */
function groupOf(file: string): string {
	const match = file.match(
		/^(pilot|dev|dogfood|dropout-audit|main|corrected|reference-v2|followup|sizeext|studyi|studyj|studyk)/,
	);
	return match?.[1] ?? "other";
}

const files = readdirSync(RAW_DIR)
	.filter((f) => f.endsWith(".jsonl"))
	.sort();

const perFile = new Map<string, Cell>();
const perCell = new Map<string, Cell>();
let invariantViolations = 0;
let totalCalls = 0;

for (const file of files) {
	const fileCell = emptyCell();
	perFile.set(file, fileCell);
	for (const line of readFileSync(`${RAW_DIR}/${file}`, "utf8").split("\n")) {
		if (line.trim() === "") continue;
		// Follow-up (Study G) records carry `arm` instead of `condition`.
		const record = JSON.parse(line) as TaskRunRecord & { arm?: string };
		// Study V judge/calibration records are not protocol TaskRunRecords
		// (no per-call log); they are Track 2 and audited separately.
		if (!Array.isArray(record.calls)) continue;
		addRecord(fileCell, record);
		const vendor = record.model.split("/")[0] ?? "?";
		const key = `${groupOf(file)} | ${vendor} | ${record.condition ?? record.arm ?? "?"}`;
		const cell = perCell.get(key) ?? emptyCell();
		perCell.set(key, cell);
		addRecord(cell, record);
		for (const call of record.calls) {
			totalCalls += 1;
			if ((call.cacheReadTokens ?? 0) > call.inputTokens) {
				invariantViolations += 1;
			}
		}
	}
}

console.log("# Prompt-caching audit (provider-reported cache reads)");
console.log(
	`\nSubset invariant (cacheReadTokens <= inputTokens per call): ${
		invariantViolations === 0 ? "HOLDS" : `VIOLATED ${invariantViolations}×`
	} across ${totalCalls} calls — reported input tokens are total prompt tokens, cached included.`,
);

console.log("\n## Per raw file");
for (const [file, cell] of perFile) {
	console.log(
		`  ${file}: ${cell.records} records, input ${cell.inputTokens.toLocaleString()} tok, cached ${cell.cacheReadTokens.toLocaleString()} (${pct(cell)}), calls with cache ${cell.callsWithCache}/${cell.calls}`,
	);
}

console.log("\n## Per study group × vendor × condition (nonzero cache only)");
for (const [key, cell] of [...perCell.entries()].sort()) {
	if (cell.cacheReadTokens === 0) continue;
	console.log(
		`  ${key}: input ${cell.inputTokens.toLocaleString()} tok, cached ${cell.cacheReadTokens.toLocaleString()} (${pct(cell)}) over ${cell.records} records`,
	);
}

console.log("\n## Cache-free cells of note (zero provider-reported reads)");
for (const [key, cell] of [...perCell.entries()].sort()) {
	if (cell.cacheReadTokens > 0) continue;
	if (!/studyi|studyj|studyk|sizeext/.test(key)) continue;
	console.log(
		`  ${key}: input ${cell.inputTokens.toLocaleString()} tok over ${cell.records} records`,
	);
}
