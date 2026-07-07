/**
 * Study K session corpus (docs/BRIEF-K.md): sequences of 12 edits
 * against one tree, generated deterministically. Nodes the session
 * itself creates get placeholder ids ("sess-new-<step>") in the
 * generator's state; the real id is whatever the model mints at run
 * time, resolved by the runner via the created node's unique
 * (type, name) — the reference-family mechanism generalized to long
 * sessions. Instructions and edit specs carry the placeholders; the
 * runner substitutes actual ids before each step.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { BENCH_CONFIG } from "../grammar.js";
import {
	allIds,
	cloneTree,
	descendants,
	findById,
	findParent,
	walkTree,
} from "../tree.js";
import type { Edit } from "./edits.js";
import { applyEdit, describeEdit, generateEdit } from "./edits.js";
import { generateAttributeValue, slug } from "./humanize.js";
import type { Rng } from "./rng.js";
import type { BucketName } from "./trees.js";

export const SESSION_STEPS = 12;

export interface SessionStep {
	/** 1-based position in the session. */
	index: number;
	kind: Edit["kind"];
	/** May reference placeholder ids of nodes created earlier in the session. */
	edit: Edit;
	/** Instruction text against the pre-step state; placeholder ids appear verbatim. */
	instruction: string;
	/** Set on insert steps: how the runner locates the created node in the model's tree. */
	created?: { placeholder: string; type: string; name: string };
	/** True when the step deliberately targets a session-created node. */
	referenceBack: boolean;
}

export interface SessionTask {
	id: string;
	family: "session";
	bucket: BucketName;
	tree: BarkupNode;
	steps: SessionStep[];
	/** Final state with placeholder ids on session-created nodes (exploratory end-state grading). */
	expectedFinal: BarkupNode;
}

export interface SessionCorpus {
	version: 1;
	seed: number;
	sessions: SessionTask[];
}

const KINDS: Edit["kind"][] = [
	"set-attribute",
	"set-name",
	"remove-node",
	"insert-node",
	"move-node",
];

function namesIn(tree: BarkupNode): Set<string> {
	const names = new Set<string>();
	walkTree(tree, ({ node }) => {
		if (node.name !== undefined) names.add(node.name);
	});
	return names;
}

function uniqueName(rng: Rng, taken: Set<string>): string {
	let name = slug(rng);
	while (taken.has(name)) name = slug(rng);
	return name;
}

function allowedChildren(type: string): readonly string[] {
	return BENCH_CONFIG.nodes[type]?.children ?? [];
}

/** Most recently created placeholder node still present in the state. */
function latestSurvivingCreated(
	state: BarkupNode,
	placeholders: string[],
): BarkupNode | null {
	for (let i = placeholders.length - 1; i >= 0; i -= 1) {
		const node = findById(state, placeholders[i] as string);
		if (node) return node;
	}
	return null;
}

/** A reference-back edit targeting a session-created node, or null. */
function tryReferenceBack(
	state: BarkupNode,
	rng: Rng,
	kind: Edit["kind"],
	placeholders: string[],
): Edit | null {
	const target = latestSurvivingCreated(state, placeholders);
	if (!target) return null;
	const targetId = target.id as string;
	switch (kind) {
		case "set-attribute": {
			const keys = Object.keys(
				BENCH_CONFIG.nodes[target.type]?.attributes ?? {},
			);
			if (keys.length === 0) return null;
			const key = rng.pick(keys);
			let value = generateAttributeValue(rng, target.type, key);
			for (
				let attempts = 0;
				attempts < 10 &&
				JSON.stringify(value) === JSON.stringify(target.attributes?.[key]);
				attempts += 1
			) {
				value = generateAttributeValue(rng, target.type, key);
			}
			return { kind: "set-attribute", nodeId: targetId, key, value };
		}
		case "set-name": {
			let name = slug(rng);
			while (name === target.name) name = slug(rng);
			return { kind: "set-name", nodeId: targetId, name };
		}
		case "move-node": {
			const currentParent = findParent(state, targetId);
			const candidates: BarkupNode[] = [];
			walkTree(state, ({ node }) => {
				if (node === target) return;
				if (node === currentParent?.parent) return;
				if (!allowedChildren(node.type).includes(target.type)) return;
				if (descendants(target).includes(node)) return;
				candidates.push(node);
			});
			if (candidates.length === 0) return null;
			const parent = rng.pick(candidates);
			const index = rng.int(0, (parent.children ?? []).length);
			return {
				kind: "move-node",
				nodeId: targetId,
				newParentId: parent.id as string,
				index,
			};
		}
		default:
			return null;
	}
}

/**
 * Generate one session: 12 steps cycling the five edit kinds, with
 * eligible steps targeting the most recent surviving session-created
 * node at 50% (seeded). Insert steps force a unique name so the runner
 * can locate the model's created node unambiguously.
 */
export function generateSession(
	tree: BarkupNode,
	rng: Rng,
	id: string,
	bucket: BucketName,
): SessionTask {
	let state = cloneTree(tree);
	const steps: SessionStep[] = [];
	const placeholders: string[] = [];
	const takenNames = namesIn(state);

	for (let index = 1; index <= SESSION_STEPS; index += 1) {
		const kind = KINDS[(index - 1) % KINDS.length] as Edit["kind"];
		let edit: Edit | null = null;
		let referenceBack = false;

		if (
			(kind === "set-attribute" ||
				kind === "set-name" ||
				kind === "move-node") &&
			rng.chance(0.5)
		) {
			edit = tryReferenceBack(state, rng, kind, placeholders);
			referenceBack = edit !== null;
		}
		if (!edit) edit = generateEdit(state, rng, kind);

		let created: SessionStep["created"];
		if (edit.kind === "insert-node") {
			const name = uniqueName(rng, takenNames);
			takenNames.add(name);
			edit = { ...edit, node: { ...cloneTree(edit.node), name } };
			created = {
				placeholder: `sess-new-${index}`,
				type: edit.node.type,
				name,
			};
		}

		if (edit.kind === "set-name") takenNames.add(edit.name);

		const instruction = describeEdit(state, edit);
		state = applyEdit(state, edit);
		if (edit.kind === "insert-node" && created) {
			// Stamp the placeholder id onto the generator's copy so later
			// steps can reference it; the model mints its own id at run time.
			const parent = findById(state, edit.parentId) as BarkupNode;
			const inserted = (parent.children ?? [])[edit.index] as BarkupNode;
			inserted.id = created.placeholder;
			placeholders.push(created.placeholder);
		}
		steps.push({
			index,
			kind,
			edit,
			instruction,
			...(created !== undefined ? { created } : {}),
			referenceBack,
		});
	}

	return { id, family: "session", bucket, tree, steps, expectedFinal: state };
}

/** Placeholder ids used anywhere in an edit spec. */
export function placeholdersInEdit(edit: Edit): string[] {
	const ids: string[] = [];
	const check = (value: string | undefined) => {
		if (value?.startsWith("sess-new-")) ids.push(value);
	};
	switch (edit.kind) {
		case "set-attribute":
		case "set-name":
		case "remove-node":
			check(edit.nodeId);
			break;
		case "insert-node":
			check(edit.parentId);
			break;
		case "move-node":
			check(edit.nodeId);
			check(edit.newParentId);
			break;
	}
	return ids;
}

/** Substitute resolved ids into an edit spec and its instruction. */
export function resolveStep(
	step: SessionStep,
	map: ReadonlyMap<string, string>,
): { edit: Edit; instruction: string } | { unresolved: string } {
	for (const placeholder of placeholdersInEdit(step.edit)) {
		if (!map.has(placeholder)) return { unresolved: placeholder };
	}
	const swap = (value: string): string => map.get(value) ?? value;
	let instruction = step.instruction;
	for (const [placeholder, actual] of map) {
		instruction = instruction.replaceAll(`"${placeholder}"`, `"${actual}"`);
	}
	const edit = structuredClone(step.edit);
	switch (edit.kind) {
		case "set-attribute":
		case "set-name":
		case "remove-node":
			edit.nodeId = swap(edit.nodeId);
			break;
		case "insert-node":
			edit.parentId = swap(edit.parentId);
			break;
		case "move-node":
			edit.nodeId = swap(edit.nodeId);
			edit.newParentId = swap(edit.newParentId);
			break;
	}
	return { edit, instruction };
}

/** Attribute values are session-safe by construction; sanity checks for tests. */
export function validateSession(task: SessionTask): string[] {
	const problems: string[] = [];
	let state = cloneTree(task.tree);
	const sourceIds = new Set(allIds(task.tree));
	for (const step of task.steps) {
		for (const placeholder of placeholdersInEdit(step.edit)) {
			if (!findById(state, placeholder)) {
				problems.push(`${task.id} step ${step.index}: dangling ${placeholder}`);
			}
		}
		try {
			state = applyEdit(state, step.edit);
		} catch (error) {
			problems.push(
				`${task.id} step ${step.index}: inapplicable — ${String(error)}`,
			);
			break;
		}
		if (step.created && step.edit.kind === "insert-node") {
			const parent = findById(state, step.edit.parentId);
			const inserted = (parent?.children ?? [])[step.edit.index];
			if (inserted) inserted.id = step.created.placeholder;
			else problems.push(`${task.id} step ${step.index}: created node lost`);
		}
	}
	for (const id of allIds(state)) {
		if (!sourceIds.has(id) && !id.startsWith("sess-new-")) {
			problems.push(`${task.id}: unexpected new id ${id}`);
		}
	}
	return problems;
}
