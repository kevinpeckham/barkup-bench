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
 *
 * Study AL (docs/BRIEF-AL.md): the single experimental variable is
 * the prompt rule. "AL-fence" is AK-eviction verbatim (same handler,
 * same pipeline) with one sentence appended to
 * SESSION_NOTES_PROMPT_RULE — frozen in the brief and pinned by unit
 * test. AL's control arm IS "AK-eviction", run contemporaneously.
 */
export type MemoIntegrityArm =
	| "AH"
	| "AK-control"
	| "AK-eviction"
	| "AL-fence"
	| "AM-control"
	| "AM-invite";

/** The BRIEF-AL fence sentence, verbatim. Do not edit without a new brief. */
export const AL_FENCE_SENTENCE =
	"Never drop or trim an existing note to make room — even if the memo looks full, send every existing note plus your change; the app decides evictions and will notify you if one occurs.";

/**
 * Study AM (docs/BRIEF-AM.md): the single experimental variable is the
 * notice string returned to the agent when an eviction occurs.
 * "AM-control" is the shipped notice verbatim; "AM-invite" appends the
 * sentence below (frozen in the brief, pinned by unit test). The
 * eviction pipeline, prompt rule, and everything else are identical.
 */
export const AM_INVITE_SENTENCE =
	"You may call update_session_notes again with the memo consolidated — the same facts, rules, and goals rewritten into fewer, denser notes so everything fits. Nothing needs to be lost.";

/**
 * The notice an arm returns after an eviction (AM's one variable).
 * NOTE: the invite SHIPPED in v3.215.0, so the ported shipped notice now
 * already contains the sentence — "AM-control" is a historical arm (the
 * pre-ship notice era), and re-running AM-invite against the current port
 * would double-append. Any re-measurement is a new pre-registration.
 */
export function noticeForArm(
	arm: MemoIntegrityArm,
	notice: string | undefined,
): string | undefined {
	if (notice === undefined) return undefined;
	return arm === "AM-invite" ? `${notice} ${AM_INVITE_SENTENCE}` : notice;
}

/** Arms that run the v3.213.0 eviction pipeline in the tool handler. */
function armRunsEviction(arm: MemoIntegrityArm): boolean {
	return (
		arm === "AK-eviction" ||
		arm === "AL-fence" ||
		arm === "AM-control" ||
		arm === "AM-invite"
	);
}

/** The session-notes prompt rule an arm runs under (AL's one variable). */
export function promptRuleForArm(arm: MemoIntegrityArm): string {
	return arm === "AL-fence"
		? `${SESSION_NOTES_PROMPT_RULE} ${AL_FENCE_SENTENCE}`
		: SESSION_NOTES_PROMPT_RULE;
}

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
	const applied = armRunsEviction(arm)
		? applySessionNotesUpdate(rawNotes)
		: null;
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
		armRunsEviction(arm) && overCap
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

export type ConsolidationOutcome =
	| "no-notice"
	| "lossless-recovery"
	| "eviction-accepted"
	| "degraded";

export interface ConsolidationVerdict {
	/** Some call's pipeline evicted — the notice was delivered. */
	noticeDelivered: boolean;
	outcome: ConsolidationOutcome;
	/** Needles (old + new) present in the FINAL persisted memo. */
	needlesPresent: number;
	/** Every surviving goal needle sits in a goal-kind note. */
	goalsInGoalNotes: boolean;
	/** Evictions triggered by calls after the first notice (re-add churn). */
	extraEvictions: number;
	/** Surviving OLD needles residing in a note of their original kind. */
	survivingInOriginalKind: number;
	/** Surviving OLD needles total (kind-fidelity denominator, H4). */
	survivingOld: number;
	finalNoteCount: number;
}

/**
 * Pure Study AM classifier (BRIEF-AM grading), unit-tested. Replays
 * shipped last-write-wins semantics over the per-call raw lists: the
 * final call's list, run through the eviction pipeline, is the
 * persisted memo. Outcomes per the brief: lossless-recovery (all K+1
 * needles present, every goal needle in a goal note), eviction-accepted
 * (≥ K needles, goals safe — the AK guarantee held), degraded (fewer
 * than K needles or a goal needle outside a goal note), no-notice (no
 * call evicted — the prune pathway; excluded from elicitation
 * denominators).
 */
export function evaluateConsolidation(
	task: IntegrityTask,
	rawLists: SessionNote[][],
): ConsolidationVerdict {
	let noticeDelivered = false;
	let extraEvictions = 0;
	for (const raw of rawLists) {
		const applied = applySessionNotesUpdate(raw);
		if ((applied.result.evicted?.length ?? 0) > 0) {
			if (noticeDelivered) extraEvictions += 1;
			noticeDelivered = true;
		}
	}
	const finalRaw = rawLists[rawLists.length - 1] ?? [];
	const finalNotes = applySessionNotesUpdate(finalRaw).notes;
	const finalText = JSON.stringify(finalNotes);
	const allNeedles = [...task.oldNeedles, task.newNeedle];
	const needlesPresent = allNeedles.filter((needle) =>
		finalText.includes(needle),
	).length;
	const goalNeedles = goalNeedlesOf(task);
	const goalNotesText = JSON.stringify(
		finalNotes.filter((note) => note.kind === "goal"),
	);
	const goalsInGoalNotes = goalNeedles.every(
		(needle) => !finalText.includes(needle) || goalNotesText.includes(needle),
	);
	const goalsAllPresentInGoalNotes = goalNeedles.every((needle) =>
		goalNotesText.includes(needle),
	);
	let survivingOld = 0;
	let survivingInOriginalKind = 0;
	task.oldNeedles.forEach((needle, i) => {
		if (!finalText.includes(needle)) return;
		survivingOld += 1;
		const kind = (task.notes[i] as SessionNote).kind;
		const kindText = JSON.stringify(
			finalNotes.filter((note) => note.kind === kind),
		);
		if (kindText.includes(needle)) survivingInOriginalKind += 1;
	});
	let outcome: ConsolidationOutcome;
	if (!noticeDelivered) {
		outcome = "no-notice";
	} else if (
		needlesPresent === allNeedles.length &&
		goalsAllPresentInGoalNotes
	) {
		outcome = "lossless-recovery";
	} else if (needlesPresent >= task.kLevel && goalsAllPresentInGoalNotes) {
		outcome = "eviction-accepted";
	} else {
		outcome = "degraded";
	}
	return {
		noticeDelivered,
		outcome,
		needlesPresent,
		goalsInGoalNotes,
		extraEvictions,
		survivingInOriginalKind,
		survivingOld,
		finalNoteCount: finalNotes.length,
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
		`\n\n${promptRuleForArm(arm)}` +
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
	const rawLists: SessionNote[][] = [];
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
				rawLists.push((rawNotes as SessionNote[]).map((note) => ({ ...note })));
				if (armRunsEviction(arm)) {
					const applied = applySessionNotesUpdate(notes);
					evictedTexts.push(
						...(applied.result.evicted ?? []).map((note) => note.text),
					);
					const notice = noticeForArm(arm, applied.result.notice);
					return notice === undefined
						? applied.result
						: { ...applied.result, notice };
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
		...(arm === "AM-control" || arm === "AM-invite"
			? { consolidation: evaluateConsolidation(task, rawLists) }
			: {}),
	};
	return record;
}
