/**
 * Study AC runner (docs/BRIEF-AC.md): Study U's view conditions with
 * two registered escape hatches. An ask ends the cell; invalid
 * patches keep the ≤3-round correction loop; solve grading is Study
 * U's (equal-modulo-new-ids vs the expected tree).
 *
 * Outcomes (deterministic): asked | solved | wrong-patch | invalid.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { generateText, tool } from "ai";
import { z } from "zod";
import { makeUView } from "../conditions/dependent.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import type { PatchCondition } from "../conditions/types.js";
import type { DependentTask } from "../corpus/dependent.js";
import { equalModuloNewIds } from "../grading/equal.js";
import { allIds } from "../tree.js";
import { editMessage } from "./prompts.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { MAX_ROUNDS } from "./runner.js";

export type AskArm = "AC-base" | "AC-rule" | "AC-tool";
export type AskView = "view1" | "view2";
export type AskOutcome = "asked" | "solved" | "wrong-patch" | "invalid";

/** The registered hatch texts (BRIEF-AC.md), verbatim. */
export const ASK_RULE = `If the request requires a value or a node that is not visible in the view and not stated in the request, do NOT guess: reply with a single line "NEED-INFO: <what is missing and where you would need to read it>" instead of a patch.`;

export const ASK_TOOL_DESCRIPTION = `Ask the user for information you need and cannot see. Use this INSTEAD of guessing when the request requires a value or a node that is not visible in the view and not stated in the request. Calling this ends your turn.`;

export function makeAskCondition(
	task: DependentTask,
	view: AskView,
	arm: AskArm,
): PatchCondition {
	const base = makeUView(task, view === "view1" ? "U-view1" : "U-view2");
	return {
		...base,
		id: `${arm}-${view}`,
		systemPrompt:
			arm === "AC-rule"
				? `${base.systemPrompt}\n\n${ASK_RULE}`
				: base.systemPrompt,
	};
}

export interface AskCall {
	text: string;
	askText: string | null;
	log: Omit<CallLog, "phase" | "round" | "issueCodes">;
}

export async function callOnce(
	model: string,
	system: string,
	messages: ModelMessage[],
	withTool: boolean,
): Promise<AskCall> {
	const started = performance.now();
	const maxOut = process.env.BENCH_MAX_OUTPUT_TOKENS;
	let askText: string | null = null;
	const result = await generateText({
		model,
		system,
		messages,
		temperature: 0,
		maxRetries: 4,
		...(maxOut ? { maxOutputTokens: Number(maxOut) } : {}),
		...(withTool
			? {
					tools: {
						ask_user: tool({
							description: ASK_TOOL_DESCRIPTION,
							inputSchema: z.object({ question: z.string() }),
							execute: async ({ question }: { question: string }) => {
								askText = question;
								return { status: "turn ended; the user will reply" };
							},
						}),
					},
				}
			: {}),
	});
	const usage = result.totalUsage;
	const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;
	const reasoning = usage.outputTokenDetails?.reasoningTokens ?? 0;
	return {
		text: result.text,
		askText,
		log: {
			inputTokens: usage.inputTokens ?? 0,
			outputTokens: usage.outputTokens ?? 0,
			...(cacheRead > 0 ? { cacheReadTokens: cacheRead } : {}),
			...(reasoning > 0 ? { reasoningTokens: reasoning } : {}),
			latencyMs: Math.round(performance.now() - started),
		},
	};
}

export async function runAskTask(
	task: DependentTask,
	view: AskView,
	arm: AskArm,
	model: string,
): Promise<TaskRunRecord> {
	const condition = makeAskCondition(task, view, arm);
	const messages: ModelMessage[] = [
		{
			role: "user",
			content: editMessage(condition, task.tree, task.instruction),
		},
	];

	const record: TaskRunRecord = {
		taskId: task.id,
		family: task.family,
		bucket: task.bucket,
		condition: condition.id,
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

	let outcome: AskOutcome = "invalid";
	let askText: string | null = null;
	let finalTree: BarkupNode | null = null;

	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const call = await callOnce(
			model,
			condition.systemPrompt,
			messages,
			arm === "AC-tool",
		);
		messages.push({
			role: "assistant",
			content: call.text === "" ? "(empty reply)" : call.text,
		});

		// A tool ask or a NEED-INFO sentinel ends the cell.
		if (call.askText !== null) {
			record.calls.push({ phase: 1, round, issueCodes: [], ...call.log });
			outcome = "asked";
			askText = call.askText;
			break;
		}
		if (arm === "AC-rule" && call.text.trim().startsWith("NEED-INFO:")) {
			record.calls.push({ phase: 1, round, issueCodes: [], ...call.log });
			outcome = "asked";
			askText = call.text.trim();
			break;
		}

		const applied = condition.applyArtifact(call.text, task.tree);
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
				content: `${formatIssuesFeedback(applied.issues, condition.artifactName)} The patch was NOT applied — reply with a complete corrected patch against the tree exactly as originally shown.`,
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

	if (outcome !== "asked" && finalTree) {
		const solved = equalModuloNewIds(
			task.expected,
			finalTree,
			new Set(allIds(task.tree)),
		);
		outcome = solved ? "solved" : "wrong-patch";
	}
	record.success = outcome === "solved";

	// Registered ask-quality heuristic (descriptive): the ask names the
	// source — its id, or for structure-reads the reference's value.
	let askNamesSource: boolean | null = null;
	if (outcome === "asked" && askText !== null) {
		const refValue =
			task.sourceRef !== undefined && task.sourceRef.kind === "attr"
				? String(task.sourceRef.value)
				: null;
		askNamesSource =
			askText.includes(task.sourceId) ||
			(refValue !== null && askText.includes(refValue));
	}

	record.passAt1 =
		record.success && record.calls.every((call) => call.round === 1);
	record.detail = {
		arm,
		view,
		depKind: task.depKind,
		outcome,
		...(askText !== null ? { askText: askText.slice(0, 500) } : {}),
		...(askNamesSource !== null ? { askNamesSource } : {}),
	};
	return record;
}

// ---- Study AE resume loop (docs/BRIEF-AE.md) ----

export type ResumeOutcome =
	| "resumed-solved"
	| "resumed-wrong"
	| "re-asked"
	| "never-asked-solved"
	| "never-asked-wrong"
	| "invalid";

/** The registered answer template (BRIEF-AE.md), verbatim. */
export function resumeAnswer(task: DependentTask): string {
	const description =
		task.depKind === "value"
			? `The ${(task.edit as { key?: string }).key ?? "value"} of ${task.sourceId}`
			: `The name of ${task.sourceRef ? refTextForResume(task.sourceRef) : task.sourceId}`;
	return `${description} is exactly: "${task.needle}". Now apply the requested edit; reply with the patch only.`;
}

function refTextForResume(
	ref: NonNullable<DependentTask["sourceRef"]>,
): string {
	if (ref.kind === "attr") {
		return `the ${ref.type} whose ${ref.key} is ${JSON.stringify(ref.value)}`;
	}
	return "the node you asked about";
}

/**
 * AE-resume: the unsolvable view1 cell under the shipped rule hatch;
 * when the model asks, the harness answers as the user (registered
 * template) and the cell continues in the same conversation — the
 * view is deliberately NOT re-attached. Post-answer patches keep the
 * ≤3-round correction loop; a second ask is terminal ("re-asked").
 */
export async function runAskResumeTask(
	task: DependentTask,
	model: string,
): Promise<TaskRunRecord> {
	const condition = makeAskCondition(task, "view1", "AC-rule");
	const messages: ModelMessage[] = [
		{
			role: "user",
			content: editMessage(condition, task.tree, task.instruction),
		},
	];

	const record: TaskRunRecord = {
		taskId: task.id,
		family: task.family,
		bucket: task.bucket,
		condition: "AE-resume",
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

	let outcome: ResumeOutcome = "invalid";
	let askText: string | null = null;
	let answered = false;
	let finalTree: BarkupNode | null = null;
	let phase = 1;
	let round = 0;

	while (round < MAX_ROUNDS * 2) {
		round += 1;
		const call = await callOnce(model, condition.systemPrompt, messages, false);
		messages.push({
			role: "assistant",
			content: call.text === "" ? "(empty reply)" : call.text,
		});

		if (call.text.trim().startsWith("NEED-INFO:")) {
			record.calls.push({ phase, round, issueCodes: [], ...call.log });
			if (!answered) {
				askText = call.text.trim();
				answered = true;
				phase = 2;
				messages.push({ role: "user", content: resumeAnswer(task) });
				continue;
			}
			outcome = "re-asked";
			break;
		}

		const applied = condition.applyArtifact(call.text, task.tree);
		const issueCodes = applied.ok ? [] : applied.issues.map((i) => i.code);
		record.calls.push({ phase, round, issueCodes, ...call.log });
		if (applied.ok) {
			finalTree = applied.node;
			break;
		}
		const phaseRounds = record.calls.filter((c) => c.phase === phase).length;
		if (phaseRounds >= MAX_ROUNDS) break;
		messages.push({
			role: "user",
			content: `${formatIssuesFeedback(applied.issues, condition.artifactName)} The patch was NOT applied — reply with a complete corrected patch against the tree exactly as originally shown.`,
		});
	}

	record.rounds = record.calls.length;
	record.totalInputTokens = record.calls.reduce((s, c) => s + c.inputTokens, 0);
	record.totalOutputTokens = record.calls.reduce(
		(s, c) => s + c.outputTokens,
		0,
	);
	record.totalLatencyMs = record.calls.reduce((s, c) => s + c.latencyMs, 0);

	if (outcome !== "re-asked" && finalTree) {
		const solved = equalModuloNewIds(
			task.expected,
			finalTree,
			new Set(allIds(task.tree)),
		);
		if (answered) outcome = solved ? "resumed-solved" : "resumed-wrong";
		else outcome = solved ? "never-asked-solved" : "never-asked-wrong";
	}
	record.success = outcome === "resumed-solved";
	record.detail = {
		arm: "AE-resume",
		view: "view1",
		depKind: task.depKind,
		outcome,
		asked: answered,
		...(askText !== null ? { askText: askText.slice(0, 500) } : {}),
	};
	return record;
}
