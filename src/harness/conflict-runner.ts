/**
 * Study AA runner (docs/BRIEF-AA.md): the Study Z protocol unchanged
 * (condition-F anchored patches, focused minimal views, the shipped
 * v3.185.0 cached-system layout), with four arms that differ only in
 * how the pack ships:
 *
 * - AA-base     — the pack as-is.
 * - AA-priority — the registered meta-rule inserted under the
 *   styleguide heading.
 * - AA-soft     — the soft-phrased pack ("generally prefer").
 * - AA-memo     — the base pack + the task's governing rules in the
 *   session-notes dynamic tail.
 *
 * The primary outcome is the registered reading classification;
 * `success` records only "resolved" (Layer 1 + not a violation).
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage, SystemModelMessage } from "ai";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import { serializeView } from "../conditions/views.js";
import type { ConflictTask } from "../corpus/conflict.js";
import {
	classifyReading,
	isInstructionFavored,
	isLiteral,
	PRIORITY_META_RULE,
	scanContamination,
	targetContent,
} from "../corpus/conflict.js";
import { buildCachedSystem } from "../shipped/prompt-cache.js";
import { formatSessionNotesBlock } from "../shipped/session-notes.js";
import type { TaskRunRecord } from "./records.js";
import { MAX_ROUNDS } from "./runner.js";
import {
	BASE_SYSTEM,
	callWithSystem,
	onlyTargetChanged,
} from "./standing-runner.js";

export type ConflictArm = "AA-base" | "AA-priority" | "AA-soft" | "AA-memo";

/** The two prompt blocks per arm — exported for the arm-construction
 * tests registered in BRIEF-AA.md. */
export function conflictBlocks(
	task: ConflictTask,
	arm: ConflictArm,
): { staticBlock: string; dynamicBlock: string } {
	let pack = arm === "AA-soft" ? task.softPack : task.pack;
	if (arm === "AA-priority") {
		pack = pack.replace(
			"## Styleguide\n",
			`## Styleguide\n${PRIORITY_META_RULE}\n`,
		);
	}
	const staticBlock = `${BASE_SYSTEM}\n\n# Organization context (standing)\n\n${pack}`;
	const dynamicBlock =
		arm === "AA-memo"
			? formatSessionNotesBlock(
					task.memoRules.map((text) => ({ kind: "rule" as const, text })),
				)
			: "";
	return { staticBlock, dynamicBlock };
}

export async function runConflictTask(
	task: ConflictTask,
	arm: ConflictArm,
	model: string,
): Promise<TaskRunRecord> {
	const { staticBlock, dynamicBlock } = conflictBlocks(task, arm);
	const system: SystemModelMessage[] = buildCachedSystem(
		staticBlock,
		dynamicBlock,
	);

	const view = serializeView(task.tree, [task.targetId], "minimal");
	const messages: ModelMessage[] = [
		{
			role: "user",
			content: `Here is the current tree:\n\n${view}\nEdit request: ${task.instruction}\n\nReply with the anchored patch.`,
		},
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

	let finalTree: BarkupNode | null = null;
	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const outcome = await callWithSystem(model, system, messages);
		messages.push({
			role: "assistant",
			content: outcome.text === "" ? "(empty reply)" : outcome.text,
		});
		const applied = applyShipped(outcome.text, task.tree);
		const issueCodes = applied.ok ? [] : applied.issues.map((i) => i.code);
		record.calls.push({ phase: 1, round, issueCodes, ...outcome.log });
		if (applied.ok) {
			if (round === 1) record.firstPassValid = true;
			finalTree = applied.node;
			break;
		}
		record.firstPassValid = record.firstPassValid ?? false;
		if (round < MAX_ROUNDS) {
			messages.push({
				role: "user",
				content: `${formatIssuesFeedback(applied.issues, conditionF.artifactName)} The patch was NOT applied — reply with a complete corrected patch against the tree exactly as originally shown.`,
			});
		}
	}

	record.rounds = record.calls.length;
	record.totalInputTokens = record.calls.reduce(
		(sum, c) => sum + c.inputTokens,
		0,
	);
	record.totalOutputTokens = record.calls.reduce(
		(sum, c) => sum + c.outputTokens,
		0,
	);
	record.totalLatencyMs = record.calls.reduce((sum, c) => sum + c.latencyMs, 0);

	let layerOneOk = false;
	let reading: ReturnType<typeof classifyReading> = "violation";
	let contamination: string[] = [];
	let content = "";
	if (finalTree) {
		layerOneOk = onlyTargetChanged(task.tree, finalTree, task.targetId);
		content = targetContent(task, finalTree);
		reading = classifyReading(task, content);
		contamination = scanContamination(task, content);
	}
	record.success = layerOneOk && reading !== "violation";
	record.passAt1 =
		record.success && record.calls.every((call) => call.round === 1);
	record.detail = {
		arm,
		kind: task.kind,
		ruleOrder: task.ruleOrder,
		packId: task.packId,
		layerOneOk,
		reading,
		literal: isLiteral(task.kind, reading),
		instructionFavored: isInstructionFavored(task.kind, reading),
		contamination,
		finalContent: content,
	};
	return record;
}
