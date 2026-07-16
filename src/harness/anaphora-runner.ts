/**
 * Study X session runner (docs/BRIEF-X.md): four carrier arms over the
 * anaphora corpus. Ordinary steps get the standard oracle minimal
 * view; anaphora steps get a ROOT SKELETON view so target, key, and
 * value must come from the carrier under test. Undo's expected value
 * is re-derived from the model's own trajectory (runner snapshot of
 * the predecessor target's attribute).
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { generateText } from "ai";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import { buildView, referencedIds, VIEW_RULES } from "../conditions/views.js";
import type { AnaphoraStep, XTask } from "../corpus/anaphora.js";
import type { Edit } from "../corpus/edits.js";
import {
	applyEdit,
	describeEdit,
	formatValue,
	nodeRef,
} from "../corpus/edits.js";
import { resolveStep } from "../corpus/sessions.js";
import { driftCount } from "../grading/drift.js";
import { equalModuloNewIds } from "../grading/equal.js";
import { allIds, cloneTree, findById } from "../tree.js";
import { ASK_RULE } from "./ask-runner.js";
import { WORKED_EXAMPLES_BLOCK } from "./examples.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { findByTypeAndName, MAX_ROUNDS } from "./runner.js";
import {
	SESSION_RULES,
	STATELESS_SESSION_RULES,
	type StepExchange,
	windowMessages,
} from "./session-runner.js";

export type XArm =
	| "X-history"
	| "X-window2"
	| "X-lastedit"
	| "X-stateless"
	// Study AG (docs/BRIEF-AG.md): the shipped ASK_RULE over X's arms.
	| "AG-stateless-hatch"
	| "AG-echo-hatch";
export const X_ARMS: XArm[] = [
	"X-history",
	"X-window2",
	"X-lastedit",
	"X-stateless",
];

/** Arms carrying the shipped NEED-INFO hatch (BRIEF-AG.md). */
export function isHatchArm(arm: XArm): boolean {
	return arm === "AG-stateless-hatch" || arm === "AG-echo-hatch";
}

/** Arms carrying the last-edit echo note. */
export function isEchoArm(arm: XArm): boolean {
	return arm === "X-lastedit" || arm === "AG-echo-hatch";
}

const DELIVERY = "Reply with a JSON Patch that makes this change.";

const HISTORY_SYSTEM = conditionF.systemPrompt + SESSION_RULES + VIEW_RULES;
const STATELESS_SYSTEM =
	conditionF.systemPrompt +
	STATELESS_SESSION_RULES +
	VIEW_RULES +
	WORKED_EXAMPLES_BLOCK;

/** BRIEF-X last-edit note, format registered verbatim. */
export function lastEditNote(
	preTree: BarkupNode,
	edit: Edit | null,
	applied: boolean,
): string {
	if (!applied || edit === null) {
		return "\n\nPrevious edit request could not be applied; the tree is unchanged.";
	}
	if (edit.kind === "set-attribute") {
		const node = findById(preTree, edit.nodeId);
		const old = node?.attributes?.[edit.key];
		const from = old === undefined ? "(unset)" : formatValue(old);
		return `\n\nPrevious edit (applied by the app): set "${edit.key}" from ${from} to ${formatValue(edit.value)} on ${nodeRef(preTree, edit.nodeId)}.`;
	}
	return `\n\nPrevious edit (applied by the app): ${describeEdit(preTree, edit)}`;
}

function viewMessage(view: string, instruction: string): string {
	return `Here is a focused view of the current tree:\n\n${view}\n\nEdit request: ${instruction}\n\n${DELIVERY}`;
}

async function callPatch(
	model: string,
	system: string,
	messages: ModelMessage[],
): Promise<{
	text: string;
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
		...(maxOut ? { maxOutputTokens: Number(maxOut) } : {}),
	} as Parameters<typeof generateText>[0]);
	return {
		text: result.text,
		inputTokens: result.totalUsage.inputTokens ?? 0,
		outputTokens: result.totalUsage.outputTokens ?? 0,
		cacheReadTokens: result.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
		latencyMs: Math.round(performance.now() - started),
	};
}

export async function runXSession(
	task: XTask,
	arm: XArm,
	model: string,
): Promise<TaskRunRecord[]> {
	let current = cloneTree(task.tree);
	const idMap = new Map<string, string>();
	const records: TaskRunRecord[] = [];
	const historyMessages: ModelMessage[] = [];
	const exchanges: StepExchange[] = [];
	/** Snapshot of the predecessor target's attribute (undo semantics). */
	let predSnapshot: {
		targetId: string;
		key: string;
		oldValue: AttributeValue | undefined;
	} | null = null;
	/** The previous step's resolved edit + pre-tree for the last-edit note. */
	let lastNote = "";

	for (const step of task.steps as AnaphoraStep[]) {
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
			...(step.anaphora !== undefined ? { anaphora: step.anaphora } : {}),
		};
		record.detail = detail;

		const resolved = resolveStep(step, idMap);
		if ("unresolved" in resolved) {
			detail.blocked = `unresolved-reference:${resolved.unresolved}`;
			records.push(record);
			continue;
		}
		// Undo: expected value = the model's own pre-predecessor value.
		let effectiveEdit = resolved.edit;
		if (step.anaphora === "undo" && effectiveEdit.kind === "set-attribute") {
			if (predSnapshot && predSnapshot.targetId === effectiveEdit.nodeId) {
				if (predSnapshot.oldValue === undefined) {
					// Prior value was unset in the model's tree; expected keeps
					// the corpus value (generator guaranteed presence, so this
					// only occurs after earlier divergence).
					detail.undoPriorUnset = true;
				} else {
					effectiveEdit = { ...effectiveEdit, value: predSnapshot.oldValue };
				}
			}
			detail.undoExpectedValue = (
				effectiveEdit as { value: AttributeValue }
			).value;
		}

		let expected: BarkupNode;
		try {
			expected = applyEdit(current, effectiveEdit);
		} catch (error) {
			detail.blocked = `cascade-inapplicable:${
				error instanceof Error ? error.message : String(error)
			}`;
			records.push(record);
			continue;
		}
		const sourceIds = new Set(allIds(current));

		// View: skeleton for anaphora steps, oracle minimal otherwise.
		let view: string;
		try {
			const focus = step.anaphora
				? [current.id as string]
				: referencedIds(effectiveEdit);
			view = `${JSON.stringify(buildView(current, focus, "minimal"), null, 2)}\n`;
		} catch (error) {
			detail.blocked = `view-focus-missing:${
				error instanceof Error ? error.message : String(error)
			}`;
			records.push(record);
			continue;
		}

		let content = viewMessage(view, resolved.instruction);
		if (isEchoArm(arm) && step.index > 1) content += lastNote;

		// Snapshot for a following undo step (predecessors are set-attribute).
		if (resolved.edit.kind === "set-attribute") {
			const node = findById(current, resolved.edit.nodeId);
			predSnapshot = {
				targetId: resolved.edit.nodeId,
				key: resolved.edit.key,
				oldValue: node?.attributes?.[resolved.edit.key],
			};
		} else {
			predSnapshot = null;
		}
		const preTree = current;

		const stepMessages: ModelMessage[] =
			arm === "X-history"
				? historyMessages
				: arm === "X-window2"
					? [...windowMessages(exchanges, 2)]
					: [];
		const userMessage: ModelMessage = { role: "user", content };
		stepMessages.push(userMessage);
		const system =
			arm === "X-history" || arm === "X-window2"
				? arm === "X-history"
					? HISTORY_SYSTEM
					: conditionF.systemPrompt + SESSION_RULES + VIEW_RULES
				: isHatchArm(arm)
					? `${STATELESS_SYSTEM}\n\n${ASK_RULE}`
					: STATELESS_SYSTEM;

		let finalTree: BarkupNode | null = null;
		let lastAssistant = "";
		const calls: CallLog[] = [];
		for (let round = 1; round <= MAX_ROUNDS; round += 1) {
			const outcome = await callPatch(model, system, stepMessages);
			lastAssistant = outcome.text === "" ? "(empty reply)" : outcome.text;
			stepMessages.push({ role: "assistant", content: lastAssistant });
			if (isHatchArm(arm) && outcome.text.trim().startsWith("NEED-INFO:")) {
				calls.push({
					phase: 1,
					round,
					inputTokens: outcome.inputTokens,
					outputTokens: outcome.outputTokens,
					...(outcome.cacheReadTokens > 0
						? { cacheReadTokens: outcome.cacheReadTokens }
						: {}),
					latencyMs: outcome.latencyMs,
					issueCodes: [],
				});
				detail.asked = true;
				detail.askText = outcome.text.trim().slice(0, 500);
				break;
			}
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
				stepMessages.push({
					role: "user",
					content: `${formatIssuesFeedback(applied.issues, "anchored patch")} The patch was NOT applied — reply with a complete corrected patch against the current tree.`,
				});
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
			// Silent-guess anatomy for anaphora failures.
			if (step.anaphora && !record.success) detail.validButWrong = true;
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

		lastNote = lastEditNote(
			preTree,
			finalTree ? resolved.edit : null,
			!!finalTree,
		);
		if (arm === "X-window2") {
			exchanges.push({ user: content, assistant: lastAssistant });
		}
		records.push(record);
	}

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
