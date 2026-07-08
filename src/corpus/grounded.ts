/**
 * Study L grounded references (docs/BRIEF-L.md): describe a node the
 * way a person would, with NO ids. Preference order: unique
 * (type, name); unique (type, attribute=value); ordinal position of
 * the node among same-type nodes in depth-first order within the
 * subtree of the nearest non-ordinally-describable ancestor. Every
 * ref is resolvable to exactly one node by construction; the resolver
 * lives here so tests can verify that claim for every corpus task.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { findById, walkTree } from "../tree.js";
import type { Edit } from "./edits.js";
import { formatValue, ordinal } from "./edits.js";

export type NodeRef =
	| { kind: "root" }
	| { kind: "name"; type: string; name: string }
	| { kind: "attr"; type: string; key: string; value: AttributeValue }
	| { kind: "ordinal"; type: string; nth: number; anchor: NodeRef };

function nodesOf(tree: BarkupNode): BarkupNode[] {
	const out: BarkupNode[] = [];
	walkTree(tree, ({ node }) => {
		out.push(node);
	});
	return out;
}

function primitive(value: AttributeValue): boolean {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

/** Non-ordinal ref for a node, or null when none is unique. */
function directRef(tree: BarkupNode, node: BarkupNode): NodeRef | null {
	if (node === tree) return { kind: "root" };
	const all = nodesOf(tree);
	if (node.name !== undefined) {
		const matches = all.filter(
			(n) => n.type === node.type && n.name === node.name,
		);
		if (matches.length === 1) {
			return { kind: "name", type: node.type, name: node.name };
		}
	}
	for (const [key, value] of Object.entries(node.attributes ?? {})) {
		if (!primitive(value)) continue;
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

function parentOf(tree: BarkupNode, node: BarkupNode): BarkupNode | null {
	let found: BarkupNode | null = null;
	walkTree(tree, ({ node: candidate }) => {
		if ((candidate.children ?? []).includes(node) && found === null) {
			found = candidate;
		}
	});
	return found;
}

/** Same-type descendants of anchor (excluding anchor), depth-first. */
function sameTypeWithin(anchor: BarkupNode, type: string): BarkupNode[] {
	const out: BarkupNode[] = [];
	walkTree(anchor, ({ node }) => {
		if (node !== anchor && node.type === type) out.push(node);
	});
	return out;
}

/** A ref for the node with this id; throws on unknown id (corpus bug). */
export function refFor(tree: BarkupNode, id: string): NodeRef {
	const node = findById(tree, id);
	if (!node) throw new Error(`refFor: no node "${id}" — corpus bug`);
	const direct = directRef(tree, node);
	if (direct) return direct;
	// Ordinal within the nearest directly-describable ancestor.
	let anchor = parentOf(tree, node);
	while (anchor && !directRef(tree, anchor)) {
		anchor = parentOf(tree, anchor);
	}
	const anchorNode = anchor ?? tree;
	const anchorRef = directRef(tree, anchorNode) ?? { kind: "root" as const };
	const peers = sameTypeWithin(anchorNode, node.type);
	const nth = peers.indexOf(node) + 1;
	if (nth === 0) throw new Error(`refFor: node "${id}" not under its anchor`);
	return { kind: "ordinal", type: node.type, nth, anchor: anchorRef };
}

/** All nodes matching a ref — uniqueness means length 1. */
export function resolveRef(tree: BarkupNode, ref: NodeRef): BarkupNode[] {
	switch (ref.kind) {
		case "root":
			return [tree];
		case "name":
			return nodesOf(tree).filter(
				(n) => n.type === ref.type && n.name === ref.name,
			);
		case "attr":
			return nodesOf(tree).filter(
				(n) =>
					n.type === ref.type &&
					JSON.stringify(n.attributes?.[ref.key]) === JSON.stringify(ref.value),
			);
		case "ordinal": {
			const anchors = resolveRef(tree, ref.anchor);
			if (anchors.length !== 1) return [];
			const peers = sameTypeWithin(anchors[0] as BarkupNode, ref.type);
			const node = peers[ref.nth - 1];
			return node ? [node] : [];
		}
	}
}

export function refText(ref: NodeRef): string {
	switch (ref.kind) {
		case "root":
			return "the document root";
		case "name":
			return `the ${ref.type} named "${ref.name}"`;
		case "attr":
			return `the ${ref.type} whose ${ref.key} is ${formatValue(ref.value)}`;
		case "ordinal": {
			const inside =
				ref.anchor.kind === "root"
					? "in the document"
					: `inside ${refText(ref.anchor)}`;
			return `the ${ordinal(ref.nth)} ${ref.type} ${inside}`;
		}
	}
}

/** Instruction text for an edit with grounded references instead of ids. */
export function describeGroundedEdit(tree: BarkupNode, edit: Edit): string {
	const ref = (id: string) => refText(refFor(tree, id));
	switch (edit.kind) {
		case "set-attribute":
			return `Set the "${edit.key}" attribute to ${formatValue(edit.value)} on ${ref(edit.nodeId)}.`;
		case "set-name":
			return `Rename ${ref(edit.nodeId)}: set its name to "${edit.name}".`;
		case "remove-node":
			return `Remove ${ref(edit.nodeId)} entirely (including its whole subtree, if it has one).`;
		case "insert-node": {
			const attrs = Object.entries(edit.node.attributes ?? {});
			const attrText =
				attrs.length > 0
					? ` Give it ${attrs
							.map(([key, value]) => `${key} = ${formatValue(value)}`)
							.join(", ")}.`
					: "";
			const nameText =
				edit.node.name !== undefined ? ` Name it "${edit.node.name}".` : "";
			return `Insert a new ${edit.node.type} as the ${ordinal(edit.index + 1)} child of ${ref(edit.parentId)}.${nameText}${attrText}`;
		}
		case "move-node":
			return `Move ${ref(edit.nodeId)} (with its whole subtree) so that it becomes the ${ordinal(edit.index + 1)} child of ${ref(edit.newParentId)}. Do not change the node itself.`;
	}
}

/** The ids an edit references (mirror of views.referencedIds, re-exported for L). */
export function groundedTargetIds(edit: Edit): string[] {
	switch (edit.kind) {
		case "set-attribute":
		case "set-name":
		case "remove-node":
			return [edit.nodeId];
		case "insert-node":
			return [edit.parentId];
		case "move-node":
			return [edit.nodeId, edit.newParentId];
	}
}

/** Verify a task's grounded refs resolve uniquely to their targets. */
export function validateGrounding(tree: BarkupNode, edit: Edit): string[] {
	const problems: string[] = [];
	for (const id of groundedTargetIds(edit)) {
		const ref = refFor(tree, id);
		const matches = resolveRef(tree, ref);
		if (matches.length !== 1) {
			problems.push(`ref for ${id} matches ${matches.length} nodes`);
		} else if ((matches[0] as BarkupNode).id !== id) {
			problems.push(`ref for ${id} resolves to ${matches[0]?.id}`);
		}
	}
	return problems;
}
