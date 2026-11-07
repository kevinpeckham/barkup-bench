/**
 * Study AZ runner (docs/BRIEF-AZ.md): the slot-sizing static-block slice.
 * 18 registered single-turn template-chat tasks x 3 static-block arms
 * (A0 = main v3.333.x text, A = dev v3.334.0 text, B = A + corrected
 * widget-slot prose), on the shipped tier. The system prompt is the
 * extracted staticBlock + dynamicBlock concatenation (the builder's own
 * canonical full-prompt form); the tool is a verbatim port of
 * template-chat's apply_template_patch definition (replicator
 * src/routes/api/template-chat/+server.ts @ 14e05af), without execute so
 * the first tool call is the graded artifact.
 *
 * Usage: bun scripts/run-study-az.ts [--model anthropic/claude-fable-5.1]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { generateText, tool } from "ai";
import { z } from "zod";
import {
	type AzOp,
	deadWrites,
	gradeExact,
	gradeRequired,
	gradeRequiredAny,
	sizingWrites,
	writtenKeys,
} from "../src/studyaz/grade.js";

const MODEL = process.argv.includes("--model")
	? (process.argv[process.argv.indexOf("--model") + 1] as string)
	: "anthropic/claude-fable-5.1";

const DIR = "corpus/az-slot-sizing";
const ARMS = [
	{ arm: "A0", file: `${DIR}/static-arm-a0.txt` },
	{ arm: "A", file: `${DIR}/static-arm-a.txt` },
	{ arm: "B", file: `${DIR}/static-arm-b.txt` },
] as const;

const dynamicBlock = readFileSync(`${DIR}/dynamic.txt`, "utf8");
const taskFile = JSON.parse(readFileSync(`${DIR}/tasks.json`, "utf8")) as {
	tasks: Array<{
		id: string;
		bucket: "S" | "D" | "T";
		request: string;
		expected?: Record<string, unknown>[];
		required?: Record<string, unknown>[];
		requiredAny?: Record<string, unknown>[][];
	}>;
};

// Verbatim port of template-chat's apply_template_patch description and
// input schema (replicator src/routes/api/template-chat/+server.ts:238-263
// @ 14e05af). No execute: the run stops at the first tool call.
const applyTemplatePatch = tool({
	description:
		"Apply a set of id-anchored edit operations WITHOUT resending the whole template. Preferred over set_template_markup when changing a handful of nodes — and for ALL edits on large templates: cheaper and faster, identical reliability. Operations address nodes by id only — placements use {before: siblingId}, {after: siblingId}, or {parentId} (appends as last child); exactly ONE placement anchor per insert/move; there are NO positional indexes. Ops: {op:'set-attribute', id, key, value} · {op:'remove-attribute', id, key} · {op:'set-name', id, name} · {op:'remove', id} · {op:'insert', node, <placement>} (node = JSON with type/name/id/attributes/children; give every new node a fresh unique id not used anywhere else in the tree) · {op:'move', id, <placement>}. Application is atomic: if any op fails, nothing is applied and you get the failing op's index + issues — fix and retry; if a patch fails twice, rebuild with set_template_markup.",
	inputSchema: z.object({
		operations: z
			.array(z.record(z.string(), z.unknown()))
			.describe("Ordered patch operations (see tool description)."),
		summary: z
			.string()
			.describe("One sentence describing the change, shown to the user."),
	}),
	// Production's success echo shape; the run stops after the first step
	// (default stopWhen), so the first call is still the graded artifact.
	execute: async ({ operations, summary }) => ({
		applied: true,
		operations,
		summary,
	}),
});

interface CellRecord {
	arm: string;
	task: string;
	bucket: string;
	toolCalled: boolean;
	ops: AzOp[];
	pass: boolean | null;
	sizingWrites: number;
	deadWrites: number;
	writtenKeys: string[];
	replyText: string;
	inputTokens: number;
	outputTokens: number;
}

async function runCell(
	staticBlock: string,
	task: (typeof taskFile.tasks)[number],
	arm: string,
): Promise<CellRecord> {
	const result = await generateText({
		model: MODEL,
		system: staticBlock + dynamicBlock,
		messages: [{ role: "user", content: task.request }],
		temperature: 0, // registered standing deviation; the gateway ignores it on fable-5.1
		maxRetries: 4,
		maxOutputTokens: 8000,
		tools: { apply_template_patch: applyTemplatePatch },
	});
	const call = result.toolCalls.find(
		(c) => c.toolName === "apply_template_patch",
	);
	const ops: AzOp[] =
		call && Array.isArray((call.input as { operations?: unknown }).operations)
			? ((call.input as { operations: AzOp[] }).operations ?? [])
			: [];
	let pass: boolean | null = null;
	if (task.bucket === "S" && task.expected) {
		pass = gradeExact(ops, task.expected);
	} else if (task.bucket === "D") {
		const requiredOk = task.required
			? gradeRequired(ops, task.required)
			: task.requiredAny
				? gradeRequiredAny(ops, task.requiredAny)
				: false;
		pass = requiredOk && sizingWrites(ops) === 0;
	} // T bucket has no pass/fail; its grade is the dead-write census
	return {
		arm,
		task: task.id,
		bucket: task.bucket,
		toolCalled: Boolean(call),
		ops,
		pass,
		sizingWrites: sizingWrites(ops),
		deadWrites: deadWrites(ops),
		writtenKeys: writtenKeys(ops),
		replyText: result.text.slice(0, 400),
		inputTokens: result.totalUsage.inputTokens ?? 0,
		outputTokens: result.totalUsage.outputTokens ?? 0,
	};
}

const records: CellRecord[] = [];
for (const { arm, file } of ARMS) {
	const staticBlock = readFileSync(file, "utf8");
	console.log(`\n=== Arm ${arm} ===`);
	for (const task of taskFile.tasks) {
		const rec = await runCell(staticBlock, task, arm);
		records.push(rec);
		const grade =
			rec.bucket === "T"
				? `dead=${rec.deadWrites} keys=[${rec.writtenKeys.join(",")}]`
				: `pass=${rec.pass}`;
		console.log(
			`${arm}/${task.id} tool=${rec.toolCalled} ${grade}${rec.toolCalled ? "" : ` reply="${rec.replyText.slice(0, 120)}"`}`,
		);
	}
}

// --- Summary + registered gates -------------------------------------------
function bucket(arm: string, b: string): CellRecord[] {
	return records.filter((r) => r.arm === arm && r.bucket === b);
}
const passCount = (rs: CellRecord[]) => rs.filter((r) => r.pass).length;
const deadSum = (rs: CellRecord[]) => rs.reduce((s, r) => s + r.deadWrites, 0);

console.log("\n=== Summary ===");
for (const { arm } of ARMS) {
	const s = bucket(arm, "S");
	const d = bucket(arm, "D");
	const t = bucket(arm, "T");
	const dSizing = d.reduce((x, r) => x + r.sizingWrites, 0);
	console.log(
		`${arm}: S ${passCount(s)}/6 exact · D ${passCount(d)}/6 (sizing writes in D: ${dSizing}) · T dead writes ${deadSum(t)} across 6`,
	);
}
const dA0 = passCount(bucket("A0", "D"));
const dA = passCount(bucket("A", "D"));
const dB = passCount(bucket("B", "D"));
const sizesA = bucket("A", "D").reduce((x, r) => x + r.sizingWrites, 0);
const sizesB = bucket("B", "D").reduce((x, r) => x + r.sizingWrites, 0);
const g1 =
	dA >= dA0 &&
	sizesA === 0 &&
	deadSum(bucket("A", "T")) <= deadSum(bucket("A0", "T"));
const g2 =
	passCount(bucket("B", "S")) >= 5 &&
	dB >= dA0 &&
	sizesB === 0 &&
	deadSum(bucket("B", "T")) === 0;
console.log(`\nAZ-G1 (Arm A safe to ship): ${g1 ? "PASS" : "FAIL"}`);
console.log(`AZ-G2 (Arm B green): ${g2 ? "PASS" : "FAIL"}`);
const spendIn = records.reduce((s, r) => s + r.inputTokens, 0);
const spendOut = records.reduce((s, r) => s + r.outputTokens, 0);
console.log(`tokens: input ${spendIn}, output ${spendOut}`);

writeFileSync(
	"results/studyaz.json",
	JSON.stringify(
		{
			model: MODEL,
			date: new Date().toISOString(),
			gates: { g1, g2 },
			records,
		},
		null,
		"\t",
	),
);
console.log("wrote results/studyaz.json");
