/**
 * The `slot-sizing` regression gate's cell runner (docs/REGRESSION.md,
 * amendment 2026-11-07): Study AZ's 18-task slot-sizing slice against
 * the SHIPPED template-chat static block (corpus/az-slot-sizing/
 * static-shipped.txt, extracted at replicator dev 65d4a27d and
 * byte-identical to the study's green Arm B), promised to the
 * Replicator agent in the 2026-11-07 slot-sizing REPLY.
 *
 * The tool is the verbatim port of template-chat's apply_template_patch
 * (replicator src/routes/api/template-chat/+server.ts:238-263; the
 * description is unchanged from 14e05af through 65d4a27d), as in
 * scripts/run-study-az.ts.
 */
import { readFileSync } from "node:fs";
import { generateText, tool } from "ai";
import { z } from "zod";
import type { TaskRunRecord } from "../harness/records.js";
import {
	type AzOp,
	deadWrites,
	gradeExact,
	gradeRequired,
	gradeRequiredAny,
	sizingWrites,
	writtenKeys,
} from "../studyaz/grade.js";

export const SLOT_SIZING_CONDITION = "AZ-shipped";
const DIR = "corpus/az-slot-sizing";

export interface SlotSizingTask {
	id: string;
	bucket: "S" | "D" | "T";
	request: string;
	expected?: Record<string, unknown>[];
	required?: Record<string, unknown>[];
	requiredAny?: Record<string, unknown>[][];
}

export function loadSlotSizingTasks(): SlotSizingTask[] {
	const file = JSON.parse(readFileSync(`${DIR}/tasks.json`, "utf8")) as {
		tasks: SlotSizingTask[];
	};
	return file.tasks;
}

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
	execute: async ({ operations, summary }) => ({
		applied: true,
		operations,
		summary,
	}),
});

export async function runSlotSizingTask(
	task: SlotSizingTask,
	model: string,
): Promise<TaskRunRecord> {
	const system =
		readFileSync(`${DIR}/static-shipped.txt`, "utf8") +
		readFileSync(`${DIR}/dynamic.txt`, "utf8");
	const started = performance.now();
	const result = await generateText({
		model,
		system,
		messages: [{ role: "user", content: task.request }],
		temperature: 0, // registered standing deviation; the gateway ignores it on fable-5.1
		maxRetries: 4,
		maxOutputTokens: 8000,
		tools: { apply_template_patch: applyTemplatePatch },
	});
	const latencyMs = Math.round(performance.now() - started);
	const call = result.toolCalls.find(
		(c) => c.toolName === "apply_template_patch",
	);
	const ops: AzOp[] =
		call && Array.isArray((call.input as { operations?: unknown }).operations)
			? ((call.input as { operations: AzOp[] }).operations ?? [])
			: [];
	let success: boolean;
	if (task.bucket === "S" && task.expected) {
		success = gradeExact(ops, task.expected);
	} else if (task.bucket === "D") {
		const requiredOk = task.required
			? gradeRequired(ops, task.required)
			: task.requiredAny
				? gradeRequiredAny(ops, task.requiredAny)
				: false;
		success = requiredOk && sizingWrites(ops) === 0;
	} else {
		// T (trap): the gate's criterion is the dead-write census.
		success = deadWrites(ops) === 0;
	}
	const inputTokens = result.totalUsage.inputTokens ?? 0;
	const outputTokens = result.totalUsage.outputTokens ?? 0;
	return {
		taskId: task.id,
		family: "transformation",
		// The harness bucket union has no AZ names; the real bucket rides
		// in detail.az and T maps to the union's "trap".
		bucket: task.bucket === "T" ? "trap" : "covered",
		condition: SLOT_SIZING_CONDITION,
		model,
		regime: "parity",
		success,
		firstPassValid: null,
		passAt1: success,
		rounds: 1,
		drift: null,
		idRefFailure: null,
		toolErrorCount: null,
		totalInputTokens: inputTokens,
		totalOutputTokens: outputTokens,
		totalLatencyMs: latencyMs,
		calls: [
			{
				phase: 1,
				round: 1,
				inputTokens,
				outputTokens,
				latencyMs,
				issueCodes: [],
			},
		],
		detail: {
			az: task.bucket,
			toolCalled: Boolean(call),
			ops,
			sizingWrites: sizingWrites(ops),
			deadWrites: deadWrites(ops),
			writtenKeys: writtenKeys(ops),
			replyText: result.text.slice(0, 400),
		},
	};
}
