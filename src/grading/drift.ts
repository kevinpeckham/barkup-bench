/**
 * Drift: how many nodes changed that the edit did not call for.
 *
 * We index every source-tree node (by its id — corpus trees have ids on
 * every node) with a content+position signature, compute the set of
 * source nodes changed between source→expected and source→actual, and
 * count the changes the model made that the ground-truth edit does not
 * contain. New nodes (ids not from the source tree) are compared by
 * count. This is a pragmatic node-level approximation, unit-tested in
 * tests/grading.test.ts.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { allIds, walkTree } from "../tree.js";

function signatures(
	root: BarkupNode,
	sourceIds: ReadonlySet<string>,
): Map<string, string> {
	const map = new Map<string, string>();
	walkTree(root, ({ node, parent }) => {
		if (node.id === undefined || !sourceIds.has(node.id)) return;
		const siblings = (parent?.children ?? []).filter(
			(child) => child.id !== undefined && sourceIds.has(child.id),
		);
		const orderIndex = siblings.indexOf(node);
		map.set(
			node.id,
			JSON.stringify({
				type: node.type,
				name: node.name ?? null,
				attributes: canonicalAttributes(node.attributes),
				parent:
					parent === null
						? null
						: parent.id !== undefined && sourceIds.has(parent.id)
							? parent.id
							: "(new)",
				orderIndex,
			}),
		);
	});
	return map;
}

function canonicalAttributes(
	attributes: BarkupNode["attributes"],
): Record<string, unknown> {
	const entries = Object.entries(attributes ?? {}).sort(([a], [b]) =>
		a < b ? -1 : 1,
	);
	return Object.fromEntries(entries);
}

function changedIds(
	source: Map<string, string>,
	result: Map<string, string>,
): Set<string> {
	const changed = new Set<string>();
	for (const [id, sig] of source) {
		if (result.get(id) !== sig) changed.add(id);
	}
	return changed;
}

function newNodeCount(
	root: BarkupNode,
	sourceIds: ReadonlySet<string>,
): number {
	let count = 0;
	walkTree(root, ({ node }) => {
		if (node.id === undefined || !sourceIds.has(node.id)) count += 1;
	});
	return count;
}

/**
 * Count of node-level changes present in `actual` but not called for by
 * the edit (i.e. not present in `expected`), plus the absolute
 * new-node-count mismatch.
 */
export function driftCount(
	source: BarkupNode,
	expected: BarkupNode,
	actual: BarkupNode,
): number {
	const sourceIds = new Set(allIds(source));
	const sourceSigs = signatures(source, sourceIds);
	const expectedChanged = changedIds(
		sourceSigs,
		signatures(expected, sourceIds),
	);
	const actualChanged = changedIds(sourceSigs, signatures(actual, sourceIds));

	let drift = 0;
	for (const id of actualChanged) {
		if (!expectedChanged.has(id)) drift += 1;
	}
	drift += Math.abs(
		newNodeCount(actual, sourceIds) - newNodeCount(expected, sourceIds),
	);
	return drift;
}
