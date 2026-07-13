/**
 * Study Z analysis (docs/BRIEF-Z.md): standing-context arms under the
 * registered obligation grading (primary), the pre-registered gates
 * Z-H1/Z-H2/Z-H3, the contamination scan, the caching appendix from
 * recorded cacheRead/cacheWrite tokens, and a DISCLOSED post-hoc
 * reanalysis of the combined tasks under the R-tm rule's own
 * conditional semantics ("on every mention" — no mention, no
 * obligation), motivated by the observed strict-form reading.
 *
 *   bun run scripts/analyze-study-z.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { StandingTask } from "../src/corpus/standing.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { mcnemarExact } from "../src/stats/mcnemar.js";

const MODELS = [
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
	"anthropic/claude-opus-4.8",
];
const ARMS = ["Z-full", "Z-slice", "Z-memo"] as const;

function loadRecords(path: string): TaskRunRecord[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as TaskRunRecord);
}

const corpus = JSON.parse(readFileSync("corpus/standing.json", "utf8")) as {
	tasks: StandingTask[];
};
const taskById = new Map(corpus.tasks.map((t) => [t.id, t]));

const byModel = new Map<string, TaskRunRecord[]>();
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	byModel.set(model, loadRecords(`results/raw/studyz-${slug}.jsonl`));
}

function detail(record: TaskRunRecord): Record<string, unknown> {
	return record.detail ?? {};
}

function cell(
	records: TaskRunRecord[],
	arm: string,
	kind?: string,
): TaskRunRecord[] {
	return records.filter(
		(r) =>
			r.condition === arm &&
			(kind === undefined || detail(r).taskKind === kind),
	);
}

function passCount(rows: TaskRunRecord[]): number {
	return rows.filter((r) => r.success).length;
}

/** Conditional-tm regrade (disclosed post-hoc): tm binds only where
 * the product is actually mentioned. All other obligations unchanged. */
function conditionalSuccess(record: TaskRunRecord): boolean {
	const task = taskById.get(record.taskId);
	if (!task) return record.success;
	const d = detail(record);
	if (d.layerOneOk !== true) return false;
	const content = String(d.finalContent ?? "");
	for (const ob of task.obligations) {
		const [type, ...rest] = ob.split(":");
		const value = rest.join(":");
		if (type === "tm") {
			if (content.includes(value) && !content.includes(`${value}™`)) {
				return false;
			}
		} else if (type === "fact") {
			if (!content.includes(ob.split(":").slice(2).join(":"))) return false;
		} else if (type === "style") {
			if (d.finalTextStyle !== value) return false;
		} else if (type === "end") {
			if (!content.trimEnd().endsWith(value)) return false;
		} else if (type === "cta") {
			if (content.trim() !== value) return false;
		} else if (type === "contact") {
			if (!content.includes(value)) return false;
		}
	}
	return true;
}

console.log("=== Study Z: standing context (registered grading) ===\n");
for (const model of MODELS) {
	const records = byModel.get(model) ?? [];
	console.log(`${model} (${records.length} cells):`);
	for (const arm of ARMS) {
		const parts = ["fact", "rule", "combined"].map(
			(kind) =>
				`${kind} ${passCount(cell(records, arm, kind))}/${cell(records, arm, kind).length}`,
		);
		const all = cell(records, arm);
		console.log(
			`  ${arm}: ${passCount(all)}/${all.length}  (${parts.join(", ")})`,
		);
	}
}

console.log("\n=== Contamination (all cells) ===");
let contamTotal = 0;
for (const model of MODELS) {
	for (const r of byModel.get(model) ?? []) {
		const events = (detail(r).contamination as string[] | undefined) ?? [];
		if (events.length > 0) {
			contamTotal += events.length;
			console.log(
				`  ${model} ${r.taskId}/${r.condition}: ${events.join(", ")}`,
			);
		}
	}
}
console.log(`  total contamination events: ${contamTotal} / 324 cells`);

console.log(
	"\n=== Z-H1 gate: Z-full vs Z-slice per model (McNemar, registered) ===",
);
for (const model of MODELS) {
	const records = byModel.get(model) ?? [];
	const full = new Map(
		cell(records, "Z-full").map((r) => [r.taskId, r.success]),
	);
	const slice = new Map(
		cell(records, "Z-slice").map((r) => [r.taskId, r.success]),
	);
	let fullOnly = 0;
	let sliceOnly = 0;
	for (const [id, f] of full) {
		const s = slice.get(id) ?? false;
		if (f && !s) fullOnly += 1;
		if (!f && s) sliceOnly += 1;
	}
	const m = mcnemarExact(fullOnly, sliceOnly);
	console.log(
		`  ${model}: full-only=${fullOnly}, slice-only=${sliceOnly}, p=${m.pValue.toFixed(4)}`,
	);
}

console.log(
	"\n=== Z-H1 on the unconfounded subset (fact+rule only, disclosed) ===",
);
for (const model of MODELS) {
	const records = byModel.get(model) ?? [];
	const sub = records.filter((r) => detail(r).taskKind !== "combined");
	const full = sub.filter((r) => r.condition === "Z-full");
	const slice = sub.filter((r) => r.condition === "Z-slice");
	console.log(
		`  ${model}: Z-full ${passCount(full)}/${full.length}, Z-slice ${passCount(slice)}/${slice.length}`,
	);
}

console.log("\n=== Z-H2: Z-memo vs Z-full on rule+combined (McNemar) ===");
for (const model of MODELS) {
	const records = byModel.get(model) ?? [];
	const sub = records.filter((r) => detail(r).taskKind !== "fact");
	const full = new Map(
		sub
			.filter((r) => r.condition === "Z-full")
			.map((r) => [r.taskId, r.success]),
	);
	const memo = new Map(
		sub
			.filter((r) => r.condition === "Z-memo")
			.map((r) => [r.taskId, r.success]),
	);
	let memoOnly = 0;
	let fullOnly = 0;
	for (const [id, mm] of memo) {
		const f = full.get(id) ?? false;
		if (mm && !f) memoOnly += 1;
		if (!mm && f) fullOnly += 1;
	}
	const m = mcnemarExact(fullOnly, memoOnly);
	console.log(
		`  ${model}: memo-only=${memoOnly}, full-only=${fullOnly}, p=${m.pValue.toFixed(4)}`,
	);
}

console.log(
	"\n=== Z-H3: rule compliance by styleguide position (descriptive) ===",
);
for (const model of MODELS) {
	const records = byModel.get(model) ?? [];
	for (const kind of ["rule", "combined"]) {
		const parts: string[] = [];
		for (const position of ["head", "middle", "tail"]) {
			const rows = records.filter(
				(r) =>
					detail(r).taskKind === kind && detail(r).rulePosition === position,
			);
			parts.push(`${position} ${passCount(rows)}/${rows.length}`);
		}
		console.log(`  ${model} (${kind}): ${parts.join(", ")}`);
	}
}

console.log(
	"\n=== Combined-task anatomy (drives the disclosed reanalysis) ===",
);
for (const model of MODELS) {
	const records = byModel.get(model) ?? [];
	for (const arm of [...ARMS, null]) {
		let both = 0;
		let formOnly = 0;
		let violation = 0;
		for (const r of records.filter(
			(rr) =>
				detail(rr).taskKind === "combined" &&
				(arm === null || rr.condition === arm),
		)) {
			const task = taskById.get(r.taskId);
			if (!task) continue;
			const c = String(detail(r).finalContent ?? "");
			const contactOk =
				c.includes(`${task.target.email} | ${task.target.city}`) &&
				detail(r).layerOneOk === true;
			const mentions = c.includes(task.target.product);
			const tm = c.includes(`${task.target.product}™`);
			if (contactOk && mentions && tm) both += 1;
			else if (contactOk && !mentions) formOnly += 1;
			else violation += 1;
		}
		console.log(
			`  ${model} ${arm ?? "ALL"}: both-obligations=${both}, strict-form(no mention)=${formOnly}, true violations=${violation}`,
		);
	}
}

console.log(
	"\n=== Conditional-tm regrade (disclosed post-hoc; tm binds only on mention) ===",
);
for (const model of MODELS) {
	const records = byModel.get(model) ?? [];
	for (const arm of ARMS) {
		const rows = cell(records, arm);
		const pass = rows.filter(conditionalSuccess).length;
		console.log(`  ${model} ${arm}: ${pass}/${rows.length}`);
	}
}

console.log("\n=== Caching appendix (recorded tokens) ===");
for (const model of MODELS) {
	const records = byModel.get(model) ?? [];
	for (const arm of ARMS) {
		const rows = cell(records, arm);
		let input = 0;
		let read = 0;
		let write = 0;
		for (const r of rows) {
			for (const c of r.calls) {
				input += c.inputTokens;
				read += c.cacheReadTokens ?? 0;
				write += c.cacheWriteTokens ?? 0;
			}
		}
		// Anthropic pricing shape: reads 10%, writes 125% of base input.
		const uncachedEquivalent = input + read + write;
		const effective = input + 0.1 * read + 1.25 * write;
		const saving =
			uncachedEquivalent > 0 ? (1 - effective / uncachedEquivalent) * 100 : 0;
		console.log(
			`  ${model} ${arm}: input=${input} cacheRead=${read} cacheWrite=${write} → input-cost ${saving >= 0 ? "-" : "+"}${Math.abs(saving).toFixed(1)}% vs uncached`,
		);
	}
}

const spot = loadRecords("results/raw/studyz-spotcheck.jsonl");
if (spot.length > 0) {
	console.log(
		"\n=== Neutrality spot-check (plain string system, sonnet Z-full) ===",
	);
	const sonnet = byModel.get("anthropic/claude-sonnet-4.5") ?? [];
	let same = 0;
	let diff = 0;
	for (const s of spot) {
		const paired = sonnet.find(
			(r) => r.taskId === s.taskId && r.condition === "Z-full",
		);
		if (!paired) continue;
		const a = String(detail(s).finalContent ?? "");
		const b = String(detail(paired).finalContent ?? "");
		if (a === b && s.success === paired.success) same += 1;
		else {
			diff += 1;
			console.log(
				`  DIVERGE ${s.taskId}: plain=${JSON.stringify(a).slice(0, 80)} cached=${JSON.stringify(b).slice(0, 80)} (success ${s.success} vs ${paired.success})`,
			);
		}
	}
	console.log(`  ${same} identical outputs, ${diff} divergent (descriptive)`);
}
