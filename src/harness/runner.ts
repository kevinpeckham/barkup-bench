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
import { generateText, stepCountIs } from "ai";
import { formatIssuesFeedback } from "../conditions/shared.js";
import type {
	Condition,
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

export interface RunOptions {
	model: string;
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
	const result = await generateText({
		model,
		system,
		messages,
		temperature: 0,
		maxRetries: 4,
		...(tools !== undefined
			? { tools, stopWhen: stepCountIs(MAX_TOOL_STEPS) }
			: {}),
	});
	return {
		text: result.text,
		responseMessages: result.response.messages as ModelMessage[],
		inputTokens: result.totalUsage.inputTokens ?? 0,
		outputTokens: result.totalUsage.outputTokens ?? 0,
		latencyMs: Math.round(performance.now() - started),
		steps: result.steps.length,
	};
}

interface LoopResult {
	tree: BarkupNode | null;
	calls: CallLog[];
	messages: ModelMessage[];
	firstPassValid: boolean;
}

/** Whole-artifact loop: reply → parse → issues verbatim → retry. */
async function rewriteLoop(
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
		calls.push({
			phase,
			round,
			inputTokens: outcome.inputTokens,
			outputTokens: outcome.outputTokens,
			latencyMs: outcome.latencyMs,
			issueCodes,
		});
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

/** Tools loop: tool calls → DONE → validate state → issues verbatim → continue. */
async function toolsLoop(
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
		calls.push({
			phase,
			round,
			inputTokens: outcome.inputTokens,
			outputTokens: outcome.outputTokens,
			latencyMs: outcome.latencyMs,
			steps: outcome.steps,
			issueCodes,
		});
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

function findByTypeAndName(
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
): TaskRunRecord {
	return {
		taskId: task.id,
		family: task.family,
		bucket: task.bucket,
		condition: condition.id,
		model,
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
	record.passAt1 =
		record.success && record.calls.every((call) => call.round === 1);
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
): Promise<TaskRunRecord> {
	const record = baseRecord(task, condition, model);
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
	accumulate(record, loop.calls);
	return record;
}

async function runConstruction(
	task: ConstructionTask,
	condition: Condition,
	model: string,
): Promise<TaskRunRecord> {
	if (task.spec === null) {
		throw new Error(
			`Construction task ${task.id} has no spec — run \`bun run describe\` first.`,
		);
	}
	const record = baseRecord(task, condition, model);
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
		accumulate(record, loop.calls);
		return record;
	}
	const initial: BarkupNode = { type: "document", id: "root" };
	const session = condition.createSession(initial);
	const messages: ModelMessage[] = [
		{
			role: "user",
			content: constructionMessage(condition, task.spec, initial),
		},
	];
	const loop = await toolsLoop(condition, model, session, messages, 1);
	record.firstPassValid = loop.firstPassValid;
	record.toolErrorCount = session.toolErrorCount;
	if (loop.tree) record.success = equalModuloAllIds(task.target, loop.tree);
	accumulate(record, loop.calls);
	return record;
}

async function runReference(
	task: ReferenceTask,
	condition: Condition,
	model: string,
): Promise<TaskRunRecord> {
	const record = baseRecord(task, condition, model);

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
	record.detail = { phase1Correct, referencedId };
	return record;
}

async function runReading(
	task: ReadingTask,
	condition: Condition,
	model: string,
): Promise<TaskRunRecord> {
	const record = baseRecord(task, condition, model);
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
	record.calls.push({
		phase: 1,
		round: 1,
		inputTokens: outcome.inputTokens,
		outputTokens: outcome.outputTokens,
		latencyMs: outcome.latencyMs,
		issueCodes: [],
	});
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
): Promise<TaskRunRecord> {
	switch (task.family) {
		case "transformation":
			return runTransformation(task, condition, model);
		case "construction":
			return runConstruction(task, condition, model);
		case "reference":
			return runReference(task, condition, model);
		case "reading":
			return runReading(task, condition, model);
	}
}

function recordKey(taskId: string, conditionId: string, model: string): string {
	return `${taskId}::${conditionId}::${model}`;
}

export function loadExistingKeys(outPath: string): Set<string> {
	const keys = new Set<string>();
	if (!existsSync(outPath)) return keys;
	for (const line of readFileSync(outPath, "utf8").split("\n")) {
		if (line.trim() === "") continue;
		const record = JSON.parse(line) as TaskRunRecord;
		keys.add(recordKey(record.taskId, record.condition, record.model));
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
			if (!done.has(recordKey(task.id, condition.id, options.model))) {
				queue.push({ task, condition });
			}
		}
	}
	log(
		`Running ${queue.length} task×condition pairs (${done.size} already done) with model ${options.model}`,
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
				const record = await runTask(item.task, item.condition, options.model);
				records.push(record);
				appendFileSync(options.outPath, `${JSON.stringify(record)}\n`);
				log(
					`  ${label}: ${record.success ? "PASS" : "fail"} (rounds=${record.rounds}, tokens=${record.totalInputTokens}+${record.totalOutputTokens})`,
				);
			} catch (error) {
				const record = baseRecord(item.task, item.condition, options.model);
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
