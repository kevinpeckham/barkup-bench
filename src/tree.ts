/**
 * Pure tree utilities over BarkupNode. Everything here is side-effect
 * free: functions that "modify" return fresh copies.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";

export interface TreeVisit {
	node: BarkupNode;
	parent: BarkupNode | null;
	/** Index within the parent's children (0 for the root). */
	index: number;
	depth: number;
}

export function walkTree(
	root: BarkupNode,
	fn: (visit: TreeVisit) => void,
): void {
	const stack: TreeVisit[] = [{ node: root, parent: null, index: 0, depth: 0 }];
	while (stack.length > 0) {
		const visit = stack.shift() as TreeVisit;
		fn(visit);
		const children = visit.node.children ?? [];
		children.forEach((child, index) => {
			stack.push({
				node: child,
				parent: visit.node,
				index,
				depth: visit.depth + 1,
			});
		});
	}
}

export function cloneTree(root: BarkupNode): BarkupNode {
	return structuredClone(root);
}

export function countNodes(root: BarkupNode): number {
	let count = 0;
	walkTree(root, () => {
		count += 1;
	});
	return count;
}

export function findById(root: BarkupNode, id: string): BarkupNode | null {
	let found: BarkupNode | null = null;
	walkTree(root, ({ node }) => {
		if (node.id === id && found === null) found = node;
	});
	return found;
}

export function findParent(
	root: BarkupNode,
	id: string,
): { parent: BarkupNode; index: number } | null {
	let found: { parent: BarkupNode; index: number } | null = null;
	walkTree(root, ({ node, parent, index }) => {
		if (node.id === id && parent !== null && found === null) {
			found = { parent, index };
		}
	});
	return found;
}

export function allIds(root: BarkupNode): string[] {
	const ids: string[] = [];
	walkTree(root, ({ node }) => {
		if (node.id !== undefined) ids.push(node.id);
	});
	return ids;
}

export function collectByType(root: BarkupNode, type: string): BarkupNode[] {
	const nodes: BarkupNode[] = [];
	walkTree(root, ({ node }) => {
		if (node.type === type) nodes.push(node);
	});
	return nodes;
}

/** Nodes of the subtree rooted at `node`, excluding `node` itself. */
export function descendants(node: BarkupNode): BarkupNode[] {
	const out: BarkupNode[] = [];
	walkTree(node, ({ node: n }) => {
		if (n !== node) out.push(n);
	});
	return out;
}

export function isAncestorOf(
	root: BarkupNode,
	ancestorId: string,
	nodeId: string,
): boolean {
	const ancestor = findById(root, ancestorId);
	if (!ancestor) return false;
	return descendants(ancestor).some((n) => n.id === nodeId);
}

function pathSegment(type: string, name?: string): string {
	return name !== undefined ? `${type}(${name})` : type;
}

/** barkup-style human path from the root, e.g. `document > page(main) > block`. */
export function pathToNode(root: BarkupNode, id: string): string | null {
	const walk = (node: BarkupNode, prefix: string): string | null => {
		const path = prefix
			? `${prefix} > ${pathSegment(node.type, node.name)}`
			: pathSegment(node.type, node.name);
		if (node.id === id) return path;
		for (const child of node.children ?? []) {
			const found = walk(child, path);
			if (found) return found;
		}
		return null;
	};
	return walk(root, "");
}

/**
 * Return a copy in which every node missing an id gets a sequential one
 * (`n1`, `n2`, … in document order), skipping ids already present.
 */
export function assignSequentialIds(root: BarkupNode): BarkupNode {
	const copy = cloneTree(root);
	const taken = new Set(allIds(copy));
	let counter = 1;
	walkTree(copy, ({ node }) => {
		if (node.id === undefined) {
			while (taken.has(`n${counter}`)) counter += 1;
			node.id = `n${counter}`;
			taken.add(node.id);
		}
	});
	return copy;
}
