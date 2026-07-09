/**
 * Misgrounding-vs-mechanics failure classifier (Study L, BRIEF-L.md;
 * reused verbatim by Study N). Computed offline from a record's final
 * tree: a failed task whose patch changed an unsanctioned existing node
 * (or touched nothing when something should have changed) is a
 * misgrounding; a failed task that stayed on sanctioned nodes is a
 * mechanics failure; no final tree means the run never produced a
 * valid patch.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { groundedTargetIds } from "../corpus/grounded.js";
import type { TransformationTask } from "../corpus/tasks.js";
import type { TaskRunRecord } from "../harness/records.js";
import { findById, findParent, walkTree } from "../tree.js";

/** Existing-node ids whose identity-relevant state changed base→final. */
export function changedExistingIds(
	base: BarkupNode,
	final: BarkupNode,
): Set<string> {
	const changed = new Set<string>();
	const describe = (tree: BarkupNode, id: string): string | null => {
		const node = findById(tree, id);
		if (!node) return null;
		const parent = findParent(tree, id);
		return JSON.stringify({
			name: node.name ?? null,
			attrs: node.attributes ?? {},
			parent: parent?.parent.id ?? null,
			index: parent?.index ?? -1,
			childIds: (node.children ?? []).map((c) => c.id ?? "?"),
		});
	};
	walkTree(base, ({ node }) => {
		const id = node.id as string;
		if (describe(base, id) !== describe(final, id)) changed.add(id);
	});
	return changed;
}

/** Failure class: misgrounded (wrong node touched / target untouched) vs mechanics vs invalid. */
export function classifyGroundedFailure(
	record: TaskRunRecord,
	task: TransformationTask,
): "misgrounded" | "mechanics" | "invalid" {
	const final = record.detail?.finalTree as BarkupNode | null | undefined;
	if (!final) return "invalid";
	const expectedChanged = changedExistingIds(task.tree, task.expected);
	const actualChanged = changedExistingIds(task.tree, final);
	const expectedTargets = new Set([
		...groundedTargetIds(task.edit),
		...expectedChanged,
	]);
	for (const id of actualChanged) {
		if (!expectedTargets.has(id)) return "misgrounded";
	}
	// Touched only sanctioned nodes but still wrong (or touched nothing).
	return actualChanged.size === 0 && expectedChanged.size > 0
		? "misgrounded"
		: "mechanics";
}
