/**
 * Study V edit harness (docs/BRIEF-V.md): one anchored-patch rewrite
 * per (task, arm), against the arm's registered view and instruction,
 * with Layer-1 deterministic grading. `success` on the record means
 * MECHANICALLY VALID (Layer 1) — quality is judged separately.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { generateText } from "ai";
import { conditionF } from "../conditions/f.js";
import { applyShipped } from "../conditions/f2.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import { serializeView, VIEW_RULES } from "../conditions/views.js";
import { nodeRef } from "../corpus/edits.js";
import type { RewriteTask } from "../corpus/rewrite.js";
import { REWRITE_MAXLENGTH, thesisCoverage } from "../corpus/rewrite.js";
import { equalExact } from "../grading/equal.js";
import { cloneTree, findById, walkTree } from "../tree.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { MAX_ROUNDS } from "./runner.js";

export type RewriteArm =
	| "V-instr"
	| "V-doc-view1"
	| "V-doc-view2"
	| "V-conv-memo"
	| "V-conv-nomemo"
	// Study AF (docs/BRIEF-AF.md): the restate-before-rewrite arms.
	| "AF-control"
	| "AF-memo-restate"
	| "AF-view-restate";

export const REWRITE_ARMS: RewriteArm[] = [
	"V-instr",
	"V-doc-view1",
	"V-doc-view2",
	"V-conv-memo",
	"V-conv-nomemo",
];

export const AF_ARMS: RewriteArm[] = [
	"AF-control",
	"AF-memo-restate",
	"AF-view-restate",
];

/** The registered AF restate clause (BRIEF-AF.md), verbatim. */
export const RESTATE_CLAUSE = `Begin your reply with a single line starting "GOAL:" that restates the goal of this rewrite in your own words. Then give the patch in a fenced code block.`;

/** Deterministic compliance detection (BRIEF-AF.md): /^GOAL:/m. */
export function goalCompliance(firstReply: string): {
	compliant: boolean;
	line: string | null;
} {
	const match = firstReply.match(/^GOAL:.*$/m);
	return { compliant: match !== null, line: match?.[0] ?? null };
}

const SYSTEM = conditionF.systemPrompt + VIEW_RULES;

/** BRIEF-V instruction templates, verbatim. */
export function armInstruction(task: RewriteTask, arm: RewriteArm): string {
	const ref = nodeRef(task.tree, task.targetId);
	switch (arm) {
		case "V-instr":
			return `Rewrite the "content" attribute of ${ref} so the paragraph focuses on our central thesis: "${task.thesis}". Keep it to 2 or 3 sentences.`;
		case "V-doc-view1":
		case "V-doc-view2":
			return `Rewrite the "content" attribute of ${ref} so the paragraph focuses on our central thesis, as stated in the mission section of this page. Keep it to 2 or 3 sentences.`;
		case "V-conv-memo":
		case "V-conv-nomemo":
			return `Rewrite the "content" attribute of ${ref} so the paragraph focuses on the central thesis we discussed. Keep it to 2 or 3 sentences.`;
		case "AF-control":
			return armInstruction(task, "V-instr");
		case "AF-memo-restate":
			return `${armInstruction(task, "V-conv-memo")} ${RESTATE_CLAUSE}`;
		case "AF-view-restate":
			return `${armInstruction(task, "V-doc-view2")} ${RESTATE_CLAUSE}`;
	}
}

/** BRIEF-V: the registered T-notes memo block for V-conv-memo. */
export function armMemo(task: RewriteTask): string {
	return `\n\nSession notes (maintained by the application):\n- The central thesis is "${task.thesis}".`;
}

export function armView(task: RewriteTask, arm: RewriteArm): string {
	const ids =
		arm === "V-doc-view2" || arm === "AF-view-restate"
			? [task.targetId, task.missionId]
			: [task.targetId];
	return serializeView(task.tree, ids, "minimal");
}

/** Layer 1: ONLY the target's content changed, and legally. */
export function layerOneProblems(
	task: RewriteTask,
	finalTree: BarkupNode,
): string[] {
	const problems: string[] = [];
	const target = findById(finalTree, task.targetId);
	const rewrite = target?.attributes?.content;
	if (typeof rewrite !== "string" || rewrite.trim() === "") {
		problems.push("no rewritten content on target");
		return problems;
	}
	if (rewrite.length > REWRITE_MAXLENGTH) problems.push("exceeds maxLength");
	if (rewrite.trim() === task.thesis.trim()) {
		problems.push("verbatim thesis copy");
	}
	// Everything except the target's content must be untouched.
	const a = cloneTree(task.tree);
	const b = cloneTree(finalTree);
	const scrub = (tree: BarkupNode) => {
		walkTree(tree, ({ node }) => {
			if (node.id === task.targetId && node.attributes) {
				node.attributes = { ...node.attributes, content: "" };
			}
		});
	};
	scrub(a);
	scrub(b);
	// Structural equality, not JSON.stringify: applyShipped canonicalizes
	// node key order (protocol note — this false-positived every cell on
	// the first run before any verdict was scored).
	if (!equalExact(a, b)) {
		problems.push("changed nodes other than the target content");
	}
	return problems;
}

export async function runRewriteTask(
	task: RewriteTask,
	arm: RewriteArm,
	model: string,
): Promise<TaskRunRecord> {
	const record: TaskRunRecord = {
		taskId: task.id,
		family: task.family,
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

	let content = `Here is a focused view of the current tree:\n\n${armView(task, arm)}\n\nEdit request: ${armInstruction(task, arm)}\n\nReply with a JSON Patch that makes this change.`;
	if (arm === "V-conv-memo" || arm === "AF-memo-restate") {
		content += armMemo(task);
	}
	const messages: ModelMessage[] = [{ role: "user", content }];

	let finalTree: BarkupNode | null = null;
	let firstReply: string | null = null;
	const calls: CallLog[] = [];
	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const started = performance.now();
		const maxOut = process.env.BENCH_MAX_OUTPUT_TOKENS;
		const result = await generateText({
			model,
			system: SYSTEM,
			messages,
			temperature: 0,
			maxRetries: 4,
			...(maxOut ? { maxOutputTokens: Number(maxOut) } : {}),
		} as Parameters<typeof generateText>[0]);
		messages.push({
			role: "assistant",
			content: result.text === "" ? "(empty reply)" : result.text,
		});
		if (firstReply === null) firstReply = result.text;
		const applied = applyShipped(result.text, task.tree);
		const cacheRead = result.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0;
		calls.push({
			phase: 1,
			round,
			inputTokens: result.totalUsage.inputTokens ?? 0,
			outputTokens: result.totalUsage.outputTokens ?? 0,
			...(cacheRead > 0 ? { cacheReadTokens: cacheRead } : {}),
			latencyMs: Math.round(performance.now() - started),
			issueCodes: applied.ok ? [] : applied.issues.map((i) => i.code),
		});
		if (applied.ok) {
			if (round === 1) record.firstPassValid = true;
			finalTree = applied.node;
			break;
		}
		record.firstPassValid = record.firstPassValid ?? false;
		if (round < MAX_ROUNDS) {
			messages.push({
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

	const detail: Record<string, unknown> = { arm };
	if (arm.startsWith("AF-") && arm !== "AF-control" && firstReply !== null) {
		const compliance = goalCompliance(firstReply);
		detail.goalCompliant = compliance.compliant;
		if (compliance.line !== null) {
			detail.goalLine = compliance.line.slice(0, 300);
		}
	}
	if (finalTree) {
		const problems = layerOneProblems(task, finalTree);
		const rewrite = findById(finalTree, task.targetId)?.attributes?.content;
		detail.layerOne = problems;
		if (typeof rewrite === "string") {
			detail.rewrite = rewrite;
			detail.proxyBefore = thesisCoverage(task, task.original);
			detail.proxyAfter = thesisCoverage(task, rewrite);
		}
		record.success = problems.length === 0;
		record.passAt1 = record.success && calls.length === 1;
	} else {
		detail.layerOne = ["no valid artifact"];
	}
	record.detail = detail;
	return record;
}
