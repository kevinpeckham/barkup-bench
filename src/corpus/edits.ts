/**
 * Edit operations for transformation tasks: a typed edit, a programmatic
 * application (ground truth is computed, never authored), and a
 * deterministic natural-language description (templated — no model in the
 * loop, so the corpus is reproducible and the phrasing is identical
 * across conditions).
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { BENCH_CONFIG } from "../grammar.js";
import {
	cloneTree,
	descendants,
	findById,
	findParent,
	walkTree,
} from "../tree.js";
import { generateAttributeValue, slug } from "./humanize.js";
import type { Rng } from "./rng.js";

export type Edit =
	| {
			kind: "set-attribute";
			nodeId: string;
			key: string;
			value: AttributeValue;
	  }
	| { kind: "set-name"; nodeId: string; name: string }
	| { kind: "remove-node"; nodeId: string }
	| {
			kind: "insert-node";
			parentId: string;
			index: number;
			/** The node to insert — no id; ids of new nodes are assigned by whoever performs the edit. */
			node: BarkupNode;
	  }
	| { kind: "move-node"; nodeId: string; newParentId: string; index: number };

/** Apply an edit, returning a fresh tree. Throws on an inapplicable edit — corpus bugs must be loud. */
export function applyEdit(root: BarkupNode, edit: Edit): BarkupNode {
	const tree = cloneTree(root);
	switch (edit.kind) {
		case "set-attribute": {
			const node = mustFind(tree, edit.nodeId);
			node.attributes = { ...(node.attributes ?? {}), [edit.key]: edit.value };
			return tree;
		}
		case "set-name": {
			const node = mustFind(tree, edit.nodeId);
			node.name = edit.name;
			return tree;
		}
		case "remove-node": {
			const located = findParent(tree, edit.nodeId);
			if (!located)
				throw new Error(`remove-node: no parent for ${edit.nodeId}`);
			located.parent.children?.splice(located.index, 1);
			if (located.parent.children?.length === 0) {
				delete located.parent.children;
			}
			return tree;
		}
		case "insert-node": {
			const parent = mustFind(tree, edit.parentId);
			const children = parent.children ?? [];
			if (edit.index < 0 || edit.index > children.length) {
				throw new Error(`insert-node: index ${edit.index} out of range`);
			}
			children.splice(edit.index, 0, cloneTree(edit.node));
			parent.children = children;
			return tree;
		}
		case "move-node": {
			const located = findParent(tree, edit.nodeId);
			if (!located) throw new Error(`move-node: no parent for ${edit.nodeId}`);
			const [node] = located.parent.children?.splice(located.index, 1) ?? [];
			if (!node) throw new Error(`move-node: node ${edit.nodeId} not found`);
			if (located.parent.children?.length === 0) {
				delete located.parent.children;
			}
			const target = mustFind(tree, edit.newParentId);
			const children = target.children ?? [];
			if (edit.index < 0 || edit.index > children.length) {
				throw new Error(`move-node: index ${edit.index} out of range`);
			}
			children.splice(edit.index, 0, node);
			target.children = children;
			return tree;
		}
	}
}

function mustFind(tree: BarkupNode, id: string): BarkupNode {
	const node = findById(tree, id);
	if (!node) throw new Error(`Node "${id}" not found`);
	return node;
}

function ordinal(n: number): string {
	const suffix =
		n % 100 >= 11 && n % 100 <= 13
			? "th"
			: n % 10 === 1
				? "st"
				: n % 10 === 2
					? "nd"
					: n % 10 === 3
						? "rd"
						: "th";
	return `${n}${suffix}`;
}

function formatValue(value: AttributeValue): string {
	if (typeof value === "string") return `"${value}"`;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return JSON.stringify(value);
}

function nodeRef(tree: BarkupNode, id: string): string {
	const node = mustFind(tree, id);
	const name = node.name !== undefined ? ` (named "${node.name}")` : "";
	return `the ${node.type} with id "${id}"${name}`;
}

/** Deterministic instruction text for an edit against a given tree. */
export function describeEdit(tree: BarkupNode, edit: Edit): string {
	switch (edit.kind) {
		case "set-attribute":
			return `Set the "${edit.key}" attribute to ${formatValue(edit.value)} on ${nodeRef(tree, edit.nodeId)}.`;
		case "set-name":
			return `Rename ${nodeRef(tree, edit.nodeId)}: set its name to "${edit.name}".`;
		case "remove-node":
			return `Remove ${nodeRef(tree, edit.nodeId)} entirely (including its whole subtree, if it has one).`;
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
			return `Insert a new ${edit.node.type} as the ${ordinal(edit.index + 1)} child of ${nodeRef(tree, edit.parentId)}.${nameText}${attrText}`;
		}
		case "move-node":
			return `Move ${nodeRef(tree, edit.nodeId)} (with its whole subtree) so that it becomes the ${ordinal(edit.index + 1)} child of ${nodeRef(tree, edit.newParentId)}. Do not change the node itself.`;
	}
}

const CONTAINER_TYPES = new Set(
	Object.entries(BENCH_CONFIG.nodes)
		.filter(([, spec]) => (spec.children ?? []).length > 0)
		.map(([type]) => type),
);

function allowedChildren(type: string): readonly string[] {
	return BENCH_CONFIG.nodes[type]?.children ?? [];
}

/** A small new node of an allowed child type, with realistic attributes. */
export function buildNewNode(
	rng: Rng,
	childType: string,
	options: { named?: boolean } = {},
): BarkupNode {
	const node: BarkupNode = { type: childType };
	if (options.named ?? rng.chance(0.5)) node.name = slug(rng);
	const attributes: Record<string, AttributeValue> = {};
	const declared = BENCH_CONFIG.nodes[childType]?.attributes ?? {};
	for (const [key, spec] of Object.entries(declared)) {
		if (spec.required || rng.chance(0.4)) {
			attributes[key] = generateAttributeValue(rng, childType, key);
		}
	}
	if (Object.keys(attributes).length > 0) node.attributes = attributes;
	return node;
}

/**
 * Generate a random applicable edit for the tree. When `preferredKind`
 * is given it is tried first (the pilot cycles kinds across tasks so
 * every edit kind's grading gets exercised); remaining kinds are tried
 * in seeded order, so every tree yields an edit deterministically.
 */
export function generateEdit(
	tree: BarkupNode,
	rng: Rng,
	preferredKind?: Edit["kind"],
): Edit {
	const kinds: Edit["kind"][] = [
		"set-attribute",
		"set-name",
		"remove-node",
		"insert-node",
		"move-node",
	];
	// Seeded shuffle for kind preference.
	for (let i = kinds.length - 1; i > 0; i -= 1) {
		const j = rng.int(0, i);
		const a = kinds[i] as Edit["kind"];
		kinds[i] = kinds[j] as Edit["kind"];
		kinds[j] = a;
	}
	if (preferredKind !== undefined) {
		kinds.unshift(preferredKind);
	}
	for (const kind of kinds) {
		const edit = tryGenerate(tree, rng, kind);
		if (edit) return edit;
	}
	throw new Error("No applicable edit for tree — corpus bug");
}

function tryGenerate(
	tree: BarkupNode,
	rng: Rng,
	kind: Edit["kind"],
): Edit | null {
	const nodes: BarkupNode[] = [];
	walkTree(tree, ({ node }) => {
		nodes.push(node);
	});

	switch (kind) {
		case "set-attribute": {
			const candidates = nodes.filter(
				(n) =>
					Object.keys(BENCH_CONFIG.nodes[n.type]?.attributes ?? {}).length > 0,
			);
			if (candidates.length === 0) return null;
			const node = rng.pick(candidates);
			const keys = Object.keys(BENCH_CONFIG.nodes[node.type]?.attributes ?? {});
			const key = rng.pick(keys);
			let value = generateAttributeValue(rng, node.type, key);
			// Ensure the edit actually changes something.
			for (
				let attempts = 0;
				attempts < 10 &&
				JSON.stringify(value) === JSON.stringify(node.attributes?.[key]);
				attempts += 1
			) {
				value = generateAttributeValue(rng, node.type, key);
			}
			if (JSON.stringify(value) === JSON.stringify(node.attributes?.[key])) {
				return null;
			}
			return {
				kind: "set-attribute",
				nodeId: node.id as string,
				key,
				value,
			};
		}
		case "set-name": {
			const node = rng.pick(nodes);
			let name = slug(rng);
			while (name === node.name) name = slug(rng);
			return { kind: "set-name", nodeId: node.id as string, name };
		}
		case "remove-node": {
			const candidates = nodes.filter((n) => n !== tree);
			if (candidates.length === 0) return null;
			const node = rng.pick(candidates);
			return { kind: "remove-node", nodeId: node.id as string };
		}
		case "insert-node": {
			const parents = nodes.filter((n) => CONTAINER_TYPES.has(n.type));
			if (parents.length === 0) return null;
			const parent = rng.pick(parents);
			const childType = rng.pick(allowedChildren(parent.type));
			const node = buildNewNode(rng, childType);
			const index = rng.int(0, (parent.children ?? []).length);
			return {
				kind: "insert-node",
				parentId: parent.id as string,
				index,
				node,
			};
		}
		case "move-node": {
			const movable: { nodeId: string; newParentId: string }[] = [];
			for (const node of nodes) {
				if (node === tree) continue;
				const currentParent = findParent(tree, node.id as string);
				for (const target of nodes) {
					if (target === node) continue;
					if (target === currentParent?.parent) continue;
					if (!allowedChildren(target.type).includes(node.type)) continue;
					// A node cannot move into its own subtree.
					if (descendants(node).includes(target)) continue;
					movable.push({
						nodeId: node.id as string,
						newParentId: target.id as string,
					});
				}
			}
			if (movable.length === 0) return null;
			const choice = rng.pick(movable);
			const target = findById(tree, choice.newParentId) as BarkupNode;
			const index = rng.int(0, (target.children ?? []).length);
			return { kind: "move-node", ...choice, index };
		}
	}
}
