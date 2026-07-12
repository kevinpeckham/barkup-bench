/**
 * Study X anaphora corpus (docs/BRIEF-X.md): 12-step sessions with
 * scheduled predecessor→anaphora pairs at distance 1 — amend ("that
 * same node"), repeat ("the same change"), undo ("undo that") — whose
 * instructions never restate the referent's id, key, or value. The
 * generator stores a concrete chain edit for every step so the
 * standard validation applies; the runner re-derives undo's expected
 * value from the model's own trajectory (BRIEF-X semantics).
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { BENCH_CONFIG } from "../grammar.js";
import { cloneTree, findById, walkTree } from "../tree.js";
import type { Edit } from "./edits.js";
import {
	applyEdit,
	describeEdit,
	formatValue,
	generateEdit,
	nodeRef,
} from "./edits.js";
import { generateAttributeValue, slug } from "./humanize.js";
import type { Rng } from "./rng.js";
import type { SessionStep, SessionTask } from "./sessions.js";
import { validateSession } from "./sessions.js";
import type { BucketName } from "./trees.js";

export type AnaphoraKind = "amend" | "repeat" | "undo";

export interface AnaphoraStep extends SessionStep {
	/** Present on anaphora steps; predecessor is always index − 1. */
	anaphora?: AnaphoraKind;
}

export interface XTask extends SessionTask {
	steps: AnaphoraStep[];
}

export const X_STEPS = 12;

/** Pre-registered schedule (BRIEF-X.md): predecessor → anaphora pairs. */
export const X_SCHEDULE = {
	predecessors: [2, 5, 8, 11],
	anaphora: { 3: "amend", 6: "repeat", 9: "undo", 12: "amend" } as Record<
		number,
		AnaphoraKind
	>,
	/** Ordinary steps and their fixed kinds (coverage). */
	ordinary: {
		1: "set-name",
		4: "insert-node",
		7: "move-node",
		10: "remove-node",
	} as Record<number, Edit["kind"]>,
} as const;

function idNodes(tree: BarkupNode): BarkupNode[] {
	const out: BarkupNode[] = [];
	walkTree(tree, ({ node }) => {
		if (node.id !== undefined) out.push(node);
	});
	return out;
}

function attributeKeys(type: string): string[] {
	return Object.keys(BENCH_CONFIG.nodes[type]?.attributes ?? {});
}

function freshValue(
	rng: Rng,
	type: string,
	key: string,
	current: AttributeValue | undefined,
): AttributeValue {
	let value = generateAttributeValue(rng, type, key);
	for (
		let i = 0;
		i < 10 && JSON.stringify(value) === JSON.stringify(current);
		i += 1
	) {
		value = generateAttributeValue(rng, type, key);
	}
	return value;
}

/** A predecessor target: pre-existing, ≥2 attribute keys, and (for
 * undo predecessors) the chosen key already present so a prior value
 * exists to restore. */
function pickPredecessor(
	state: BarkupNode,
	rng: Rng,
	needs: { presentKey: boolean; siblingOfSameType: boolean },
): { node: BarkupNode; key: string } {
	const nodes = idNodes(state);
	const candidates: { node: BarkupNode; key: string }[] = [];
	for (const node of nodes) {
		const keys = attributeKeys(node.type);
		if (keys.length < 2) continue;
		if (
			needs.siblingOfSameType &&
			nodes.filter((n) => n.type === node.type).length < 2
		) {
			continue;
		}
		for (const key of keys) {
			if (needs.presentKey && node.attributes?.[key] === undefined) continue;
			candidates.push({ node, key });
		}
	}
	if (candidates.length === 0) {
		throw new Error("anaphora corpus: no predecessor candidate");
	}
	return rng.pick(candidates);
}

export function generateXTask(
	tree: BarkupNode,
	rng: Rng,
	id: string,
	bucket: BucketName,
): XTask {
	let state = cloneTree(tree);
	const steps: AnaphoraStep[] = [];
	const takenNames = new Set<string>();
	walkTree(state, ({ node }) => {
		if (node.name !== undefined) takenNames.add(node.name);
	});

	/** The most recent predecessor's spec, for the following anaphora step. */
	let prev: {
		targetId: string;
		targetType: string;
		key: string;
		value: AttributeValue;
		oldValue: AttributeValue;
	} | null = null;

	for (let index = 1; index <= X_STEPS; index += 1) {
		let edit: Edit;
		let instruction: string;
		let anaphora: AnaphoraKind | undefined;
		let created: SessionStep["created"];

		const anaphoraKind = X_SCHEDULE.anaphora[index];
		if ((X_SCHEDULE.predecessors as readonly number[]).includes(index)) {
			const nextKind = X_SCHEDULE.anaphora[index + 1] as AnaphoraKind;
			const pick = pickPredecessor(state, rng, {
				presentKey: nextKind === "undo",
				siblingOfSameType: nextKind === "repeat",
			});
			const oldValue = pick.node.attributes?.[pick.key] as AttributeValue;
			const value = freshValue(rng, pick.node.type, pick.key, oldValue);
			edit = {
				kind: "set-attribute",
				nodeId: pick.node.id as string,
				key: pick.key,
				value,
			};
			instruction = describeEdit(state, edit);
			prev = {
				targetId: pick.node.id as string,
				targetType: pick.node.type,
				key: pick.key,
				value,
				oldValue,
			};
		} else if (anaphoraKind !== undefined) {
			if (!prev) throw new Error("anaphora corpus: schedule bug");
			anaphora = anaphoraKind;
			if (anaphoraKind === "amend") {
				const keys = attributeKeys(prev.targetType).filter(
					(k) => k !== prev?.key,
				);
				const key2 = rng.pick(keys);
				const target = findById(state, prev.targetId) as BarkupNode;
				const value2 = freshValue(
					rng,
					prev.targetType,
					key2,
					target.attributes?.[key2],
				);
				edit = {
					kind: "set-attribute",
					nodeId: prev.targetId,
					key: key2,
					value: value2,
				};
				instruction = `Also set the "${key2}" attribute of that same node to ${formatValue(value2)}.`;
			} else if (anaphoraKind === "repeat") {
				const siblings = idNodes(state).filter(
					(n) =>
						n.type === prev?.targetType &&
						n.id !== prev?.targetId &&
						JSON.stringify(n.attributes?.[prev?.key as string]) !==
							JSON.stringify(prev?.value),
				);
				if (siblings.length === 0) {
					throw new Error("anaphora corpus: no repeat sibling");
				}
				const b = rng.pick(siblings);
				edit = {
					kind: "set-attribute",
					nodeId: b.id as string,
					key: prev.key,
					value: prev.value,
				};
				instruction = `Apply the same change to ${nodeRef(state, b.id as string)}.`;
			} else {
				edit = {
					kind: "set-attribute",
					nodeId: prev.targetId,
					key: prev.key,
					value: prev.oldValue,
				};
				instruction = "Actually, undo that last change.";
			}
		} else {
			const kind = X_SCHEDULE.ordinary[index] as Edit["kind"];
			edit = generateEdit(state, rng, kind);
			if (edit.kind === "insert-node") {
				let name = slug(rng);
				while (takenNames.has(name)) name = slug(rng);
				takenNames.add(name);
				edit = { ...edit, node: { ...cloneTree(edit.node), name } };
				created = {
					placeholder: `sess-new-${index}`,
					type: edit.node.type,
					name,
				};
			}
			if (edit.kind === "set-name") takenNames.add(edit.name);
			instruction = describeEdit(state, edit);
		}

		state = applyEdit(state, edit);
		if (edit.kind === "insert-node" && created) {
			const parent = findById(state, edit.parentId) as BarkupNode;
			const inserted = (parent.children ?? [])[edit.index] as BarkupNode;
			inserted.id = created.placeholder;
		}
		steps.push({
			index,
			kind: edit.kind,
			edit,
			instruction,
			...(created !== undefined ? { created } : {}),
			referenceBack: false,
			...(anaphora !== undefined ? { anaphora } : {}),
		});
	}

	return { id, family: "session", bucket, tree, steps, expectedFinal: state };
}

/** BRIEF-X validation: chain + the no-leakage guarantees. */
export function validateXTask(task: XTask): string[] {
	const problems: string[] = [...validateSession(task)];
	for (const step of task.steps) {
		if (!step.anaphora) continue;
		const pred = task.steps[step.index - 2];
		if (!pred || pred.edit.kind !== "set-attribute") {
			problems.push(`step ${step.index}: predecessor is not set-attribute`);
			continue;
		}
		if (step.edit.kind !== "set-attribute") {
			problems.push(`step ${step.index}: anaphora edit kind`);
			continue;
		}
		const leaks: string[] = [];
		if (step.instruction.includes(`"${pred.edit.nodeId}"`)) {
			leaks.push("target id");
		}
		if (step.anaphora !== "amend") {
			if (step.instruction.includes(`"${pred.edit.key}"`)) leaks.push("key");
			if (step.instruction.includes(formatValue(pred.edit.value))) {
				leaks.push("value");
			}
		}
		if (
			step.anaphora === "undo" &&
			step.instruction.includes(formatValue(step.edit.value))
		) {
			leaks.push("old value");
		}
		if (leaks.length > 0) {
			problems.push(
				`step ${step.index}: instruction leaks ${leaks.join(", ")}`,
			);
		}
		if (step.anaphora === "repeat") {
			if (step.edit.nodeId === pred.edit.nodeId) {
				problems.push(`step ${step.index}: repeat targets the predecessor`);
			}
			if (
				step.edit.key !== pred.edit.key ||
				JSON.stringify(step.edit.value) !== JSON.stringify(pred.edit.value)
			) {
				problems.push(`step ${step.index}: repeat does not mirror predecessor`);
			}
		}
		if (step.anaphora === "amend" && step.edit.nodeId !== pred.edit.nodeId) {
			problems.push(`step ${step.index}: amend targets a different node`);
		}
		if (step.anaphora === "undo") {
			if (
				step.edit.nodeId !== pred.edit.nodeId ||
				step.edit.key !== pred.edit.key
			) {
				problems.push(`step ${step.index}: undo mismatches predecessor`);
			}
		}
	}
	return problems;
}
