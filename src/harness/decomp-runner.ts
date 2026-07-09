/**
 * Study R decomposition runner (docs/BRIEF-R.md): the published fan-out
 * advice executed literally. The application enumerates the target ids
 * (the corpus's committed target set — the deterministic query an app
 * would run) and issues one single-target edit per target, each as a
 * fresh conversation against a minimal view of that target, with the
 * standard ≤3 correction rounds per subtask. A failed subtask leaves
 * its node unchanged and the pipeline continues; the task is graded on
 * the accumulated end state, so per-edit reliability compounds exactly
 * as it would in production.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { generateText } from "ai";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import type { PatchCondition } from "../conditions/types.js";
import { serializeView, VIEW_RULES } from "../conditions/views.js";
import type { Edit } from "../corpus/edits.js";
import { describeEdit } from "../corpus/edits.js";
import type { FanoutTask } from "../corpus/fanout.js";
import { driftCount } from "../grading/drift.js";
import { equalModuloNewIds } from "../grading/equal.js";
import { allIds, cloneTree } from "../tree.js";
import { editMessage } from "./prompts.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { MAX_ROUNDS } from "./runner.js";

const DECOMP_SYSTEM = conditionF.systemPrompt + VIEW_RULES;

async function call(
	model: string,
	system: string,
	messages: ModelMessage[],
): Promise<{
	text: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	reasoningTokens: number;
	latencyMs: number;
}> {
	const started = performance.now();
	const maxOut = process.env.BENCH_MAX_OUTPUT_TOKENS;
	const result = await generateText({
		model,
		system,
		messages,
		temperature: 0,
		maxRetries: 4,
		...(maxOut ? { maxOutputTokens: Number(maxOut) } : {}),
	} as Parameters<typeof generateText>[0]);
	return {
		text: result.text,
		inputTokens: result.totalUsage.inputTokens ?? 0,
		outputTokens: result.totalUsage.outputTokens ?? 0,
		cacheReadTokens: result.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
		reasoningTokens: result.totalUsage.outputTokenDetails?.reasoningTokens ?? 0,
		latencyMs: Math.round(performance.now() - started),
	};
}

/** The single-target edit a fan-out target decomposes to. */
export function subtaskEdit(task: FanoutTask, targetId: string): Edit {
	return task.fanKind === "set-attribute-all"
		? {
				kind: "set-attribute",
				nodeId: targetId,
				key: task.key as string,
				value: task.value as AttributeValue,
			}
		: { kind: "remove-node", nodeId: targetId };
}

export async function runDecompTask(
	task: FanoutTask,
	model: string,
): Promise<TaskRunRecord> {
	const record: TaskRunRecord = {
		taskId: task.id,
		family: task.family,
		bucket: task.bucket as TaskRunRecord["bucket"],
		condition: "R-decomp",
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

	let current = cloneTree(task.tree as BarkupNode);
	let subtaskFailures = 0;
	let allFirstPass = true;

	for (let i = 0; i < task.targetIds.length; i += 1) {
		const targetId = task.targetIds[i] as string;
		const edit = subtaskEdit(task, targetId);
		const instruction = describeEdit(current, edit);
		const condition: PatchCondition = {
			...conditionF,
			id: "R-decomp",
			systemPrompt: DECOMP_SYSTEM,
			serialize: (tree) => serializeView(tree, [targetId], "minimal"),
			applyArtifact: applyShipped,
		};
		const messages: ModelMessage[] = [
			{ role: "user", content: editMessage(condition, current, instruction) },
		];
		let applied: BarkupNode | null = null;
		for (let round = 1; round <= MAX_ROUNDS; round += 1) {
			const outcome = await call(model, condition.systemPrompt, messages);
			messages.push({ role: "assistant", content: outcome.text });
			const result = condition.applyArtifact(outcome.text, current);
			const issueCodes = result.ok ? [] : result.issues.map((x) => x.code);
			record.calls.push({
				phase: i + 1,
				round,
				inputTokens: outcome.inputTokens,
				outputTokens: outcome.outputTokens,
				...(outcome.cacheReadTokens > 0
					? { cacheReadTokens: outcome.cacheReadTokens }
					: {}),
				...(outcome.reasoningTokens > 0
					? { reasoningTokens: outcome.reasoningTokens }
					: {}),
				latencyMs: outcome.latencyMs,
				issueCodes,
			} as CallLog);
			if (result.ok) {
				if (round > 1) allFirstPass = false;
				applied = result.node;
				break;
			}
			if (round < MAX_ROUNDS) {
				messages.push({
					role: "user",
					content: `${formatIssuesFeedback(result.issues, "anchored patch")} The patch was NOT applied — reply with a complete corrected patch against the tree exactly as originally shown.`,
				});
			}
		}
		if (applied) {
			current = applied;
		} else {
			subtaskFailures += 1;
			allFirstPass = false;
		}
	}

	const sourceIds = new Set(allIds(task.tree as BarkupNode));
	record.success = equalModuloNewIds(
		task.expected as BarkupNode,
		current,
		sourceIds,
	);
	record.drift = driftCount(
		task.tree as BarkupNode,
		task.expected as BarkupNode,
		current,
	);
	record.firstPassValid = allFirstPass && subtaskFailures === 0;
	record.detail = {
		finalTree: current,
		subtasks: task.targetIds.length,
		subtaskFailures,
	};
	record.rounds = record.calls.length;
	record.totalInputTokens = record.calls.reduce((s, c) => s + c.inputTokens, 0);
	record.totalOutputTokens = record.calls.reduce(
		(s, c) => s + c.outputTokens,
		0,
	);
	record.totalLatencyMs = record.calls.reduce((s, c) => s + c.latencyMs, 0);
	record.passAt1 = record.success && record.calls.every((c) => c.round === 1);
	return record;
}
