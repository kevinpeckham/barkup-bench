/**
 * Study U dependent-edit corpus (docs/BRIEF-U.md): single-turn edits
 * whose correct value must be READ from a second node in the same
 * document — never stated in the instruction, never visible in a
 * minimal view of the target. Two kinds:
 *
 * - value-copy: copy an attribute between two same-type nodes; both
 *   nodes referenced by id (grounding deliberately solved).
 * - structure-read: rename A to B's name, with B referenced by a
 *   unique (type, attribute = value) pair — never by the name that
 *   is the answer.
 *
 * Validation renders the target-only minimal view and asserts the
 * needed value is absent, so the U-view1 arm cannot succeed by
 * coincidence, and renders the both-nodes view asserting the value
 * IS present, so the U-view2 arm is possible by construction.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { serializeView } from "../conditions/views.js";
import { findById, walkTree } from "../tree.js";
import type { Edit } from "./edits.js";
import { applyEdit, nodeRef } from "./edits.js";
import type { NodeRef } from "./grounded.js";
import { refText, resolveRef } from "./grounded.js";
import type { Rng } from "./rng.js";
import type { TransformationTask } from "./tasks.js";

export type DepKind = "value" | "structure";

export interface DependentTask extends TransformationTask {
	depKind: DepKind;
	targetId: string;
	sourceId: string;
	/** structure-read only: the registered name-free reference to B. */
	sourceRef?: NodeRef;
	/** The value the model must read from the source node. */
	needle: string;
}

/** Pre-registered high-entropy keys for value-copy (BRIEF-U.md). */
export const COPY_KEYS: Record<string, string[]> = {
	"text-atom": ["content"],
	"image-atom": ["src"],
	block: ["containerClasses"],
};

function idNodes(tree: BarkupNode): BarkupNode[] {
	const out: BarkupNode[] = [];
	walkTree(tree, ({ node }) => {
		if (node.id !== undefined) out.push(node);
	});
	return out;
}

/** A unique (type, primitive attribute = value) ref for B, or null. */
function attrRefFor(tree: BarkupNode, node: BarkupNode): NodeRef | null {
	const all = idNodes(tree);
	for (const [key, value] of Object.entries(node.attributes ?? {})) {
		if (
			typeof value !== "string" &&
			typeof value !== "number" &&
			typeof value !== "boolean"
		) {
			continue;
		}
		const matches = all.filter(
			(n) =>
				n.type === node.type &&
				JSON.stringify(n.attributes?.[key]) === JSON.stringify(value),
		);
		if (matches.length === 1) {
			return { kind: "attr", type: node.type, key, value };
		}
	}
	return null;
}

function tryValueCopy(tree: BarkupNode, rng: Rng): DependentTask | null {
	const nodes = idNodes(tree);
	const candidates: { a: BarkupNode; b: BarkupNode; key: string }[] = [];
	for (const [type, keys] of Object.entries(COPY_KEYS)) {
		const ofType = nodes.filter((n) => n.type === type);
		for (const key of keys) {
			const withKey = ofType.filter(
				(n) => typeof n.attributes?.[key] === "string",
			);
			for (const b of withKey) {
				for (const a of ofType) {
					if (a === b) continue;
					if (
						JSON.stringify(a.attributes?.[key]) ===
						JSON.stringify(b.attributes?.[key])
					) {
						continue;
					}
					candidates.push({ a, b, key });
				}
			}
		}
	}
	if (candidates.length === 0) return null;
	const pick = rng.pick(candidates);
	const value = pick.b.attributes?.[pick.key] as AttributeValue;
	const edit: Edit = {
		kind: "set-attribute",
		nodeId: pick.a.id as string,
		key: pick.key,
		value,
	};
	const instruction = `Set the "${pick.key}" attribute of ${nodeRef(tree, pick.a.id as string)} to the same value as the "${pick.key}" attribute of ${nodeRef(tree, pick.b.id as string)}. Copy the value exactly.`;
	return {
		id: "",
		family: "transformation",
		bucket: "xl",
		tree,
		edit,
		instruction,
		expected: applyEdit(tree, edit),
		depKind: "value",
		targetId: pick.a.id as string,
		sourceId: pick.b.id as string,
		needle: String(value),
	};
}

function tryStructureRead(tree: BarkupNode, rng: Rng): DependentTask | null {
	const nodes = idNodes(tree);
	const candidates: { a: BarkupNode; b: BarkupNode; ref: NodeRef }[] = [];
	for (const b of nodes) {
		if (b.name === undefined) continue;
		const ref = attrRefFor(tree, b);
		if (!ref) continue;
		for (const a of nodes) {
			if (a === b || a.name === b.name) continue;
			candidates.push({ a, b, ref });
		}
	}
	if (candidates.length === 0) return null;
	const pick = rng.pick(candidates);
	const edit: Edit = {
		kind: "set-name",
		nodeId: pick.a.id as string,
		name: pick.b.name as string,
	};
	const instruction = `Rename ${nodeRef(tree, pick.a.id as string)}: set its name to exactly the name of ${refText(pick.ref)}.`;
	return {
		id: "",
		family: "transformation",
		bucket: "xl",
		tree,
		edit,
		instruction,
		expected: applyEdit(tree, edit),
		depKind: "structure",
		targetId: pick.a.id as string,
		sourceId: pick.b.id as string,
		sourceRef: pick.ref,
		needle: pick.b.name as string,
	};
}

/** Generate one dependent task of the given kind; retries seeded picks
 * until validation passes (throws after `attempts` — corpus bug). */
export function generateDependentTask(
	tree: BarkupNode,
	rng: Rng,
	kind: DepKind,
	attempts = 40,
): DependentTask {
	for (let i = 0; i < attempts; i += 1) {
		const task =
			kind === "value" ? tryValueCopy(tree, rng) : tryStructureRead(tree, rng);
		if (task && validateDependentTask(task).length === 0) return task;
	}
	throw new Error(`no valid ${kind} dependent task for tree — corpus bug`);
}

/** The no-leakage guarantees BRIEF-U pre-registers, per task. */
export function validateDependentTask(task: DependentTask): string[] {
	const problems: string[] = [];

	if (task.targetId === task.sourceId) problems.push("A equals B");
	if (task.instruction.includes(task.needle)) {
		problems.push("instruction leaks the needle");
	}
	const view1 = serializeView(task.tree, [task.targetId], "minimal");
	if (view1.includes(task.needle)) {
		problems.push("target-only view shows the needle");
	}
	const view2 = serializeView(
		task.tree,
		[task.targetId, task.sourceId],
		"minimal",
	);
	if (!view2.includes(task.needle)) {
		problems.push("both-nodes view does NOT show the needle");
	}
	if (JSON.stringify(task.expected) === JSON.stringify(task.tree)) {
		problems.push("edit changes nothing");
	}
	if (task.depKind === "structure") {
		if (!task.sourceRef) {
			problems.push("structure task missing sourceRef");
		} else {
			const matches = resolveRef(task.tree, task.sourceRef);
			if (matches.length !== 1 || matches[0]?.id !== task.sourceId) {
				problems.push("source ref does not resolve uniquely to B");
			}
		}
	}
	if (!findById(task.tree, task.targetId)) problems.push("A not in tree");
	if (!findById(task.tree, task.sourceId)) problems.push("B not in tree");
	return problems;
}
