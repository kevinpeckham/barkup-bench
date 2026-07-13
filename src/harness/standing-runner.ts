/**
 * Study Z runner (docs/BRIEF-Z.md): single-turn condition-F anchored
 * patches over focused views, with the standing org pack shipped in
 * the SYSTEM prompt via the verbatim v3.185.0 cache layout
 * (`buildCachedSystem`: static block carries the Anthropic cache
 * breakpoint, dynamic tail follows). Arms differ only in how much
 * context ships and where:
 *
 * - Z-full  — whole pack in the static block, empty dynamic tail.
 * - Z-slice — target client section + governing rules only.
 * - Z-memo  — whole pack PLUS the governing rules distilled into the
 *   shipped session-notes block in the DYNAMIC tail. (Fact tasks have
 *   no governing rules, so their Z-memo cells are byte-identical to
 *   Z-full by construction — registered, and free cache reads.)
 *
 * Grading: Layer 1 mechanical (patch applies; ONLY the target slot
 * changed), then the registered obligation graders; contamination
 * recorded separately. Per-call cacheRead/cacheWrite tokens recorded
 * for the caching appendix.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage, SystemModelMessage } from "ai";
import { generateText } from "ai";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import { serializeView, VIEW_RULES } from "../conditions/views.js";
import type { StandingTask } from "../corpus/standing.js";
import { gradeStanding } from "../corpus/standing.js";
import { equalExact } from "../grading/equal.js";
import { buildCachedSystem } from "../shipped/prompt-cache.js";
import { formatSessionNotesBlock } from "../shipped/session-notes.js";
import { findById } from "../tree.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { MAX_ROUNDS } from "./runner.js";

export type StandingArm = "Z-full" | "Z-slice" | "Z-memo";

export const BASE_SYSTEM = conditionF.systemPrompt + VIEW_RULES;

/** The two prompt blocks per arm — exported so tests can assert the
 * arm constructions registered in BRIEF-Z.md. */
export function standingBlocks(
	task: StandingTask,
	arm: StandingArm,
): { staticBlock: string; dynamicBlock: string } {
	const pack = arm === "Z-slice" ? task.slicePack : task.pack;
	const staticBlock = `${BASE_SYSTEM}\n\n# Organization context (standing)\n\n${pack}`;
	const dynamicBlock =
		arm === "Z-memo"
			? formatSessionNotesBlock(
					task.memoRules.map((text) => ({ kind: "rule" as const, text })),
				)
			: "";
	return { staticBlock, dynamicBlock };
}

/** Layer 1: the final tree differs from the base ONLY at the target
 * node (attributes/name); structure identical elsewhere. */
export function onlyTargetChanged(
	base: BarkupNode,
	final: BarkupNode,
	targetId: string,
): boolean {
	const expected = structuredClone(base);
	const slot = findById(expected, targetId);
	const produced = findById(final, targetId);
	if (!slot || !produced) return false;
	if (produced.attributes !== undefined) {
		slot.attributes = produced.attributes;
	} else {
		delete slot.attributes;
	}
	if (produced.name !== undefined) slot.name = produced.name;
	return equalExact(expected, final);
}

export async function callWithSystem(
	model: string,
	system: SystemModelMessage[],
	messages: ModelMessage[],
): Promise<{
	text: string;
	log: Omit<CallLog, "phase" | "round" | "issueCodes">;
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
	});
	const usage = result.totalUsage;
	const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;
	const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
	const reasoning = usage.outputTokenDetails?.reasoningTokens ?? 0;
	return {
		text: result.text,
		log: {
			inputTokens: usage.inputTokens ?? 0,
			outputTokens: usage.outputTokens ?? 0,
			...(cacheRead > 0 ? { cacheReadTokens: cacheRead } : {}),
			...(cacheWrite > 0 ? { cacheWriteTokens: cacheWrite } : {}),
			...(reasoning > 0 ? { reasoningTokens: reasoning } : {}),
			latencyMs: Math.round(performance.now() - started),
		},
	};
}

/**
 * One Study Z cell. `plainSystem: true` is the 10-cell neutrality
 * spot-check (same full text as ONE string, no cache breakpoint).
 */
export async function runStandingTask(
	task: StandingTask,
	arm: StandingArm,
	model: string,
	options: { plainSystem?: boolean; conditionId?: string } = {},
): Promise<TaskRunRecord> {
	const { staticBlock, dynamicBlock } = standingBlocks(task, arm);
	const system: SystemModelMessage[] = options.plainSystem
		? [{ role: "system", content: staticBlock + dynamicBlock }]
		: buildCachedSystem(staticBlock, dynamicBlock);

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
		condition: options.conditionId ?? arm,
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
	let failedObligations: string[] = [];
	let contamination: string[] = [];
	if (finalTree) {
		layerOneOk = onlyTargetChanged(task.tree, finalTree, task.targetId);
		const grade = gradeStanding(task, finalTree);
		failedObligations = grade.failedObligations;
		contamination = grade.contamination;
		record.success = layerOneOk && grade.success;
	}
	const targetNode = finalTree ? findById(finalTree, task.targetId) : null;
	record.passAt1 =
		record.success && record.calls.every((call) => call.round === 1);
	record.detail = {
		arm,
		taskKind: task.kind,
		...(task.form ? { form: task.form } : {}),
		...(task.rulePosition ? { rulePosition: task.rulePosition } : {}),
		packId: task.packId,
		layerOneOk,
		failedObligations,
		contamination,
		plainSystem: options.plainSystem === true,
		finalContent: String(targetNode?.attributes?.content ?? ""),
		...(targetNode?.attributes?.textStyle !== undefined
			? { finalTextStyle: targetNode.attributes.textStyle }
			: {}),
	};
	return record;
}
