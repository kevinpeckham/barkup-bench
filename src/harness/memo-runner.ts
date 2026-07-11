/**
 * Study W session runner (docs/BRIEF-W.md): three memo arms over the
 * 36-step callback-W corpus. The agent arms carry the SHIPPED
 * update_session_notes tool, prompt rule, and block rendering
 * (verbatim ports in src/shipped/session-notes.ts); the history arm
 * applies the shipped last-32-message window. Grading is the standard
 * session protocol; memo snapshots and window membership are recorded
 * per step so every fidelity metric is re-computable offline.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import { buildView, referencedIds, VIEW_RULES } from "../conditions/views.js";
import type { WTask } from "../corpus/callbacks-w.js";
import { W_SCHEDULE } from "../corpus/callbacks-w.js";
import { applyEdit } from "../corpus/edits.js";
import { resolveStep } from "../corpus/sessions.js";
import { driftCount } from "../grading/drift.js";
import { equalModuloNewIds } from "../grading/equal.js";
import type { SessionNote } from "../shipped/session-notes.js";
import {
	formatSessionNotesBlock,
	MAX_HISTORY_MESSAGES,
	normalizeSessionNotes,
	SESSION_NOTES_PROMPT_RULE,
	UPDATE_SESSION_NOTES_DESCRIPTION,
} from "../shipped/session-notes.js";
import { allIds, cloneTree } from "../tree.js";
import { WORKED_EXAMPLES_BLOCK } from "./examples.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { findByTypeAndName, MAX_ROUNDS } from "./runner.js";
import { SESSION_RULES, STATELESS_SESSION_RULES } from "./session-runner.js";

export type WArm = "W-oracle" | "W-agent" | "W-agent-history";
export const W_ARMS: WArm[] = ["W-oracle", "W-agent", "W-agent-history"];

/** Max model iterations per round: a memo call plus the patch. */
const MAX_TOOL_STEPS = 4;

const DELIVERY = "Reply with a JSON Patch that makes this change.";

/** The harness-maintained perfect memo (W-oracle): every declarable
 * active before this step, retraction applied, shipped note shapes. */
export function oracleNotes(task: WTask, beforeIndex: number): SessionNote[] {
	const S = W_SCHEDULE;
	const d = task.declarables;
	const notes: SessionNote[] = [];
	if (beforeIndex > S.declareF1) {
		const value = beforeIndex > S.retractF1 ? d.f1Final : d.f1Initial;
		notes.push({ kind: "fact", text: `The campaign codename is "${value}".` });
	}
	if (beforeIndex > S.declareRule) {
		notes.push({
			kind: "rule",
			text: `Every new text atom inserted in this session must have its "textStyle" attribute set to "${d.rule}".`,
		});
	}
	if (beforeIndex > S.declareF2) {
		notes.push({ kind: "fact", text: `The sponsor codename is "${d.f2}".` });
	}
	return notes;
}

/** Steps whose instruction text carries any declarable value — the
 * messages whose window membership matters for the laziness analysis. */
export function carrierSteps(task: WTask): number[] {
	const values = [
		task.declarables.f1Initial,
		task.declarables.f1Final,
		task.declarables.f2,
		task.declarables.rule,
	];
	return task.steps
		.filter((s) => values.some((v) => s.instruction.includes(v)))
		.map((s) => s.index);
}

function viewMessage(view: string, instruction: string): string {
	return `Here is a focused view of the current tree:\n\n${view}\n\nEdit request: ${instruction}\n\n${DELIVERY}`;
}

async function callModel(
	model: string,
	system: string,
	messages: ModelMessage[],
	tools: Record<string, unknown> | undefined,
): Promise<{
	text: string;
	stepMessages: ModelMessage[];
	toolCallCount: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
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
		...(tools ? { tools, stopWhen: stepCountIs(MAX_TOOL_STEPS) } : {}),
		...(maxOut ? { maxOutputTokens: Number(maxOut) } : {}),
	} as Parameters<typeof generateText>[0]);
	// v2 history: per-step messages, never response.messages (Study G).
	const stepMessages = result.steps.flatMap(
		(step) => step.response.messages,
	) as ModelMessage[];
	const toolCallCount = result.steps.reduce(
		(s, step) => s + step.toolCalls.length,
		0,
	);
	if (toolCallCount > 0) {
		const hasToolMessage = stepMessages.some((m) => m.role === "tool");
		if (!hasToolMessage) {
			throw new Error(
				"footgun: tool calls occurred but no tool message in step history",
			);
		}
	}
	return {
		text: result.text,
		stepMessages,
		toolCallCount,
		inputTokens: result.totalUsage.inputTokens ?? 0,
		outputTokens: result.totalUsage.outputTokens ?? 0,
		cacheReadTokens: result.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
		latencyMs: Math.round(performance.now() - started),
	};
}

export async function runWSession(
	task: WTask,
	arm: WArm,
	model: string,
): Promise<TaskRunRecord[]> {
	let current = cloneTree(task.tree);
	const idMap = new Map<string, string>();
	const records: TaskRunRecord[] = [];
	/** Agent-maintained memo (agent arms); persists across steps. */
	let agentNotes: SessionNote[] = [];
	let memoToolCalls = 0;
	/** History-arm ledger: every user/assistant/tool message, in order,
	 * tagged with the step that produced it. */
	const ledger: { stepIndex: number; message: ModelMessage }[] = [];
	const carriers = carrierSteps(task);

	const tools =
		arm === "W-oracle"
			? undefined
			: {
					update_session_notes: tool({
						description: UPDATE_SESSION_NOTES_DESCRIPTION,
						inputSchema: z.object({
							notes: z
								.array(
									z.object({
										kind: z.enum(["fact", "rule", "goal"]),
										text: z
											.string()
											.min(1)
											.describe("One note as a single short sentence."),
									}),
								)
								.describe("The complete replacement memo (max 20 notes)."),
						}),
						execute: async ({ notes }: { notes: unknown }) => {
							agentNotes = normalizeSessionNotes(notes);
							memoToolCalls += 1;
							return { applied: true, notes: agentNotes };
						},
					}),
				};

	for (const step of task.steps) {
		const record: TaskRunRecord = {
			taskId: `${task.id}:s${step.index}`,
			family: "session",
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
		const detail: Record<string, unknown> = {
			stepIndex: step.index,
			editKind: step.kind,
			...(step.callback !== undefined ? { callback: step.callback } : {}),
		};
		record.detail = detail;

		const resolved = resolveStep(step, idMap);
		if ("unresolved" in resolved) {
			detail.blocked = `unresolved-reference:${resolved.unresolved}`;
			records.push(record);
			continue;
		}
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

		const notesForStep =
			arm === "W-oracle" ? oracleNotes(task, step.index) : agentNotes;
		const system =
			conditionF.systemPrompt +
			(arm === "W-agent-history" ? SESSION_RULES : STATELESS_SESSION_RULES) +
			VIEW_RULES +
			(arm === "W-agent-history" ? "" : WORKED_EXAMPLES_BLOCK) +
			(arm === "W-oracle" ? "" : `\n\n${SESSION_NOTES_PROMPT_RULE}`) +
			formatSessionNotesBlock(notesForStep);

		const userMessage: ModelMessage = {
			role: "user",
			content: viewMessage(view, resolved.instruction),
		};

		// Request messages + window membership (history arm).
		let requestBase: ModelMessage[];
		if (arm === "W-agent-history") {
			const tagged = [
				...ledger,
				{ stepIndex: step.index, message: userMessage },
			];
			const window = tagged.slice(-MAX_HISTORY_MESSAGES);
			const present = new Set(window.map((t) => t.stepIndex));
			detail.windowCarriers = carriers.filter((c) => present.has(c));
			detail.truncated = tagged.length > MAX_HISTORY_MESSAGES;
			requestBase = window.map((t) => t.message);
		} else {
			detail.windowCarriers = [];
			requestBase = [userMessage];
		}

		const preToolCalls = memoToolCalls;
		const roundMessages: ModelMessage[] = [...requestBase];
		const newMessages: ModelMessage[] = [userMessage];
		let finalTree: BarkupNode | null = null;
		const calls: CallLog[] = [];
		for (let round = 1; round <= MAX_ROUNDS; round += 1) {
			const outcome = await callModel(model, system, roundMessages, tools);
			const assistantMessages: ModelMessage[] =
				outcome.stepMessages.length > 0
					? outcome.stepMessages
					: [
							{
								role: "assistant",
								content: outcome.text === "" ? "(empty reply)" : outcome.text,
							},
						];
			roundMessages.push(...assistantMessages);
			newMessages.push(...assistantMessages);
			const applied = applyShipped(outcome.text, current);
			calls.push({
				phase: 1,
				round,
				inputTokens: outcome.inputTokens,
				outputTokens: outcome.outputTokens,
				...(outcome.cacheReadTokens > 0
					? { cacheReadTokens: outcome.cacheReadTokens }
					: {}),
				latencyMs: outcome.latencyMs,
				issueCodes: applied.ok ? [] : applied.issues.map((i) => i.code),
			});
			if (applied.ok) {
				if (round === 1) record.firstPassValid = true;
				finalTree = applied.node;
				break;
			}
			record.firstPassValid = record.firstPassValid ?? false;
			if (round < MAX_ROUNDS) {
				const feedback: ModelMessage = {
					role: "user",
					content: `${formatIssuesFeedback(applied.issues, "anchored patch")} The patch was NOT applied — reply with a complete corrected patch against the current tree.`,
				};
				roundMessages.push(feedback);
				newMessages.push(feedback);
			}
		}

		record.calls = calls;
		record.rounds = calls.length;
		record.totalInputTokens = calls.reduce((s, c) => s + c.inputTokens, 0);
		record.totalOutputTokens = calls.reduce((s, c) => s + c.outputTokens, 0);
		record.totalLatencyMs = calls.reduce((s, c) => s + c.latencyMs, 0);

		if (finalTree) {
			record.success = equalModuloNewIds(expected, finalTree, sourceIds);
			record.drift = driftCount(current, expected, finalTree);
			current = finalTree;
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
		record.passAt1 =
			record.success && record.calls.every((call) => call.round === 1);

		if (arm === "W-agent-history") {
			for (const m of newMessages) {
				ledger.push({ stepIndex: step.index, message: m });
			}
		}
		detail.memoAfter = arm === "W-oracle" ? notesForStep : [...agentNotes];
		detail.memoToolCallsThisStep = memoToolCalls - preToolCalls;
		records.push(record);
	}

	const last = records[records.length - 1];
	if (last?.detail) {
		last.detail.endStateMatch = equalModuloNewIds(
			task.expectedFinal,
			current,
			new Set(allIds(task.tree)),
		);
		last.detail.memoToolCallsTotal = memoToolCalls;
	}
	return records;
}
