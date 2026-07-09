/**
 * Study N two-stage runner (docs/BRIEF-N.md): stage 1 grounds (full
 * tree + instruction → JSON array of the ids the edit concerns, 1
 * attempt + ≤2 correction rounds), stage 2 patches against the minimal
 * JSON view focused on the stage-1 ids (Study I's FT prompt, standard
 * ≤3 correction rounds, fresh conversation — the patcher never sees
 * the full tree). N-ground2 uses one model for both stages; N-ground2x
 * grounds with the cheap model and patches with the frontier model.
 * Records carry the patcher as `model`, the grounder in `detail`, and
 * stage-1 calls as phase 1 / stage-2 calls as phase 2.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { generateText } from "ai";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import {
	GROUNDER_SYSTEM,
	grounderMessage,
	parseGrounding,
} from "../conditions/grounded-n.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import type { PatchCondition } from "../conditions/types.js";
import { serializeView, VIEW_RULES } from "../conditions/views.js";
import type { TransformationTask } from "../corpus/tasks.js";
import { driftCount } from "../grading/drift.js";
import { equalModuloNewIds } from "../grading/equal.js";
import { allIds } from "../tree.js";
import { editMessage } from "./prompts.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { MAX_ROUNDS } from "./runner.js";

/** Pre-registered: stage 1 is 1 attempt + up to 2 correction rounds. */
export const GROUND_ROUNDS = 3;

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

function toCallLog(
	outcome: Awaited<ReturnType<typeof call>>,
	phase: number,
	round: number,
	issueCodes: string[],
): CallLog {
	return {
		phase,
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
	};
}

export async function runGround2Task(
	task: TransformationTask,
	grounderModel: string,
	patcherModel: string,
	conditionId: "N-ground2" | "N-ground2x",
): Promise<TaskRunRecord> {
	const record: TaskRunRecord = {
		taskId: task.id,
		family: task.family,
		bucket: task.bucket,
		condition: conditionId,
		model: patcherModel,
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

	// Stage 1: grounding.
	const groundMessages: ModelMessage[] = [
		{ role: "user", content: grounderMessage(task.tree, task.instruction) },
	];
	let stage1Ids: string[] | null = null;
	let stage1Rounds = 0;
	for (let round = 1; round <= GROUND_ROUNDS; round += 1) {
		stage1Rounds = round;
		const outcome = await call(grounderModel, GROUNDER_SYSTEM, groundMessages);
		groundMessages.push({ role: "assistant", content: outcome.text });
		const parsed = parseGrounding(outcome.text, task.tree);
		record.calls.push(
			toCallLog(outcome, 1, round, parsed.ok ? [] : ["invalid-grounding"]),
		);
		if (parsed.ok) {
			stage1Ids = parsed.ids;
			break;
		}
		if (round < GROUND_ROUNDS) {
			groundMessages.push({
				role: "user",
				content: `The grounding was invalid: ${parsed.reason} Reply with a JSON array of existing node ids, nothing else.`,
			});
		}
	}

	let finalTree: BarkupNode | null = null;
	let firstPassValid = false;
	if (stage1Ids !== null) {
		// Stage 2: patch against the focused view, fresh conversation.
		const ids = stage1Ids;
		const condition: PatchCondition = {
			...conditionF,
			id: conditionId,
			systemPrompt: conditionF.systemPrompt + VIEW_RULES,
			serialize: (tree) => serializeView(tree, ids, "minimal"),
			applyArtifact: applyShipped,
		};
		const patchMessages: ModelMessage[] = [
			{
				role: "user",
				content: editMessage(condition, task.tree, task.instruction),
			},
		];
		for (let round = 1; round <= MAX_ROUNDS; round += 1) {
			const outcome = await call(
				patcherModel,
				condition.systemPrompt,
				patchMessages,
			);
			patchMessages.push({ role: "assistant", content: outcome.text });
			const applied = condition.applyArtifact(outcome.text, task.tree);
			const issueCodes = applied.ok ? [] : applied.issues.map((i) => i.code);
			record.calls.push(toCallLog(outcome, 2, round, issueCodes));
			if (applied.ok) {
				if (round === 1) firstPassValid = true;
				finalTree = applied.node;
				break;
			}
			if (round < MAX_ROUNDS) {
				patchMessages.push({
					role: "user",
					content: `${formatIssuesFeedback(applied.issues, "anchored patch")} The patch was NOT applied — reply with a complete corrected patch against the tree exactly as originally shown.`,
				});
			}
		}
		record.firstPassValid = firstPassValid;
	}

	if (finalTree) {
		const sourceIds = new Set(allIds(task.tree));
		record.success = equalModuloNewIds(task.expected, finalTree, sourceIds);
		record.drift = driftCount(task.tree, task.expected, finalTree);
	}
	record.detail = { finalTree, grounderModel, stage1Ids, stage1Rounds };
	record.rounds = record.calls.length;
	record.totalInputTokens = record.calls.reduce((s, c) => s + c.inputTokens, 0);
	record.totalOutputTokens = record.calls.reduce(
		(s, c) => s + c.outputTokens,
		0,
	);
	record.totalLatencyMs = record.calls.reduce((s, c) => s + c.latencyMs, 0);
	record.passAt1 =
		record.success && record.calls.every((call) => call.round === 1);
	return record;
}
