/**
 * Study G runner (docs/BRIEF-G.md): drives one followup task through an
 * arm × depth cell. Arms G1–G4 use the tools interface (condition C's
 * session); G5 is the whole-tree-rewrite control (condition A). The
 * standard validity correction loop applies per turn; semantic feedback
 * is never given. Compact transcripts are always captured — Study G's
 * classification depends on them.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import type { ModelMessage } from "ai";
import { conditionA } from "../conditions/a.js";
import { conditionC } from "../conditions/c.js";
import type { FollowupTask } from "../corpus/followup.js";
import { cloneTree, findById } from "../tree.js";
import { editMessage, followUpMessage } from "./prompts.js";
import type { CallLog } from "./records.js";
import {
	compactTranscript,
	findByTypeAndName,
	rewriteLoop,
	toolsLoop,
} from "./runner.js";

export type Arm = "G1" | "G2" | "G3" | "G4" | "G5";

export const ARM_DEPTHS: Record<Arm, number[]> = {
	G1: [0, 2, 6],
	G2: [2],
	G3: [2],
	G4: [2],
	G5: [0, 2, 6],
};

export interface FollowupRecord {
	taskId: string;
	bucket: string;
	arm: Arm;
	depth: number;
	model: string;
	/** Primary outcome: the final edit is present on the phase-1 node. */
	finalApplied: boolean;
	/** Phase 1 produced the named node with an id. */
	phase1Ok: boolean;
	/** How many of the N filler edits are correctly applied at the end. */
	fillersApplied: number;
	/** Any tool call (G1–G4) / any tree change (G5) in the final turn. */
	actedInFinalTurn: boolean | null;
	totalInputTokens: number;
	totalOutputTokens: number;
	calls: CallLog[];
	error?: string;
	transcript?: Record<string, unknown>[];
}

/** Pure grading helper (unit-tested): is the final edit present? */
export function gradeFinal(
	tree: BarkupNode,
	nodeId: string,
	key: string,
	value: AttributeValue,
): boolean {
	const node = findById(tree, nodeId);
	return (
		node !== null &&
		JSON.stringify(node.attributes?.[key]) === JSON.stringify(value)
	);
}

function fillerApplied(
	tree: BarkupNode,
	filler: FollowupTask["fillers"][number],
): boolean {
	if (filler.edit.kind !== "set-attribute") return false;
	const node = findById(tree, filler.edit.nodeId);
	return (
		node !== null &&
		JSON.stringify(node.attributes?.[filler.edit.key]) ===
			JSON.stringify(filler.edit.value)
	);
}

function acted(before: BarkupNode, after: BarkupNode): boolean {
	return JSON.stringify(before) !== JSON.stringify(after);
}

export async function runFollowupTask(
	task: FollowupTask,
	arm: Arm,
	depth: number,
	model: string,
): Promise<FollowupRecord> {
	const record: FollowupRecord = {
		taskId: task.id,
		bucket: task.bucket,
		arm,
		depth,
		model,
		finalApplied: false,
		phase1Ok: false,
		fillersApplied: 0,
		actedInFinalTurn: null,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		calls: [],
	};
	const fillers = task.fillers.slice(0, depth);

	const track = (calls: CallLog[]): void => {
		record.calls.push(...calls);
		record.totalInputTokens = record.calls.reduce(
			(s, c) => s + c.inputTokens,
			0,
		);
		record.totalOutputTokens = record.calls.reduce(
			(s, c) => s + c.outputTokens,
			0,
		);
	};

	if (arm === "G5") {
		// Whole-tree rewrite control: state is the model's own last valid tree.
		let current = task.tree;
		const messages: ModelMessage[] = [
			{
				role: "user",
				content: editMessage(conditionA, current, task.instruction1),
			},
		];
		const loop1 = await rewriteLoop(conditionA, model, messages, 1);
		track(loop1.calls);
		if (loop1.tree) current = loop1.tree;
		const created = loop1.tree
			? findByTypeAndName(loop1.tree, task.newNodeType, task.newNodeName)
			: null;
		record.phase1Ok = created !== null && created.id !== undefined;
		if (!record.phase1Ok) {
			record.transcript = compactTranscript(messages);
			return record;
		}
		const referencedId = (created as BarkupNode).id as string;

		let phase = 2;
		for (const filler of fillers) {
			messages.push({
				role: "user",
				content: followUpMessage(conditionA, filler.instruction),
			});
			const loop = await rewriteLoop(conditionA, model, messages, phase);
			track(loop.calls);
			if (loop.tree) current = loop.tree;
			phase += 1;
		}
		record.fillersApplied = fillers.filter((f) =>
			fillerApplied(current, f),
		).length;

		const beforeFinal = cloneTree(current);
		messages.push({
			role: "user",
			content: followUpMessage(
				conditionA,
				task.finalInstructionTemplate.replace("%ID%", referencedId),
			),
		});
		const finalLoop = await rewriteLoop(conditionA, model, messages, phase);
		track(finalLoop.calls);
		if (finalLoop.tree) current = finalLoop.tree;
		record.actedInFinalTurn = finalLoop.tree
			? acted(beforeFinal, finalLoop.tree)
			: false;
		record.finalApplied = gradeFinal(
			current,
			referencedId,
			task.finalKey,
			task.finalValue,
		);
		record.transcript = compactTranscript(messages);
		return record;
	}

	// Tools arms (G1–G4): server-maintained state via condition C's session.
	const session = conditionC.createSession(task.tree);
	let messages: ModelMessage[] = [
		{
			role: "user",
			content: editMessage(conditionC, task.tree, task.instruction1),
		},
	];
	const loop1 = await toolsLoop(conditionC, model, session, messages, 1);
	track(loop1.calls);
	const created = findByTypeAndName(
		session.state.tree,
		task.newNodeType,
		task.newNodeName,
	);
	record.phase1Ok = created !== null && created.id !== undefined;
	if (!record.phase1Ok) {
		record.transcript = compactTranscript(messages);
		return record;
	}
	const referencedId = (created as BarkupNode).id as string;

	let phase = 2;
	for (const filler of fillers) {
		messages.push({
			role: "user",
			content: followUpMessage(conditionC, filler.instruction),
		});
		const loop = await toolsLoop(conditionC, model, session, messages, phase);
		track(loop.calls);
		phase += 1;
	}
	record.fillersApplied = fillers.filter((f) =>
		fillerApplied(session.state.tree, f),
	).length;

	const finalInstruction = task.finalInstructionTemplate.replace(
		"%ID%",
		referencedId,
	);
	const beforeFinal = cloneTree(session.state.tree);
	if (arm === "G2") {
		// Fresh conversation: current state shown, no prior turns.
		messages = [
			{
				role: "user",
				content: editMessage(conditionC, session.state.tree, finalInstruction),
			},
		];
	} else if (arm === "G3") {
		messages.push({
			role: "user",
			content: `Here is the current tree:\n\n${conditionC.serialize(
				session.state.tree,
			)}\n\n${followUpMessage(conditionC, finalInstruction)}`,
		});
	} else if (arm === "G4") {
		messages.push({
			role: "user",
			content: `${followUpMessage(
				conditionC,
				finalInstruction,
			)} First restate the requested change in one sentence, then make it with the tools, then reply DONE.`,
		});
	} else {
		messages.push({
			role: "user",
			content: followUpMessage(conditionC, finalInstruction),
		});
	}
	const finalLoop = await toolsLoop(
		conditionC,
		model,
		session,
		messages,
		phase,
	);
	track(finalLoop.calls);
	record.actedInFinalTurn = acted(beforeFinal, session.state.tree);
	record.finalApplied = gradeFinal(
		session.state.tree,
		referencedId,
		task.finalKey,
		task.finalValue,
	);
	record.transcript = compactTranscript(messages);
	return record;
}

function cellKey(
	taskId: string,
	arm: string,
	depth: number,
	model: string,
): string {
	return `${taskId}::${arm}::${depth}::${model}`;
}

export interface FollowupRunOptions {
	model: string;
	tasks: FollowupTask[];
	outPath: string;
	concurrency?: number;
	log?: (line: string) => void;
}

export async function runFollowupAll(
	options: FollowupRunOptions,
): Promise<FollowupRecord[]> {
	const log = options.log ?? ((line: string) => console.log(line));
	mkdirSync(dirname(options.outPath), { recursive: true });
	const done = new Set<string>();
	if (existsSync(options.outPath)) {
		for (const line of readFileSync(options.outPath, "utf8").split("\n")) {
			if (line.trim() === "") continue;
			const r = JSON.parse(line) as FollowupRecord;
			done.add(cellKey(r.taskId, r.arm, r.depth, r.model));
		}
	}

	const queue: { task: FollowupTask; arm: Arm; depth: number }[] = [];
	for (const task of options.tasks) {
		for (const [arm, depths] of Object.entries(ARM_DEPTHS) as [
			Arm,
			number[],
		][]) {
			for (const depth of depths) {
				if (!done.has(cellKey(task.id, arm, depth, options.model))) {
					queue.push({ task, arm, depth });
				}
			}
		}
	}
	log(
		`Study G: ${queue.length} cells (${done.size} already done) for ${options.model}`,
	);

	const records: FollowupRecord[] = [];
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			const label = `${item.task.id} × ${item.arm} × N${item.depth}`;
			try {
				const record = await runFollowupTask(
					item.task,
					item.arm,
					item.depth,
					options.model,
				);
				records.push(record);
				appendFileSync(options.outPath, `${JSON.stringify(record)}\n`);
				log(
					`  ${label}: ${record.finalApplied ? "APPLIED" : "dropped"} (phase1 ${record.phase1Ok ? "ok" : "FAIL"}, fillers ${record.fillersApplied}/${item.depth})`,
				);
			} catch (error) {
				const record: FollowupRecord = {
					taskId: item.task.id,
					bucket: item.task.bucket,
					arm: item.arm,
					depth: item.depth,
					model: options.model,
					finalApplied: false,
					phase1Ok: false,
					fillersApplied: 0,
					actedInFinalTurn: null,
					totalInputTokens: 0,
					totalOutputTokens: 0,
					calls: [],
					error: error instanceof Error ? error.message : String(error),
				};
				records.push(record);
				appendFileSync(options.outPath, `${JSON.stringify(record)}\n`);
				log(`  ${label}: ERROR ${record.error}`);
			}
		}
	};
	await Promise.all(
		Array.from(
			{ length: Math.min(options.concurrency ?? 4, queue.length) },
			worker,
		),
	);
	return records;
}
