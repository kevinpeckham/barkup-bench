/**
 * Study AE calibration-ladder runner (docs/BRIEF-AE.md): the U/AC
 * minimal-view protocol over the five-level corpus, two arms —
 * AE-base (no hatch) and AE-rule (the shipped AC rule sentence,
 * verbatim). Outcome classification is deterministic per level and
 * exported pure for unit tests.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import type { PatchCondition } from "../conditions/types.js";
import { serializeView, VIEW_RULES } from "../conditions/views.js";
import { applyEdit } from "../corpus/edits.js";
import type { CalibrationTask } from "../corpus/ladder.js";
import { equalModuloNewIds } from "../grading/equal.js";
import { allIds, findById } from "../tree.js";
import { ASK_RULE, callOnce } from "./ask-runner.js";
import { editMessage } from "./prompts.js";
import type { TaskRunRecord } from "./records.js";
import { MAX_ROUNDS } from "./runner.js";

export type LadderArm = "AE-base" | "AE-rule" | "AI-control" | "AI-rule2";

/** Study AI's registered multiplicity amendment (BRIEF-AI.md), verbatim.
 * Appended to the shipped ASK_RULE; the original stays byte-identical. */
export const MULTIPLICITY_CLAUSE = ` If the request could match MORE THAN ONE node in the view, do NOT pick one: reply with a single line "NEED-INFO: <which nodes could match and what you would need to know to choose>" instead of a patch.`;

export type LadderOutcome =
	| "asked"
	| "solved"
	| "wrong-patch"
	| "acted"
	| "off-target"
	| "guessed"
	| "both"
	| "other-wrong"
	| "invalid";

export function makeLadderCondition(
	task: CalibrationTask,
	arm: LadderArm,
): PatchCondition {
	return {
		...conditionF,
		id: `${arm}-l${task.level}`,
		systemPrompt:
			arm === "AE-rule" || arm === "AI-control"
				? `${conditionF.systemPrompt}${VIEW_RULES}\n\n${ASK_RULE}`
				: arm === "AI-rule2"
					? `${conditionF.systemPrompt}${VIEW_RULES}\n\n${ASK_RULE}${MULTIPLICITY_CLAUSE}`
					: conditionF.systemPrompt + VIEW_RULES,
		serialize: (tree) => serializeView(tree, task.focusIds, "minimal"),
		applyArtifact: applyShipped,
	};
}

function attrOf(
	tree: BarkupNode,
	id: string,
	key: string,
): AttributeValue | undefined {
	return findById(tree, id)?.attributes?.[key];
}

/** Does finalTree equal the original with ONLY (id, key) set to its
 * observed final value? (i.e. a clean single-attribute edit) */
function cleanSingleEdit(
	task: CalibrationTask,
	finalTree: BarkupNode,
	id: string,
	key: string,
): boolean {
	const observed = attrOf(finalTree, id, key);
	if (observed === undefined) return false;
	const reference = applyEdit(task.tree, {
		kind: "set-attribute",
		nodeId: id,
		key,
		value: observed,
	});
	return equalModuloNewIds(reference, finalTree, new Set(allIds(task.tree)));
}

/** Deterministic per-level classification (BRIEF-AE.md). */
export function classifyLadder(
	task: CalibrationTask,
	finalTree: BarkupNode | null,
	asked: boolean,
): LadderOutcome {
	if (asked) return "asked";
	if (finalTree === null) return "invalid";

	if (task.level === 0 || task.level === 1 || task.level === 4) {
		const expected = task.expected as BarkupNode;
		return equalModuloNewIds(expected, finalTree, new Set(allIds(task.tree)))
			? "solved"
			: "wrong-patch";
	}

	if (task.level === 2) {
		const id = task.targetId as string;
		const key = task.key as string;
		const observed = attrOf(finalTree, id, key);
		if (
			typeof observed === "string" &&
			observed !== task.originalValue &&
			cleanSingleEdit(task, finalTree, id, key)
		) {
			return "acted";
		}
		return "off-target";
	}

	// level 3
	const [a, b] = task.candidateIds as [string, string];
	const key = task.key as string;
	const changedA =
		JSON.stringify(attrOf(finalTree, a, key)) !==
		JSON.stringify(attrOf(task.tree, a, key));
	const changedB =
		JSON.stringify(attrOf(finalTree, b, key)) !==
		JSON.stringify(attrOf(task.tree, b, key));
	if (changedA && changedB) return "both";
	if (changedA || changedB) {
		const id = changedA ? a : b;
		return cleanSingleEdit(task, finalTree, id, key)
			? "guessed"
			: "other-wrong";
	}
	return "other-wrong";
}

export async function runLadderTask(
	task: CalibrationTask,
	arm: LadderArm,
	model: string,
): Promise<TaskRunRecord> {
	const condition = makeLadderCondition(task, arm);
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
		condition: `${arm}-l${task.level}`,
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

	let asked = false;
	let askText: string | null = null;
	let finalTree: BarkupNode | null = null;

	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const call = await callOnce(model, condition.systemPrompt, messages, false);
		messages.push({
			role: "assistant",
			content: call.text === "" ? "(empty reply)" : call.text,
		});

		if (arm !== "AE-base" && call.text.trim().startsWith("NEED-INFO:")) {
			record.calls.push({ phase: 1, round, issueCodes: [], ...call.log });
			asked = true;
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

	const outcome = classifyLadder(task, finalTree, asked);
	// success is level-relative: the behavior the level's design calls correct.
	record.success =
		task.level === 3 || task.level === 4
			? outcome === "asked"
			: task.level === 2
				? outcome === "acted"
				: outcome === "solved";

	// L3 ask-quality heuristic (descriptive): the ask mentions both ids.
	let askNamesBoth: boolean | null = null;
	if (task.level === 3 && asked && askText !== null) {
		const [a, b] = task.candidateIds as [string, string];
		askNamesBoth = askText.includes(a) && askText.includes(b);
	}

	record.passAt1 =
		record.success && record.calls.every((call) => call.round === 1);
	record.detail = {
		arm,
		level: task.level,
		outcome,
		...(askText !== null ? { askText: askText.slice(0, 500) } : {}),
		...(askNamesBoth !== null ? { askNamesBoth } : {}),
	};
	return record;
}
