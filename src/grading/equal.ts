/**
 * Tree-equality graders. All comparisons go through barkup's nodesEqual
 * (normalized, key-order-insensitive, child-order-sensitive), with id
 * handling layered on top:
 *
 * - construction: ALL ids erased (every id in a built-from-scratch tree
 *   is generated, so ids are not part of the task's meaning);
 * - transformation: ids the model INVENTED (not present in the source
 *   tree) are erased on both sides — the model cannot predict the ids we
 *   gave new ground-truth nodes — while source-tree ids must match
 *   exactly (preserving existing ids IS part of the task);
 * - reference step 2: exact equality (id stability is the hypothesis).
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { nodesEqual } from "@kevinpeckham/barkup/testing";
import { cloneTree, walkTree } from "../tree.js";

export function eraseIdsExcept(
	root: BarkupNode,
	keep: ReadonlySet<string>,
): BarkupNode {
	const copy = cloneTree(root);
	walkTree(copy, ({ node }) => {
		if (node.id !== undefined && !keep.has(node.id)) {
			delete node.id;
		}
	});
	return copy;
}

export function eraseAllIds(root: BarkupNode): BarkupNode {
	return eraseIdsExcept(root, new Set());
}

/** Construction: semantic equivalence modulo every id. */
export function equalModuloAllIds(a: BarkupNode, b: BarkupNode): boolean {
	return nodesEqual(eraseAllIds(a), eraseAllIds(b));
}

/** Transformation: new-node ids are free; source ids must be preserved. */
export function equalModuloNewIds(
	expected: BarkupNode,
	actual: BarkupNode,
	sourceIds: ReadonlySet<string>,
): boolean {
	return nodesEqual(
		eraseIdsExcept(expected, sourceIds),
		eraseIdsExcept(actual, sourceIds),
	);
}

/** Reference step 2: everything, including ids, must match. */
export function equalExact(a: BarkupNode, b: BarkupNode): boolean {
	return nodesEqual(a, b);
}
