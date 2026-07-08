/**
 * Study K session runner (docs/BRIEF-K.md): one conversation per
 * session, 12 sequential edits against an evolving tree, under four
 * serialization policies. Patches apply to the model's CURRENT tree;
 * per-step grading follows the reference-family pattern (expected is
 * computed from the model's own pre-step state, so a step is judged on
 * its own edit regardless of earlier divergence). The session state
 * advances with whatever the model actually produced.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { generateText } from "ai";
import { conditionA } from "../conditions/a.js";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import {
	formatIssuesFeedback,
	serializeJsonTree,
} from "../conditions/shared.js";
import { buildView, referencedIds, VIEW_RULES } from "../conditions/views.js";
import { applyEdit } from "../corpus/edits.js";
import type { SessionStep, SessionTask } from "../corpus/sessions.js";
import { resolveStep } from "../corpus/sessions.js";
import { driftCount } from "../grading/drift.js";
import { equalModuloNewIds } from "../grading/equal.js";
import { allIds, cloneTree } from "../tree.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { findByTypeAndName, MAX_ROUNDS, rewriteLoop } from "./runner.js";

export type SessionPolicy =
	| "once"
	| "view"
	| "refresh5"
	| "rewrite"
	// Study M (BRIEF-M.md): view-per-turn with restricted history.
	| "stateless"
	| "window2";

export const POLICY_CONDITION: Record<SessionPolicy, string> = {
	once: "K-once",
	view: "K-view",
	refresh5: "K-refresh5",
	rewrite: "K-rewrite",
	stateless: "M-stateless",
	window2: "M-window",
};

/** Pre-registered session preamble appended to the patch arms' system prompt. */
export const SESSION_RULES = `
Session rules:
- Edit requests arrive one at a time; each patch applies to the tree as it stands after all previous patches have been applied.`;

/** Pre-registered M-stateless variant (BRIEF-M.md): no prior conversation exists to refer to. */
export const STATELESS_SESSION_RULES = `
Session rules:
- The view shows the tree as it stands right now, after all previous edits have already been applied. Edit it from this state.`;

const PATCH_SYSTEM = conditionF.systemPrompt + SESSION_RULES;
const VIEW_SYSTEM = conditionF.systemPrompt + SESSION_RULES + VIEW_RULES;
const STATELESS_SYSTEM =
	conditionF.systemPrompt + STATELESS_SESSION_RULES + VIEW_RULES;

/** One completed step, condensed for the sliding window (corrections dropped). */
export interface StepExchange {
	user: string;
	assistant: string;
}

/** M-window: the last `keep` completed exchanges as messages. */
export function windowMessages(
	exchanges: StepExchange[],
	keep: number,
): ModelMessage[] {
	return exchanges.slice(-keep).flatMap((e) => [
		{ role: "user" as const, content: e.user },
		{ role: "assistant" as const, content: e.assistant },
	]);
}

const DELIVERY = "Reply with a JSON Patch that makes this change.";

function fullTreeMessage(tree: BarkupNode, instruction: string): string {
	return `Here is the current tree:\n\n${serializeJsonTree(tree)}\n\nEdit request: ${instruction}\n\n${DELIVERY}`;
}
function refreshMessage(tree: BarkupNode, instruction: string): string {
	return `Here is the current tree after the edits so far:\n\n${serializeJsonTree(tree)}\n\nNext edit request: ${instruction}\n\n${DELIVERY}`;
}
function followUpPatchMessage(instruction: string): string {
	return `Next edit request: ${instruction}\n\n${DELIVERY}`;
}
function viewMessage(
	view: string,
	instruction: string,
	first: boolean,
): string {
	const lead = first ? "Edit request" : "Next edit request";
	return `Here is a focused view of the current tree:\n\n${view}\n\n${lead}: ${instruction}\n\n${DELIVERY}`;
}

/** callModel is private to runner.ts; sessions use a local patch-call twin. */
async function callPatchModel(
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

interface StepLoopResult {
	tree: BarkupNode | null;
	calls: CallLog[];
	firstPassValid: boolean;
}

/** Per-step patch loop: fresh patch against the CURRENT tree each round. */
async function sessionPatchLoop(
	model: string,
	system: string,
	messages: ModelMessage[],
	base: BarkupNode,
	phase: number,
): Promise<StepLoopResult> {
	const calls: CallLog[] = [];
	let firstPassValid = false;
	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const outcome = await callPatchModel(model, system, messages);
		messages.push({ role: "assistant", content: outcome.text });
		const applied = applyShipped(outcome.text, base);
		const issueCodes = applied.ok ? [] : applied.issues.map((i) => i.code);
		calls.push({
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
		});
		if (applied.ok) {
			if (round === 1) firstPassValid = true;
			return { tree: applied.node, calls, firstPassValid };
		}
		if (round < MAX_ROUNDS) {
			messages.push({
				role: "user",
				content: `${formatIssuesFeedback(applied.issues, "anchored patch")} The patch was NOT applied — reply with a complete corrected patch against the current tree.`,
			});
		}
	}
	return { tree: null, calls, firstPassValid };
}

function stepRecord(
	task: SessionTask,
	step: SessionStep,
	policy: SessionPolicy,
	model: string,
): TaskRunRecord {
	return {
		taskId: `${task.id}:s${step.index}`,
		family: "session",
		bucket: task.bucket,
		condition: POLICY_CONDITION[policy],
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
}

function accumulate(record: TaskRunRecord, calls: CallLog[]): void {
	record.calls.push(...calls);
	record.rounds = record.calls.length;
	record.totalInputTokens = record.calls.reduce((s, c) => s + c.inputTokens, 0);
	record.totalOutputTokens = record.calls.reduce(
		(s, c) => s + c.outputTokens,
		0,
	);
	record.totalLatencyMs = record.calls.reduce((s, c) => s + c.latencyMs, 0);
	record.passAt1 =
		record.success && record.calls.every((call) => call.round === 1);
}

/** Run one full session under one policy; returns one record per step. */
export async function runSession(
	task: SessionTask,
	policy: SessionPolicy,
	model: string,
): Promise<TaskRunRecord[]> {
	let current = cloneTree(task.tree);
	const idMap = new Map<string, string>();
	const messages: ModelMessage[] = [];
	/** Study M window policy: condensed completed exchanges. */
	const exchanges: StepExchange[] = [];
	const records: TaskRunRecord[] = [];

	for (const step of task.steps) {
		const record = stepRecord(task, step, policy, model);
		const detail: Record<string, unknown> = {
			stepIndex: step.index,
			editKind: step.kind,
			referenceBack: step.referenceBack,
		};
		record.detail = detail;

		const resolved = resolveStep(step, idMap);
		if ("unresolved" in resolved) {
			detail.blocked = `unresolved-reference:${resolved.unresolved}`;
			records.push(record);
			continue;
		}

		// Per-step ground truth from the model's own pre-step state.
		let expected: BarkupNode;
		try {
			expected = applyEdit(current, resolved.edit);
		} catch (error) {
			detail.blocked = `cascade-inapplicable:${
				error instanceof Error ? error.message : String(error)
			}`;
			records.push(record);
			continue;
		}
		const sourceIds = new Set(allIds(current));

		let loop: StepLoopResult;
		if (policy === "rewrite") {
			messages.push({
				role: "user",
				content:
					step.index === 1
						? `Here is the current tree:\n\n${conditionA.serialize(current)}\n\nEdit request: ${resolved.instruction}\n\nReply with the complete updated markup.`
						: `Next edit request: ${resolved.instruction}\n\nReply with the complete updated markup.`,
			});
			let rewrite: Awaited<ReturnType<typeof rewriteLoop>>;
			try {
				rewrite = await rewriteLoop(conditionA, model, messages, step.index);
			} catch (error) {
				// Mechanical ceiling (e.g. context-window exhaustion from
				// accumulated whole-tree rewrites): record this step and the
				// rest of the session as mechanical failures instead of
				// dropping the session — the ceiling IS a finding (BRIEF-K).
				const message = error instanceof Error ? error.message : String(error);
				record.error = message;
				detail.blocked = "mechanical:context-ceiling";
				records.push(record);
				for (const rest of task.steps.filter((s) => s.index > step.index)) {
					const restRecord = stepRecord(task, rest, policy, model);
					restRecord.detail = {
						stepIndex: rest.index,
						editKind: rest.kind,
						referenceBack: rest.referenceBack,
						blocked: "mechanical:context-ceiling",
					};
					records.push(restRecord);
				}
				break;
			}
			loop = {
				tree: rewrite.tree,
				calls: rewrite.calls,
				firstPassValid: rewrite.firstPassValid,
			};
		} else if (policy === "stateless" || policy === "window2") {
			// Study M: fresh view every turn; history absent or windowed.
			let view: string;
			try {
				view = `${JSON.stringify(buildView(current, referencedIds(resolved.edit), "minimal"), null, 2)}\n`;
			} catch (error) {
				detail.blocked = `view-focus-missing:${
					error instanceof Error ? error.message : String(error)
				}`;
				records.push(record);
				continue;
			}
			const first = policy === "stateless" || exchanges.length === 0;
			const content = viewMessage(view, resolved.instruction, first);
			const stepMessages: ModelMessage[] =
				policy === "stateless" ? [] : windowMessages(exchanges, 2);
			stepMessages.push({ role: "user", content });
			loop = await sessionPatchLoop(
				model,
				policy === "stateless" ? STATELESS_SYSTEM : VIEW_SYSTEM,
				stepMessages,
				current,
				step.index,
			);
			if (policy === "window2") {
				const lastAssistant = [...stepMessages]
					.reverse()
					.find((m) => m.role === "assistant");
				if (lastAssistant) {
					exchanges.push({
						user: content,
						assistant: String(lastAssistant.content),
					});
				}
			}
		} else {
			let content: string;
			if (policy === "view") {
				let view: string;
				try {
					view = `${JSON.stringify(buildView(current, referencedIds(resolved.edit), "minimal"), null, 2)}\n`;
				} catch (error) {
					detail.blocked = `view-focus-missing:${
						error instanceof Error ? error.message : String(error)
					}`;
					records.push(record);
					continue;
				}
				content = viewMessage(view, resolved.instruction, step.index === 1);
			} else if (
				step.index === 1 ||
				(policy === "refresh5" && (step.index - 1) % 5 === 0)
			) {
				content =
					step.index === 1
						? fullTreeMessage(current, resolved.instruction)
						: refreshMessage(current, resolved.instruction);
			} else {
				content = followUpPatchMessage(resolved.instruction);
			}
			messages.push({ role: "user", content });
			loop = await sessionPatchLoop(
				model,
				policy === "view" ? VIEW_SYSTEM : PATCH_SYSTEM,
				messages,
				current,
				step.index,
			);
		}

		record.firstPassValid = loop.firstPassValid;
		if (loop.tree) {
			record.success = equalModuloNewIds(expected, loop.tree, sourceIds);
			record.drift = driftCount(current, expected, loop.tree);
			current = loop.tree;
			if (step.created) {
				const created = findByTypeAndName(
					current,
					step.created.type,
					step.created.name,
				);
				if (created?.id !== undefined) {
					idMap.set(step.created.placeholder, created.id as string);
				} else {
					record.idRefFailure = true;
				}
			}
		}
		// A step with no valid artifact leaves the tree unchanged (atomic).
		accumulate(record, loop.calls);
		records.push(record);
	}

	// Exploratory end-state grade on the last record.
	const last = records[records.length - 1];
	if (last?.detail) {
		last.detail.endStateMatch = equalModuloNewIds(
			task.expectedFinal,
			current,
			new Set(allIds(task.tree)),
		);
	}
	return records;
}
