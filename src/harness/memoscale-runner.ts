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
import type { SessionNote, SessionNoteKind } from "../shipped/session-notes.js";
import {
	applySessionNotesUpdate,
	formatSessionNotesBlockV2,
	MAX_SESSION_NOTES,
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

/**
 * Study AK (docs/BRIEF-AK.md): the single experimental variable is
 * what the tool handler does with the raw argument. "AH" and
 * "AK-control" share the registered clamp; "AK-eviction" runs the
 * v3.213.0 goal-preserving pipeline and echoes its result (with any
 * eviction notice) back to the agent.
 */
export type MemoIntegrityArm = "AH" | "AK-control" | "AK-eviction";

/** Goal-note needles, via the corpus needle↔note alignment. */
export function goalNeedlesOf(task: IntegrityTask): string[] {
	return task.notes.flatMap((note, i) =>
		note.kind === "goal" ? [task.oldNeedles[i] as string] : [],
	);
}

export interface PipelineVerdict {
	/** Raw argument exceeded the cap (the clamp/eviction pathway). */
	overCap: boolean;
	/** New needle AND every goal needle survive post-pipeline. */
	goalSafe: boolean;
	/** Over-cap + goal-safe + only non-goal notes evicted (eviction arm). */
	designedEviction: boolean | null;
	evictedKinds: SessionNoteKind[];
	/** Kinds of old notes missing from the RAW list (client-side prune). */
	prunedKinds: SessionNoteKind[];
	/** Needles missing post-pipeline (old + new). */
	lostPost: string[];
}

/** Pure per-arm pipeline evaluation (BRIEF-AK grading), unit-tested. */
export function evaluatePipeline(
	task: IntegrityTask,
	arm: MemoIntegrityArm,
	rawNotes: SessionNote[] | null,
): PipelineVerdict {
	if (rawNotes === null) {
		return {
			overCap: false,
			goalSafe: false,
			designedEviction: null,
			evictedKinds: [],
			prunedKinds: [],
			lostPost: [...task.oldNeedles, task.newNeedle],
		};
	}
	const applied =
		arm === "AK-eviction" ? applySessionNotesUpdate(rawNotes) : null;
	const postNotes = applied ? applied.notes : normalizeSessionNotes(rawNotes);
	const evictedKinds = (applied?.result.evicted ?? []).map((note) => note.kind);
	const rawText = JSON.stringify(rawNotes);
	const postText = JSON.stringify(postNotes);
	const overCap = rawNotes.length > MAX_SESSION_NOTES;
	const goals = goalNeedlesOf(task);
	const goalSafe =
		postText.includes(task.newNeedle) &&
		goals.every((needle) => postText.includes(needle));
	const prunedKinds = task.oldNeedles.flatMap((needle, i) =>
		rawText.includes(needle) ? [] : [(task.notes[i] as SessionNote).kind],
	);
	const lostPost = [
		...task.oldNeedles.filter((needle) => !postText.includes(needle)),
		...(postText.includes(task.newNeedle) ? [] : [task.newNeedle]),
	];
	const designedEviction =
		arm === "AK-eviction" && overCap
			? goalSafe && evictedKinds.every((kind) => kind !== "goal")
			: null;
	return {
		overCap,
		goalSafe,
		designedEviction,
		evictedKinds,
		prunedKinds,
		lostPost,
	};
}

export async function runMemoIntegrityTask(
	task: IntegrityTask,
	model: string,
	arm: MemoIntegrityArm = "AH",
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

	const condition =
		arm === "AH" ? `AH-integrity-k${task.kLevel}` : `${arm}-k${task.kLevel}`;
	const record = baseRecord(task, condition, model);
	let rawNotes: SessionNote[] | null = null;
	let toolCalls = 0;
	const rawLengths: number[] = [];
	const evictedTexts: string[] = [];
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
				rawLengths.push(rawNotes.length);
				if (arm === "AK-eviction") {
					const applied = applySessionNotesUpdate(notes);
					evictedTexts.push(
						...(applied.result.evicted ?? []).map((note) => note.text),
					);
					return applied.result;
				}
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
	const pipeline = evaluatePipeline(task, arm, rawNotes);
	// success = the memo survived intact (the AH-H3 criterion). At the
	// cap edge (k=20) a deliberate prune also counts as intact-minus-one
	// by design; the gate only reads k=10/k=19 cells. AK arms grade the
	// cap edge on goal safety instead (BRIEF-AK).
	record.success =
		arm !== "AH" && task.kLevel === 20
			? pipeline.goalSafe
			: verdict.outcome === "clean-update" || verdict.outcome === "pruned-old";
	// A model reacting to the eviction notice by re-sending an evicted
	// note (final raw contains an earlier call's evicted text).
	const readdedEvicted =
		toolCalls > 1 && rawNotes !== null && evictedTexts.length > 0
			? evictedTexts.some((text) => JSON.stringify(rawNotes).includes(text))
			: null;
	record.detail = {
		arm,
		kLevel: task.kLevel,
		outcome: verdict.outcome,
		oldPreserved: verdict.oldPreserved,
		lost: verdict.lost,
		toolCalls,
		rawLength: rawNotes === null ? null : (rawNotes as SessionNote[]).length,
		rawLengths,
		overCap: pipeline.overCap,
		goalSafe: pipeline.goalSafe,
		designedEviction: pipeline.designedEviction,
		evictedKinds: pipeline.evictedKinds,
		prunedKinds: pipeline.prunedKinds,
		lostPost: pipeline.lostPost,
		readdedEvicted,
		editApplied,
		replyHead: result.text.slice(0, 200),
	};
	return record;
}
