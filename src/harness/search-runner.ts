/**
 * Study N search runner (docs/BRIEF-N.md): N-search gives the model the
 * same minimal root view as LG-nav and one tool, find_nodes, with the
 * same 16-step budget; the final text is the anchored patch, applied to
 * the FULL tree by the shipped package, with the standard ≤3 correction
 * rounds. History accumulation uses the corrected (v2) per-step
 * flattening.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { applyShipped } from "../conditions/f2.js";
import { expandNodeView } from "../conditions/grounded.js";
import {
	findNodesResult,
	NO_MATCHES_MESSAGE,
	SEARCH_SYSTEM_PROMPT,
} from "../conditions/grounded-n.js";
import { formatIssuesFeedback } from "../conditions/shared.js";
import type { TransformationTask } from "../corpus/tasks.js";
import { driftCount } from "../grading/drift.js";
import { equalModuloNewIds } from "../grading/equal.js";
import { allIds } from "../tree.js";
import { MAX_NAV_STEPS } from "./nav-runner.js";
import type { CallLog, TaskRunRecord } from "./records.js";
import { MAX_ROUNDS } from "./runner.js";

export function searchUserMessage(
	rootView: string,
	instruction: string,
): string {
	return `Here is a minimal view of the tree's root:\n\n${rootView}\n\nEdit request: ${instruction}\n\nSearch with find_nodes as needed, then reply with the anchored patch.`;
}

export async function runSearchTask(
	task: TransformationTask,
	model: string,
	conditionId = "N-search",
): Promise<TaskRunRecord> {
	const record: TaskRunRecord = {
		taskId: task.id,
		family: task.family,
		bucket: task.bucket,
		condition: conditionId,
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
	let searchCalls = 0;
	let noMatchCount = 0;
	const queries: string[] = [];
	const tools = {
		find_nodes: tool({
			description:
				"Search the tree by content: returns the 5 best-matching nodes, shown in place with their ancestors.",
			inputSchema: z.object({ query: z.string() }),
			execute: async ({ query }: { query: string }) => {
				searchCalls += 1;
				queries.push(query);
				const result = findNodesResult(tree, query);
				if (result === NO_MATCHES_MESSAGE) noMatchCount += 1;
				return result;
			},
		}),
	};

	const rootView = expandNodeView(tree, tree.id as string) as string;
	const messages: ModelMessage[] = [
		{ role: "user", content: searchUserMessage(rootView, task.instruction) },
	];

	let firstPassValid = false;
	let finalTree: BarkupNode | null = null;
	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const started = performance.now();
		const maxOut = process.env.BENCH_MAX_OUTPUT_TOKENS;
		const result = await generateText({
			model,
			system: SEARCH_SYSTEM_PROMPT,
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
				content: `${formatIssuesFeedback(applied.issues, "anchored patch")} The patch was NOT applied — you may search further, then reply with a complete corrected patch.`,
			});
		}
	}

	record.firstPassValid = firstPassValid;
	record.toolErrorCount = noMatchCount;
	if (finalTree) {
		const sourceIds = new Set(allIds(task.tree));
		record.success = equalModuloNewIds(task.expected, finalTree, sourceIds);
		record.drift = driftCount(task.tree, task.expected, finalTree);
	}
	record.detail = { finalTree, searchCalls, noMatchCount, queries };
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
