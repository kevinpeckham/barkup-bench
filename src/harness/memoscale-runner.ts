/**
 * Study AH runner (docs/BRIEF-AH.md). Read-side cells (recall/rule)
 * are single-turn edits under the SHIPPED memo block with the U/AC
 * correction loop; the integrity cells give the agent the shipped
 * prompt rule + update_session_notes tool (Study W's verbatim ports)
 * over a preloaded memo and grade the full-replace against needle
 * presence, raw and post-clamp. Classification is exported pure for
 * unit tests.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import { serializeView, VIEW_RULES } from "../conditions/views.js";
import type { IntegrityTask, MemoScaleTask } from "../corpus/memoscale.js";
import { equalModuloNewIds } from "../grading/equal.js";
import type { SessionNote } from "../shipped/session-notes.js";
import {
	formatSessionNotesBlockV2,
	normalizeSessionNotes,
	SESSION_NOTES_PROMPT_RULE,
	UPDATE_SESSION_NOTES_DESCRIPTION,
} from "../shipped/session-notes.js";
import { allIds } from "../tree.js";
import { callOnce } from "./ask-runner.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { MAX_ROUNDS } from "./runner.js";

const MAX_TOOL_STEPS = 4;

function baseRecord(
	task: { id: string; bucket: TaskRunRecord["bucket"] },
	condition: string,
	model: string,
): TaskRunRecord {
	return {
		taskId: task.id,
		family: "transformation",
		bucket: task.bucket,
		condition,
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

/** Foreign needles present in the final tree (Study Z-style scan). */
export function contaminationScan(
	finalTree: BarkupNode,
	otherNeedles: string[],
): string[] {
	const text = JSON.stringify(finalTree);
	return otherNeedles.filter((needle) => text.includes(needle));
}

export async function runMemoReadTask(
	task: MemoScaleTask,
	model: string,
): Promise<TaskRunRecord> {
	const condition = `AH-${task.kind}-n${task.nLevel}`;
	const system =
		conditionF.systemPrompt +
		VIEW_RULES +
		formatSessionNotesBlockV2(task.notes);
	const view = serializeView(task.tree, task.focusIds, "minimal");
	const messages: ModelMessage[] = [
		{
			role: "user",
			content: `Here is a focused view of the current tree:\n\n${view}\n\nEdit request: ${task.instruction}\n\nReply with the anchored patch.`,
		},
	];

	const record = baseRecord(task, condition, model);
	let finalTree: BarkupNode | null = null;
	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const call = await callOnce(model, system, messages, false);
		messages.push({
			role: "assistant",
			content: call.text === "" ? "(empty reply)" : call.text,
		});
		const applied = applyShipped(call.text, task.tree);
		const issueCodes = applied.ok ? [] : applied.issues.map((i) => i.code);
		record.calls.push({ phase: 1, round, issueCodes, ...call.log });
		if (applied.ok) {
			if (round === 1) record.firstPassValid = true;
			finalTree = applied.node;
			break;
		}
		record.firstPassValid = record.firstPassValid ?? false;
		if (round < MAX_ROUNDS) {
			messages.push({
				role: "user",
				content: `${formatIssuesFeedback(applied.issues, "anchored patch")} The patch was NOT applied — reply with a complete corrected patch against the tree exactly as originally shown.`,
			});
		}
	}

	record.rounds = record.calls.length;
	record.totalInputTokens = record.calls.reduce((s, c) => s + c.inputTokens, 0);
	record.totalOutputTokens = record.calls.reduce(
		(s, c) => s + c.outputTokens,
		0,
	);
	record.totalLatencyMs = record.calls.reduce((s, c) => s + c.latencyMs, 0);

	let contamination: string[] = [];
	if (finalTree) {
		record.success = equalModuloNewIds(
			task.expected,
			finalTree,
			new Set(allIds(task.tree)),
		);
		contamination = contaminationScan(finalTree, task.otherNeedles);
	}
	record.passAt1 =
		record.success && record.calls.every((call) => call.round === 1);
	record.detail = {
		kind: task.kind,
		nLevel: task.nLevel,
		position: task.position,
		outcome: record.success ? "applied" : finalTree ? "wrong" : "invalid",
		contamination,
	};
	return record;
}

export type IntegrityOutcome =
	| "clean-update"
	| "pruned-old"
	| "over-cap-lost-newest"
	| "over-cap-lost-old"
	| "dropped-new"
	| "lost-old"
	| "skipped-tool";

/** Classify the agent's final memo state (BRIEF-AH taxonomy). */
export function classifyIntegrity(
	task: IntegrityTask,
	toolCalled: boolean,
	rawNotes: SessionNote[] | null,
): { outcome: IntegrityOutcome; oldPreserved: number; lost: string[] } {
	if (!toolCalled || rawNotes === null) {
		return { outcome: "skipped-tool", oldPreserved: 0, lost: [] };
	}
	const rawText = JSON.stringify(rawNotes);
	const newPresentRaw = rawText.includes(task.newNeedle);
	const oldPresentRaw = task.oldNeedles.filter((n) => rawText.includes(n));
	const clamped = normalizeSessionNotes(rawNotes);
	const clampedText = JSON.stringify(clamped);
	const newPresent = clampedText.includes(task.newNeedle);
	const oldPresent = task.oldNeedles.filter((n) => clampedText.includes(n));
	const lost = [
		...task.oldNeedles.filter((n) => !clampedText.includes(n)),
		...(newPresent ? [] : [task.newNeedle]),
	];

	if (!newPresentRaw) {
		return { outcome: "dropped-new", oldPreserved: oldPresent.length, lost };
	}
	if (newPresent && oldPresent.length === task.oldNeedles.length) {
		return { outcome: "clean-update", oldPreserved: oldPresent.length, lost };
	}
	if (rawNotes.length > 20) {
		// The agent sent an over-cap list; the shipped clamp decided.
		return {
			outcome: newPresent ? "over-cap-lost-old" : "over-cap-lost-newest",
			oldPreserved: oldPresent.length,
			lost,
		};
	}
	if (
		task.kLevel === 20 &&
		newPresent &&
		oldPresent.length === task.oldNeedles.length - 1
	) {
		return { outcome: "pruned-old", oldPreserved: oldPresent.length, lost };
	}
	return { outcome: "lost-old", oldPreserved: oldPresent.length, lost };
}

export async function runMemoIntegrityTask(
	task: IntegrityTask,
	model: string,
): Promise<TaskRunRecord> {
	const system =
		conditionF.systemPrompt +
		VIEW_RULES +
		`\n\n${SESSION_NOTES_PROMPT_RULE}` +
		formatSessionNotesBlockV2(task.notes);
	const view = serializeView(task.tree, task.focusIds, "minimal");
	const messages: ModelMessage[] = [
		{
			role: "user",
			content: `Here is a focused view of the current tree:\n\n${view}\n\n${task.message}\n\nReply with the anchored patch.`,
		},
	];

	const record = baseRecord(task, `AH-integrity-k${task.kLevel}`, model);
	let rawNotes: SessionNote[] | null = null;
	let toolCalls = 0;
	const tools = {
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
				rawNotes = Array.isArray(notes) ? (notes as SessionNote[]) : [];
				toolCalls += 1;
				return { applied: true, notes: normalizeSessionNotes(notes) };
			},
		}),
	};

	const started = performance.now();
	const maxOut = process.env.BENCH_MAX_OUTPUT_TOKENS;
	const result = await generateText({
		model,
		system,
		messages,
		temperature: 0,
		maxRetries: 4,
		tools,
		stopWhen: stepCountIs(MAX_TOOL_STEPS),
		...(maxOut ? { maxOutputTokens: Number(maxOut) } : {}),
	} as Parameters<typeof generateText>[0]);
	const usage = result.totalUsage;
	const call: CallLog = {
		phase: 1,
		round: 1,
		issueCodes: [],
		inputTokens: usage.inputTokens ?? 0,
		outputTokens: usage.outputTokens ?? 0,
		latencyMs: Math.round(performance.now() - started),
	};
	record.calls.push(call);
	record.rounds = 1;
	record.totalInputTokens = call.inputTokens;
	record.totalOutputTokens = call.outputTokens;
	record.totalLatencyMs = call.latencyMs;

	// The requested edit, graded report-only (no correction loop).
	const applied = applyShipped(result.text, task.tree);
	const editApplied =
		applied.ok &&
		equalModuloNewIds(task.expected, applied.node, new Set(allIds(task.tree)));

	const verdict = classifyIntegrity(task, toolCalls > 0, rawNotes);
	// success = the memo survived intact (the AH-H3 criterion). At the
	// cap edge (k=20) a deliberate prune also counts as intact-minus-one
	// by design; the gate only reads k=10/k=19 cells.
	record.success =
		verdict.outcome === "clean-update" || verdict.outcome === "pruned-old";
	record.detail = {
		kLevel: task.kLevel,
		outcome: verdict.outcome,
		oldPreserved: verdict.oldPreserved,
		lost: verdict.lost,
		toolCalls,
		rawLength: rawNotes === null ? null : (rawNotes as SessionNote[]).length,
		editApplied,
		replyHead: result.text.slice(0, 200),
	};
	return record;
}
