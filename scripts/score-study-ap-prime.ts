/**
 * Study AP′ re-score (docs/BRIEF-AP-PRIME.md): AP's frozen raw results
 * re-scored under the UNCHANGED adjacent conformance rule against the
 * locked independent key (corpus/tag-steering-ap-acceptable-v2.json).
 * Covered/trap/foreign scoring untouched; H1/H3/H4 carried and
 * re-confirmed from the same records.
 *
 *   bun run scripts/score-study-ap-prime.ts
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
const ARMS = ["AP-shipped", "AP-fork", "AP-empty", "AP-tool"];
const OPUS = "anthropic/claude-opus-4.8";

const corpus = JSON.parse(
	readFileSync("corpus/tag-steering-ap.json", "utf8"),
) as { catalog: { name: string }[] };
const CATALOG = new Set(corpus.catalog.map((t) => t.name));
const key = JSON.parse(
	readFileSync("corpus/tag-steering-ap-acceptable-v2.json", "utf8"),
) as { adjacent: Record<string, { acceptable: string[] }> };

const records: TaskRunRecord[] = [];
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const path = `results/raw/studyap-${slug}.jsonl`;
	if (!existsSync(path)) continue;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (line.trim() !== "") records.push(JSON.parse(line) as TaskRunRecord);
	}
}
const d = (r: TaskRunRecord) => (r.detail ?? {}) as Record<string, unknown>;
const short = (m: string) => m.split("/")[1] as string;

/** AP's adjacent rule, byte-for-byte semantics, v2 sets. */
function adjacentConformantV2(r: TaskRunRecord): boolean {
	const detail = d(r);
	const finalTags = detail.finalTags as string[] | null;
	if (finalTags === null || finalTags.length === 0) return false;
	const mints = new Set((detail.mints as string[]) ?? []);
	const acceptable = new Set(key.adjacent[r.taskId]?.acceptable ?? []);
	const invented = finalTags.filter((t) => !CATALOG.has(t) && !mints.has(t));
	if (invented.length > 0) return false;
	return finalTags.filter((t) => !mints.has(t)).every((t) => acceptable.has(t));
}

const rows = (m: string, arm: string, cls?: string) =>
	records.filter(
		(r) => r.model === m && r.condition === arm && (!cls || r.bucket === cls),
	);
const conformantV1 = (rs: TaskRunRecord[]) =>
	rs.filter((r) => d(r).conformant === true).length;
const empty = (rs: TaskRunRecord[]) =>
	rs.filter((r) => d(r).empty === true).length;

console.log("=== Adjacent conformance, v1 key → locked v2 key ===");
for (const model of MODELS) {
	for (const arm of ARMS) {
		const rs = rows(model, arm, "adjacent");
		const v2 = rs.filter(adjacentConformantV2).length;
		console.log(`${short(model)} ${arm}: ${conformantV1(rs)}/12 → ${v2}/12`);
	}
}

console.log("\n=== v1 misses: absolved vs standing under v2 ===");
for (const model of MODELS) {
	for (const r of records.filter(
		(r) =>
			r.model === model && r.bucket === "adjacent" && d(r).conformant === false,
	)) {
		const v2ok = adjacentConformantV2(r);
		console.log(
			`${short(model)} ${r.condition} ${r.taskId}: ${v2ok ? "ABSOLVED" : "STANDS"} final=${JSON.stringify(d(r).finalTags)}`,
		);
	}
}

// Gates.
const h1n = empty(rows(OPUS, "AP-shipped", "foreign"));
const h2adj = rows(OPUS, "AP-fork", "adjacent").filter(
	adjacentConformantV2,
).length;
const h2for = empty(rows(OPUS, "AP-fork", "foreign"));
const GATE_MODELS = new Set([
	"google/gemini-3.5-flash",
	"anthropic/claude-sonnet-4.5",
	"anthropic/claude-opus-4.8",
]);
let h3 = true;
for (const model of MODELS) {
	if (!GATE_MODELS.has(model)) continue;
	for (const arm of ARMS) {
		const rs = [...rows(model, arm, "covered"), ...rows(model, arm, "trap")];
		if (rs.length > 0 && conformantV1(rs) < 22) h3 = false;
	}
}
let h4 = true;
for (const model of MODELS) {
	if (!GATE_MODELS.has(model)) continue;
	const rs = rows(model, "AP-tool");
	const inventedCells = rs.filter(
		(r) => Number(d(r).inventedCount ?? 0) > 0,
	).length;
	const coreMintCells = rs.filter(
		(r) =>
			(r.bucket === "covered" || r.bucket === "trap") &&
			Number(d(r).mintAttempts ?? 0) > 0,
	).length;
	if (inventedCells > 0 || coreMintCells > 1) h4 = false;
}
const h5emptyArm = rows(OPUS, "AP-empty", "adjacent").filter(
	adjacentConformantV2,
).length;

console.log("\n=== Gates (AP′) ===");
console.log(`AP-H1 (carried): ${h1n >= 10 ? "PASS" : "FAIL"} (${h1n}/12)`);
console.log(
	`AP′-H2 (opus fork adjacent ≥10/12 AND foreign empty ≥10/12): ${h2adj >= 10 && h2for >= 10 ? "PASS" : "FAIL"} (adjacent ${h2adj}/12, foreign empty ${h2for}/12)`,
);
console.log(`AP-H3 (carried, re-confirmed): ${h3 ? "PASS" : "FAIL"}`);
console.log(`AP-H4 (carried, re-confirmed): ${h4 ? "PASS" : "FAIL"}`);
console.log(
	`AP′-H5 (opus adjacent contrast under v2): fork ${h2adj}/12 vs empty-text ${h5emptyArm}/12`,
);
console.log(
	`STUDY GATE (AP′): ${h1n >= 10 && h2adj >= 10 && h2for >= 10 && h3 && h4 ? "PASS" : "FAIL"}`,
);
