/**
 * Study AP analysis (docs/BRIEF-AP.md): the off-catalog fork — gates
 * AP-H1..H4, the H5 contrast, and H6 anatomy.
 *
 *   bun run scripts/analyze-study-ap.ts
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
const CLASSES = ["covered", "trap", "adjacent", "foreign"];
const OPUS = "anthropic/claude-opus-4.8";

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
const rows = (m: string, arm: string, cls?: string) =>
	records.filter(
		(r) => r.model === m && r.condition === arm && (!cls || r.bucket === cls),
	);
const conformant = (rs: TaskRunRecord[]) =>
	rs.filter((r) => d(r).conformant === true).length;
const empty = (rs: TaskRunRecord[]) =>
	rs.filter((r) => d(r).empty === true).length;

for (const model of MODELS) {
	console.log(`--- ${short(model)} ---`);
	for (const arm of ARMS) {
		const parts = CLASSES.map((cls) => {
			const rs = rows(model, arm, cls);
			const bit =
				cls === "foreign" && arm === "AP-shipped"
					? `empty ${empty(rs)}/${rs.length}`
					: `${conformant(rs)}/${rs.length}`;
			return `${cls} ${bit}`;
		}).join(", ");
		const rs = rows(model, arm);
		const warned = rs.filter((r) => Number(d(r).firstWarnings ?? 0) > 0);
		const toolUsed = rs.filter(
			(r) => Number(d(r).tagsListCalls ?? 0) > 0,
		).length;
		const invented = rs.filter((r) => Number(d(r).inventedCount ?? 0) > 0);
		let mintNote = "";
		if (arm === "AP-tool") {
			const attempts = rs.reduce(
				(s, r) => s + Number(d(r).mintAttempts ?? 0),
				0,
			);
			const accepted = rs.reduce(
				(s, r) => s + ((d(r).mints as unknown[]) ?? []).length,
				0,
			);
			mintNote = ` | mints ${accepted}/${attempts} attempts`;
		}
		console.log(
			`${arm}: ${parts} | tags_list ${toolUsed}/${rs.length} | warned ${warned.length} | invented-cells ${invented.length}${mintNote}`,
		);
	}
}

// H6 anatomy: every mint (and rejection) as minted, by model.
console.log("\n=== Mint anatomy (AP-tool) ===");
for (const model of MODELS) {
	for (const r of rows(model, "AP-tool")) {
		const mints = (d(r).mints as string[]) ?? [];
		const rejections = (d(r).mintRejections as string[]) ?? [];
		if (mints.length > 0 || rejections.length > 0) {
			console.log(
				`${short(model)} ${r.taskId} [${r.bucket}]: minted ${JSON.stringify(mints)}${rejections.length ? ` rejected ${JSON.stringify(rejections)}` : ""} → final ${JSON.stringify(d(r).finalTags)}`,
			);
		}
	}
}

// Foreign-class distribution in AP-shipped (the fork, descriptively).
console.log("\n=== AP-shipped foreign distribution ===");
for (const model of MODELS) {
	const rs = rows(model, "AP-shipped", "foreign");
	const generalized = rs.filter(
		(r) => d(r).canonicalClean === true && d(r).empty !== true,
	).length;
	const invented = rs.filter((r) => Number(d(r).inventedCount ?? 0) > 0).length;
	console.log(
		`${short(model)}: empty ${empty(rs)}/${rs.length}, canonical-generalized ${generalized}, invented ${invented}`,
	);
}

// Gates.
const h1n = empty(rows(OPUS, "AP-shipped", "foreign"));
const h1 = h1n >= 10;
const h2adj = conformant(rows(OPUS, "AP-fork", "adjacent"));
const h2for = empty(rows(OPUS, "AP-fork", "foreign"));
const h2 = h2adj >= 10 && h2for >= 10;
const GATE_MODELS = new Set([
	"google/gemini-3.5-flash",
	"anthropic/claude-sonnet-4.5",
	"anthropic/claude-opus-4.8",
]);
let h3 = true;
const h3fails: string[] = [];
for (const model of MODELS) {
	if (!GATE_MODELS.has(model)) continue;
	for (const arm of ARMS) {
		const rs = [...rows(model, arm, "covered"), ...rows(model, arm, "trap")];
		if (rs.length > 0 && conformant(rs) < 22) {
			h3 = false;
			h3fails.push(`${short(model)} ${arm} ${conformant(rs)}/${rs.length}`);
		}
	}
}
let h4 = true;
const h4notes: string[] = [];
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
	h4notes.push(
		`${short(model)} invented ${inventedCells}, core-mint-cells ${coreMintCells}`,
	);
}
// H5 contrast (descriptive).
const h5empty = empty(rows(OPUS, "AP-empty", "adjacent"));
const h5conf = conformant(rows(OPUS, "AP-empty", "adjacent"));

console.log("\n=== Gates ===");
console.log(
	`AP-H1 (opus shipped foreign empty ≥10/12): ${h1 ? "PASS" : "FAIL"} (${h1n}/12)`,
);
console.log(
	`AP-H2 (opus fork: adjacent ≥10/12 AND foreign empty ≥10/12): ${h2 ? "PASS" : "FAIL"} (adjacent ${h2adj}/12, foreign empty ${h2for}/12)`,
);
console.log(
	`AP-H3 (covered+trap ≥22/24 every model × arm): ${h3 ? "PASS" : "FAIL"}${h3fails.length ? ` [${h3fails.join("; ")}]` : ""}`,
);
console.log(
	`AP-H4 (tool: zero invented, core mint-cells ≤1): ${h4 ? "PASS" : "FAIL"} [${h4notes.join("; ")}]`,
);
console.log(
	`AP-H5 (descriptive — opus empty-text adjacent): empty ${h5empty}/12, conformant ${h5conf}/12 (vs fork adjacent ${h2adj}/12)`,
);
console.log(`STUDY GATE: ${h1 && h2 && h3 && h4 ? "PASS" : "FAIL"}`);
