/**
 * The benchmark runner: gateway calls, the pre-registered correction loop
 * (1 initial attempt + up to 3 feedback rounds; failures return the
 * condition's structured issues verbatim), JSONL logging, resumable by
 * (task, condition, model).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage, ToolSet } from "ai";
import { generateText, stepCountIs, streamText } from "ai";
import { formatIssuesFeedback } from "../conditions/shared.js";
import type {
	Condition,
	PatchCondition,
	RewriteCondition,
	ToolsCondition,
} from "../conditions/types.js";
import type { Edit } from "../corpus/edits.js";
import { applyEdit } from "../corpus/edits.js";
import type {
	ConstructionTask,
	PilotTask,
	ReadingTask,
	ReferenceTask,
	TransformationTask,
} from "../corpus/tasks.js";
import { driftCount } from "../grading/drift.js";
import {
	equalExact,
	equalModuloAllIds,
	equalModuloNewIds,
} from "../grading/equal.js";
import { answersMatch } from "../grading/reading.js";
import { allIds, cloneTree, walkTree } from "../tree.js";
import {
	constructionMessage,
	editMessage,
	followUpMessage,
	readingMessage,
} from "./prompts.js";
import type { CallLog, TaskRunRecord } from "./records.js";

/** Pre-registered: 1 initial attempt + up to 3 correction rounds. */
export const MAX_ROUNDS = 4;
/** Cap on tool-calling steps per round (tools arms). */
export const MAX_TOOL_STEPS = 48;
/** Flag-gated transcript capture (BENCH_LOG_TRANSCRIPTS=1) for failure audits. */
function transcriptsEnabled(): boolean {
	return process.env.BENCH_LOG_TRANSCRIPTS === "1";
}

/**
 * Compact, JSONL-friendly view of a conversation: text is truncated,
 * tool calls/results are summarized structurally so failure modes can
 * be classified deterministically from the record.
 */
export function compactTranscript(
	messages: ModelMessage[],
): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [];
	for (const message of messages) {
		if (typeof message.content === "string") {
			out.push({ role: message.role, text: message.content.slice(0, 600) });
			continue;
		}
		const parts: Record<string, unknown>[] = [];
		for (const part of message.content as Array<Record<string, unknown>>) {
			if (part.type === "text") {
				parts.push({ type: "text", text: String(part.text).slice(0, 600) });
			} else if (part.type === "tool-call") {
				parts.push({
					type: "tool-call",
					tool: part.toolName,
					input: JSON.stringify(part.input ?? part.args ?? {}).slice(0, 400),
				});
			} else if (part.type === "tool-result") {
				parts.push({
					type: "tool-result",
					tool: part.toolName,
					output: JSON.stringify(part.output ?? part.result ?? {}).slice(
						0,
						300,
					),
				});
			} else {
				parts.push({ type: String(part.type) });
			}
		}
		out.push({ role: message.role, parts });
	}
	return out;
}

export interface RunOptions {
	model: string;
	regime: string;
	conditions: Condition[];
	tasks: PilotTask[];
	outPath: string;
	concurrency?: number;
	log?: (line: string) => void;
}

interface CallOutcome {
	text: string;
	responseMessages: ModelMessage[];
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	reasoningTokens: number;
	latencyMs: number;
	steps: number;
}

async function callModel(
	model: string,
	system: string,
	messages: ModelMessage[],
	tools?: ToolSet,
): Promise<CallOutcome> {
	const started = performance.now();
	// Study H (BRIEF-H.md) raises the output budget for large-tree
	// rewrites; default (unset) preserves the main-study protocol.
	const maxOut = process.env.BENCH_MAX_OUTPUT_TOKENS;
	const params = {
		model,
		system,
		messages,
		temperature: 0,
		maxRetries: 4,
		...(maxOut ? { maxOutputTokens: Number(maxOut) } : {}),
		...(tools !== undefined
			? { tools, stopWhen: stepCountIs(MAX_TOOL_STEPS) }
			: {}),
	} as const;
	// BENCH_STREAM=1: stream the response to keep long generations from
	// exceeding gateway HTTP limits (multi-minute large-tree rewrites).
	// Same request semantics; transport only. Used by Study H re-runs.
	if (process.env.BENCH_STREAM === "1") {
		const stream = streamText(params as Parameters<typeof streamText>[0]);
		const [text, steps, totalUsage] = await Promise.all([
			stream.text,
			stream.steps,
			stream.totalUsage,
		]);
		return {
			text,
			responseMessages: steps.flatMap(
				(step) => step.response.messages,
			) as ModelMessage[],
			inputTokens: totalUsage.inputTokens ?? 0,
			outputTokens: totalUsage.outputTokens ?? 0,
			cacheReadTokens: totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
			reasoningTokens: totalUsage.outputTokenDetails?.reasoningTokens ?? 0,
			latencyMs: Math.round(performance.now() - started),
			steps: steps.length,
		};
	}
	const result = await generateText(params as Parameters<typeof generateText>[0]);
	return {
		text: result.text,
		// v7 footgun: result.response.messages contains ONLY the final
		// step's assistant text — intermediate tool-call/tool-result
		// messages live per step. Without flattening, multi-turn tool
		// conversations lose the model's own tool history (discovered
		// 2026-07-06; affected cells re-run as protocol v2 — see REPORT).
		responseMessages: result.steps.flatMap(
			(step) => step.response.messages,
		) as ModelMessage[],
		inputTokens: result.totalUsage.inputTokens ?? 0,
		outputTokens: result.totalUsage.outputTokens ?? 0,
		cacheReadTokens: result.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
		reasoningTokens: result.totalUsage.outputTokenDetails?.reasoningTokens ?? 0,
		latencyMs: Math.round(performance.now() - started),
		steps: result.steps.length,
	};
}

function toCallLog(
	outcome: CallOutcome,
	phase: number,
	round: number,
	issueCodes: string[],
	steps?: number,
): CallLog {
	return {
		phase,
		round,
		inputTokens: outcome.inputTokens,
		outputTokens: outcome.outputTokens,
		...(outcome.cacheReadTokens > 0
			? { cacheReadTokens: outcome.cacheReadTokens }
			: {}),
		...(outcome.reasoningTokens > 0
			? { reasoningTokens: outcome.reasoningTokens }
			: {}),
		latencyMs: outcome.latencyMs,
		...(steps !== undefined ? { steps } : {}),
		issueCodes,
	};
}

interface LoopResult {
	tree: BarkupNode | null;
	calls: CallLog[];
	messages: ModelMessage[];
	firstPassValid: boolean;
}

/** Whole-artifact loop: reply → parse → issues verbatim → retry. */
export async function rewriteLoop(
	condition: RewriteCondition,
	model: string,
	messages: ModelMessage[],
	phase: number,
): Promise<LoopResult> {
	const calls: CallLog[] = [];
	let firstPassValid = false;
	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const outcome = await callModel(model, condition.systemPrompt, messages);
		messages.push({ role: "assistant", content: outcome.text });
		const parsed = condition.parseArtifact(outcome.text);
		const issueCodes = parsed.ok ? [] : parsed.issues.map((i) => i.code);
		calls.push(toCallLog(outcome, phase, round, issueCodes));
		if (parsed.ok) {
			if (round === 1) firstPassValid = true;
			return { tree: parsed.node, calls, messages, firstPassValid };
		}
		if (round < MAX_ROUNDS) {
			messages.push({
				role: "user",
				content: formatIssuesFeedback(parsed.issues, condition.artifactName),
			});
		}
	}
	return { tree: null, calls, messages, firstPassValid };
}

/**
 * Patch loop (condition E): each attempt is a fresh patch against the
 * SAME base tree (a failed patch is never partially applied), with the
 * structured issues returned verbatim.
 */
async function patchLoop(
	condition: PatchCondition,
	model: string,
	messages: ModelMessage[],
	phase: number,
	base: BarkupNode,
): Promise<LoopResult> {
	const calls: CallLog[] = [];
	let firstPassValid = false;
	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const outcome = await callModel(model, condition.systemPrompt, messages);
		messages.push({ role: "assistant", content: outcome.text });
		const applied = condition.applyArtifact(outcome.text, base);
		const issueCodes = applied.ok ? [] : applied.issues.map((i) => i.code);
		calls.push(toCallLog(outcome, phase, round, issueCodes));
		if (applied.ok) {
			if (round === 1) firstPassValid = true;
			return { tree: applied.node, calls, messages, firstPassValid };
		}
		if (round < MAX_ROUNDS) {
			messages.push({
				role: "user",
				content: `${formatIssuesFeedback(
					applied.issues,
					condition.artifactName,
				)} The patch was NOT applied — reply with a complete corrected patch against the tree exactly as originally shown.`,
			});
		}
	}
	return { tree: null, calls, messages, firstPassValid };
}

/** Tools loop: tool calls → DONE → validate state → issues verbatim → continue. */
export async function toolsLoop(
	condition: ToolsCondition,
	model: string,
	session: ReturnType<ToolsCondition["createSession"]>,
	messages: ModelMessage[],
	phase: number,
): Promise<LoopResult> {
	const calls: CallLog[] = [];
	let firstPassValid = false;
	for (let round = 1; round <= MAX_ROUNDS; round += 1) {
		const outcome = await callModel(
			model,
			condition.systemPrompt,
			messages,
			session.tools,
		);
		messages.push(...outcome.responseMessages);
		const validated = condition.validateState(session.state.tree);
		const issueCodes = validated.ok ? [] : validated.issues.map((i) => i.code);
		calls.push(toCallLog(outcome, phase, round, issueCodes, outcome.steps));
		if (validated.ok) {
			if (round === 1) firstPassValid = true;
			return {
				tree: cloneTree(session.state.tree),
				calls,
				messages,
				firstPassValid,
			};
		}
		if (round < MAX_ROUNDS) {
			messages.push({
				role: "user",
				content: formatIssuesFeedback(
					validated.issues,
					`tree state (fix it with the tools, then reply DONE)`,
				),
			});
		}
	}
	return { tree: null, calls, messages, firstPassValid };
}

export function findByTypeAndName(
	tree: BarkupNode,
	type: string,
	name: string,
): BarkupNode | null {
	let found: BarkupNode | null = null;
	walkTree(tree, ({ node }) => {
		if (node.type === type && node.name === name && found === null) {
			found = node;
		}
	});
	return found;
}

function baseRecord(
	task: PilotTask,
	condition: Condition,
	model: string,
	regime: string,
): TaskRunRecord {
	return {
		taskId: task.id,
		family: task.family,
		bucket: task.bucket,
		condition: condition.id,
		model,
		regime,
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

function accumulate(record: TaskRunRecord, calls: CallLog[]): void {
	record.calls.push(...calls);
	record.rounds = record.calls.length;
	record.totalInputTokens = record.calls.reduce(
		(sum, c) => sum + c.inputTokens,
		0,
	);
	record.totalOutputTokens = record.calls.reduce(
		(sum, c) => sum + c.outputTokens,
		0,
	);
	record.totalLatencyMs = record.calls.reduce((sum, c) => sum + c.latencyMs, 0);
}

/**
 * Derived fields that depend on `success`, which the family runners set
 * AFTER their last accumulate() call — so this must run once, at the
 * end, on the finished record (a pilot-caught ordering bug).
 */
function finalize(record: TaskRunRecord): TaskRunRecord {
	record.passAt1 =
		record.success && record.calls.every((call) => call.round === 1);
	return record;
}

async function runEditLoop(
	condition: Condition,
	model: string,
	tree: BarkupNode,
	instruction: string,
): Promise<{ loop: LoopResult; session: { toolErrorCount: number } | null }> {
	const messages: ModelMessage[] = [
		{ role: "user", content: editMessage(condition, tree, instruction) },
	];
	if (condition.kind === "rewrite") {
		return {
			loop: await rewriteLoop(condition, model, messages, 1),
			session: null,
		};
	}
	if (condition.kind === "patch") {
		return {
			loop: await patchLoop(condition, model, messages, 1, tree),
			session: null,
		};
	}
	const session = condition.createSession(tree);
	return {
		loop: await toolsLoop(condition, model, session, messages, 1),
		session,
	};
}

async function runTransformation(
	task: TransformationTask,
	condition: Condition,
	model: string,
	regime: string,
): Promise<TaskRunRecord> {
	const record = baseRecord(task, condition, model, regime);
	const { loop, session } = await runEditLoop(
		condition,
		model,
		task.tree,
		task.instruction,
	);
	record.firstPassValid = loop.firstPassValid;
	if (session) record.toolErrorCount = session.toolErrorCount;
	if (loop.tree) {
		const sourceIds = new Set(allIds(task.tree));
		record.success = equalModuloNewIds(task.expected, loop.tree, sourceIds);
		record.drift = driftCount(task.tree, task.expected, loop.tree);
	}
	record.detail = { finalTree: loop.tree };
	accumulate(record, loop.calls);
	return record;
}

async function runConstruction(
	task: ConstructionTask,
	condition: Condition,
	model: string,
	regime: string,
): Promise<TaskRunRecord> {
	if (task.spec === null) {
		throw new Error(
			`Construction task ${task.id} has no spec — run \`bun run describe\` first.`,
		);
	}
	const record = baseRecord(task, condition, model, regime);
	if (condition.kind === "rewrite") {
		const messages: ModelMessage[] = [
			{
				role: "user",
				content: constructionMessage(condition, task.spec, null),
			},
		];
		const loop = await rewriteLoop(condition, model, messages, 1);
		record.firstPassValid = loop.firstPassValid;
		if (loop.tree) record.success = equalModuloAllIds(task.target, loop.tree);
		record.detail = { finalTree: loop.tree };
		accumulate(record, loop.calls);
		return record;
	}
	const initial: BarkupNode = { type: "document", id: "root" };
	const messages: ModelMessage[] = [
		{
			role: "user",
			content: constructionMessage(condition, task.spec, initial),
		},
	];
	if (condition.kind === "patch") {
		const loop = await patchLoop(condition, model, messages, 1, initial);
		record.firstPassValid = loop.firstPassValid;
		if (loop.tree) record.success = equalModuloAllIds(task.target, loop.tree);
		record.detail = { finalTree: loop.tree };
		accumulate(record, loop.calls);
		return record;
	}
	const session = condition.createSession(initial);
	const loop = await toolsLoop(condition, model, session, messages, 1);
	record.firstPassValid = loop.firstPassValid;
	record.toolErrorCount = session.toolErrorCount;
	if (loop.tree) record.success = equalModuloAllIds(task.target, loop.tree);
	record.detail = { finalTree: loop.tree };
	accumulate(record, loop.calls);
	return record;
}

async function runReference(
	task: ReferenceTask,
	condition: Condition,
	model: string,
	regime: string,
): Promise<TaskRunRecord> {
	const record = baseRecord(task, condition, model, regime);

	// Phase 1: the insert edit.
	const messages: ModelMessage[] = [
		{
			role: "user",
			content: editMessage(condition, task.tree, task.instruction1),
		},
	];
	let session: ReturnType<ToolsCondition["createSession"]> | null = null;
	let loop1: LoopResult;
	if (condition.kind === "rewrite") {
		loop1 = await rewriteLoop(condition, model, messages, 1);
	} else if (condition.kind === "patch") {
		loop1 = await patchLoop(condition, model, messages, 1, task.tree);
	} else {
		session = condition.createSession(task.tree);
		loop1 = await toolsLoop(condition, model, session, messages, 1);
	}
	record.firstPassValid = loop1.firstPassValid;
	accumulate(record, loop1.calls);
	if (session) record.toolErrorCount = session.toolErrorCount;
	if (!loop1.tree) return record;

	const phase1Correct = equalModuloNewIds(
		task.expected1,
		loop1.tree,
		new Set(allIds(task.tree)),
	);

	// Find the created node in the model's own output; its id is the reference.
	const created = findByTypeAndName(
		loop1.tree,
		task.newNodeType,
		task.newNodeName,
	);
	if (!created || created.id === undefined) {
		record.idRefFailure = true;
		record.detail = {
			phase1Correct,
			reason: "created node missing or has no id",
			phase1Tree: loop1.tree,
		};
		return record;
	}
	const referencedId = created.id;

	// Phase 2: the follow-up edit referencing the id from the model's own output.
	const instruction2 = task.instruction2Template.replace("%ID%", referencedId);
	const edit2: Edit = {
		kind: "set-attribute",
		nodeId: referencedId,
		key: task.edit2Key,
		value: task.edit2Value,
	};
	const expected2 = applyEdit(loop1.tree, edit2);

	messages.push({
		role: "user",
		content: followUpMessage(condition, instruction2),
	});
	let loop2: LoopResult;
	if (condition.kind === "rewrite") {
		loop2 = await rewriteLoop(condition, model, messages, 2);
	} else if (condition.kind === "patch") {
		// Phase 2 patches apply against the model's own phase-1 tree.
		loop2 = await patchLoop(condition, model, messages, 2, loop1.tree);
	} else {
		loop2 = await toolsLoop(
			condition,
			model,
			session as ReturnType<ToolsCondition["createSession"]>,
			messages,
			2,
		);
	}
	accumulate(record, loop2.calls);
	if (session) record.toolErrorCount = session.toolErrorCount;

	if (loop2.tree) {
		const idSurvives = allIds(loop2.tree).includes(referencedId);
		record.idRefFailure = !idSurvives;
		record.success = phase1Correct && equalExact(expected2, loop2.tree);
	} else {
		record.idRefFailure = false;
	}
	record.detail = {
		phase1Correct,
		referencedId,
		phase1Tree: loop1.tree,
		finalTree: loop2.tree,
		...(transcriptsEnabled()
			? { transcript: compactTranscript(messages) }
			: {}),
	};
	return record;
}

async function runReading(
	task: ReadingTask,
	condition: Condition,
	model: string,
	regime: string,
): Promise<TaskRunRecord> {
	const record = baseRecord(task, condition, model, regime);
	const messages: ModelMessage[] = [
		{
			role: "user",
			content: readingMessage(condition, task.tree, task.question.prompt),
		},
	];
	const outcome = await callModel(
		model,
		condition.readingSystemPrompt,
		messages,
	);
	record.calls.push(toCallLog(outcome, 1, 1, []));
	record.success = answersMatch(task.question.answer, outcome.text);
	record.detail = {
		expected: task.question.answer,
		received: outcome.text.slice(-200),
	};
	accumulate(record, []);
	return record;
}

export async function runTask(
	task: PilotTask,
	condition: Condition,
	model: string,
	regime = "parity",
): Promise<TaskRunRecord> {
	switch (task.family) {
		case "transformation":
			return finalize(await runTransformation(task, condition, model, regime));
		case "construction":
			return finalize(await runConstruction(task, condition, model, regime));
		case "reference":
			return finalize(await runReference(task, condition, model, regime));
		case "reading":
			return finalize(await runReading(task, condition, model, regime));
	}
}

function recordKey(
	taskId: string,
	conditionId: string,
	model: string,
	regime: string,
): string {
	return `${taskId}::${conditionId}::${model}::${regime}`;
}

export function loadExistingKeys(outPath: string): Set<string> {
	const keys = new Set<string>();
	if (!existsSync(outPath)) return keys;
	for (const line of readFileSync(outPath, "utf8").split("\n")) {
		if (line.trim() === "") continue;
		const record = JSON.parse(line) as TaskRunRecord;
		keys.add(
			recordKey(
				record.taskId,
				record.condition,
				record.model,
				record.regime ?? "parity",
			),
		);
	}
	return keys;
}

export async function runAll(options: RunOptions): Promise<TaskRunRecord[]> {
	const log = options.log ?? ((line: string) => console.log(line));
	const done = loadExistingKeys(options.outPath);
	mkdirSync(dirname(options.outPath), { recursive: true });

	const queue: { task: PilotTask; condition: Condition }[] = [];
	for (const task of options.tasks) {
		for (const condition of options.conditions) {
			if (
				!done.has(
					recordKey(task.id, condition.id, options.model, options.regime),
				)
			) {
				queue.push({ task, condition });
			}
		}
	}
	log(
		`Running ${queue.length} task×condition pairs (${done.size} already done) with model ${options.model}, regime ${options.regime}`,
	);

	const records: TaskRunRecord[] = [];
	const concurrency = options.concurrency ?? 3;
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			const label = `${item.task.id} × ${item.condition.id}`;
			try {
				const record = await runTask(
					item.task,
					item.condition,
					options.model,
					options.regime,
				);
				records.push(record);
				appendFileSync(options.outPath, `${JSON.stringify(record)}\n`);
				log(
					`  ${label}: ${record.success ? "PASS" : "fail"} (rounds=${record.rounds}, tokens=${record.totalInputTokens}+${record.totalOutputTokens})`,
				);
			} catch (error) {
				const record = baseRecord(
					item.task,
					item.condition,
					options.model,
					options.regime,
				);
				record.error = error instanceof Error ? error.message : String(error);
				records.push(record);
				appendFileSync(options.outPath, `${JSON.stringify(record)}\n`);
				log(`  ${label}: ERROR ${record.error}`);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
	return records;
}
