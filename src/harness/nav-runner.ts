/**
 * Study L navigation runner (docs/BRIEF-L.md): LG-nav gives the model
 * a minimal root view and one tool, expand_node, with up to 16 tool
 * steps per call; the final text is the anchored patch, applied to the
 * FULL tree by the shipped package, with the standard ≤3 correction
 * rounds. History accumulation uses the corrected (v2) per-step
 * flattening, naturally.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { applyShipped } from "../conditions/f2.js";
import { expandNodeView, NAV_SYSTEM_PROMPT } from "../conditions/grounded.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import type { TransformationTask } from "../corpus/tasks.js";
import { driftCount } from "../grading/drift.js";
import { equalModuloNewIds } from "../grading/equal.js";
import { allIds } from "../tree.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { MAX_ROUNDS } from "./runner.js";

/** Pre-registered navigation budget per model call (BRIEF-L.md). */
export const MAX_NAV_STEPS = 16;

export function navUserMessage(rootView: string, instruction: string): string {
	return `Here is a minimal view of the tree's root:\n\n${rootView}\n\nEdit request: ${instruction}\n\nExplore with expand_node as needed, then reply with the anchored patch.`;
}

export async function runNavTask(
	task: TransformationTask,
	model: string,
): Promise<TaskRunRecord> {
	const record: TaskRunRecord = {
		taskId: task.id,
		family: task.family,
		bucket: task.bucket,
		condition: "LG-nav",
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
	const tree = task.tree;
	let expandCalls = 0;
	let expandErrors = 0;
	const tools = {
		expand_node: tool({
			description:
				"Reveal a collapsed node: returns the node in full with its children collapsed.",
			inputSchema: z.object({ id: z.string() }),
			execute: async ({ id }: { id: string }) => {
				expandCalls += 1;
				const view = expandNodeView(tree, id);
				if (view === null) {
					expandErrors += 1;
					return `Error: no node with id "${id}" exists in the tree.`;
				}
				return view;
			},
		}),
	};

	const rootView = expandNodeView(tree, tree.id as string) as string;
	const messages: ModelMessage[] = [
		{ role: "user", content: navUserMessage(rootView, task.instruction) },
	];

	let firstPassValid = false;
	let finalTree: BarkupNode | null = null;
	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const started = performance.now();
		const maxOut = process.env.BENCH_MAX_OUTPUT_TOKENS;
		const result = await generateText({
			model,
			system: NAV_SYSTEM_PROMPT,
			messages,
			temperature: 0,
			maxRetries: 4,
			tools,
			stopWhen: stepCountIs(MAX_NAV_STEPS),
			...(maxOut ? { maxOutputTokens: Number(maxOut) } : {}),
		} as Parameters<typeof generateText>[0]);
		// v2 history: per-step messages, never response.messages.
		messages.push(
			...(result.steps.flatMap(
				(step) => step.response.messages,
			) as ModelMessage[]),
		);
		const applied = applyShipped(result.text, tree);
		const issueCodes = applied.ok ? [] : applied.issues.map((i) => i.code);
		record.calls.push({
			phase: 1,
			round,
			inputTokens: result.totalUsage.inputTokens ?? 0,
			outputTokens: result.totalUsage.outputTokens ?? 0,
			...((result.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0) > 0
				? {
						cacheReadTokens:
							result.totalUsage.inputTokenDetails?.cacheReadTokens,
					}
				: {}),
			latencyMs: Math.round(performance.now() - started),
			steps: result.steps.length,
			issueCodes,
		} as CallLog);
		if (applied.ok) {
			if (round === 1) firstPassValid = true;
			finalTree = applied.node;
			break;
		}
		if (round < MAX_ROUNDS) {
			messages.push({
				role: "user",
				content: `${formatIssuesFeedback(applied.issues, "anchored patch")} The patch was NOT applied — you may expand further, then reply with a complete corrected patch.`,
			});
		}
	}

	record.firstPassValid = firstPassValid;
	record.toolErrorCount = expandErrors;
	if (finalTree) {
		const sourceIds = new Set(allIds(task.tree));
		record.success = equalModuloNewIds(task.expected, finalTree, sourceIds);
		record.drift = driftCount(task.tree, task.expected, finalTree);
	}
	record.detail = { finalTree, expandCalls, expandErrors };
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
