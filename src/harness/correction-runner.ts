/**
 * Study AJ runner (docs/BRIEF-AJ.md): the correction loop in
 * isolation. The corrupted patch is injected as the assistant's
 * prior turn; ONE feedback message (the arm's only difference) is
 * sent; the single reply is graded. Feedback builders are exported
 * pure for unit tests.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import { serializeView, VIEW_RULES } from "../conditions/views.js";
import type { SeededTask } from "../corpus/seeded.js";
import { equalModuloNewIds } from "../grading/equal.js";
import { allIds } from "../tree.js";
import { callOnce } from "./ask-runner.js";
import type { TaskRunRecord } from "./records.js";

export type CorrectionArm = "AJ-structured" | "AJ-codes" | "AJ-bare";
export const CORRECTION_ARMS: CorrectionArm[] = [
	"AJ-structured",
	"AJ-codes",
	"AJ-bare",
];

/** The shared retry wrapper, verbatim across all three arms. */
export const RETRY_WRAPPER =
	"The patch was NOT applied — reply with a complete corrected patch against the tree exactly as originally shown.";

type SeededIssues = Extract<
	ReturnType<typeof applyShipped>,
	{ ok: false }
>["issues"];

/** The arm's feedback message (BRIEF-AJ.md, registered verbatim). */
export function feedbackFor(arm: CorrectionArm, issues: SeededIssues): string {
	switch (arm) {
		case "AJ-structured":
			return `${formatIssuesFeedback(issues, "anchored patch")} ${RETRY_WRAPPER}`;
		case "AJ-codes":
			return `The anchored patch was invalid (issue codes: ${issues
				.map((i) => i.code)
				.join(", ")}). ${RETRY_WRAPPER}`;
		case "AJ-bare":
			return `The anchored patch was invalid. ${RETRY_WRAPPER}`;
	}
}

export async function runCorrectionCell(
	task: SeededTask,
	arm: CorrectionArm,
	model: string,
): Promise<TaskRunRecord> {
	const system = conditionF.systemPrompt + VIEW_RULES;
	const view = serializeView(task.tree, task.focusIds, "minimal");
	const corruptedText = `\`\`\`json\n${JSON.stringify(task.corruptedPatch, null, "\t")}\n\`\`\``;
	const seeded = applyShipped(JSON.stringify(task.corruptedPatch), task.tree);
	if (seeded.ok) throw new Error(`corpus bug: ${task.id} corruption applied`);

	const messages: ModelMessage[] = [
		{
			role: "user",
			content: `Here is a focused view of the current tree:\n\n${view}\n\nEdit request: ${task.instruction}\n\nReply with the anchored patch.`,
		},
		{ role: "assistant", content: corruptedText },
		{ role: "user", content: feedbackFor(arm, seeded.issues) },
	];

	const record: TaskRunRecord = {
		taskId: task.id,
		family: task.family,
		bucket: task.bucket,
		condition: arm,
		model,
		regime: "parity",
		success: false,
		firstPassValid: null,
		passAt1: false,
		rounds: 0,
		drift: null,
		idRefFailure: null,
		toolErrorCount: null,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		totalLatencyMs: 0,
		calls: [],
	};

	const call = await callOnce(model, system, messages, false);
	const applied = applyShipped(call.text, task.tree);
	record.calls.push({
		phase: 1,
		round: 1,
		issueCodes: applied.ok ? [] : applied.issues.map((i) => i.code),
		...call.log,
	});
	record.rounds = 1;
	record.totalInputTokens = call.log.inputTokens;
	record.totalOutputTokens = call.log.outputTokens;
	record.totalLatencyMs = call.log.latencyMs;

	let outcome: "recovered" | "valid-but-wrong" | "still-invalid" =
		"still-invalid";
	let finalTree: BarkupNode | null = null;
	if (applied.ok) {
		finalTree = applied.node;
		outcome = equalModuloNewIds(
			task.expected,
			finalTree,
			new Set(allIds(task.tree)),
		)
			? "recovered"
			: "valid-but-wrong";
	}
	record.success = outcome === "recovered";
	record.firstPassValid = applied.ok;
	record.passAt1 = record.success;
	record.detail = {
		arm,
		corruption: task.corruption,
		editKind: task.editKind,
		outcome,
		seededIssueCodes: seeded.issues.map((i) => i.code),
	};
	return record;
}
