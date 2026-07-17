/**
 * Study AJ seeded-failure corpus (docs/BRIEF-AJ.md): for each
 * size-extension task, the known-correct anchored patch (derived
 * from the corpus edit and validated against the expected tree) and
 * a corrupted twin produced by a registered operator from the
 * kind × class matrix. Validators assert the correct patch applies
 * and equals expected, and the corrupted patch fails the SHIPPED
 * applier with at least one issue.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { applyShipped } from "../conditions/f2.js";
import { equalModuloNewIds } from "../grading/equal.js";
import { allIds, findById } from "../tree.js";
import type { Edit } from "./edits.js";
import type { BucketName } from "./trees.js";

export type CorruptionClass =
	| "dangling-id"
	| "bad-anchor"
	| "malformed-op"
	| "missing-field"
	| "unknown-attribute";

/** Registered kind × class matrix (BRIEF-AJ.md), cycled in corpus order. */
export const CORRUPTION_MATRIX: Record<string, CorruptionClass[]> = {
	"set-attribute": ["dangling-id", "missing-field", "unknown-attribute"],
	"set-name": ["dangling-id", "missing-field", "malformed-op"],
	"remove-node": ["dangling-id", "malformed-op", "missing-field"],
	"insert-node": ["dangling-id", "bad-anchor", "malformed-op"],
	"move-node": ["dangling-id", "bad-anchor", "missing-field"],
};

export const DANGLING_ID = "n999999";
export const UNKNOWN_ATTRIBUTE = "zzUnknownAttr";
export const MALFORMED_OP_KIND = "update-node";

export interface SeededTask {
	id: string;
	family: "transformation";
	bucket: BucketName;
	editKind: Edit["kind"];
	corruption: CorruptionClass;
	tree: BarkupNode;
	instruction: string;
	focusIds: string[];
	expected: BarkupNode;
	/** Single-op anchored patch, validated to apply and match expected. */
	correctPatch: Record<string, unknown>[];
	/** The registered corruption of correctPatch — fails the applier. */
	corruptedPatch: Record<string, unknown>[];
}

type Op = Record<string, unknown>;

/** Placement candidates for an index within a parent's children. */
function placements(
	parent: BarkupNode,
	index: number,
): Record<string, unknown>[] {
	const siblings = parent.children ?? [];
	const out: Record<string, unknown>[] = [];
	const at = siblings[index];
	if (at?.id !== undefined) out.push({ before: at.id });
	const prev = siblings[index - 1];
	if (prev?.id !== undefined) out.push({ after: prev.id });
	out.push({ parentId: parent.id });
	return out;
}

/** The correct single-op patch for an edit, validated by the caller. */
export function opCandidates(tree: BarkupNode, edit: Edit): Op[] {
	switch (edit.kind) {
		case "set-attribute":
			return [
				{
					op: "set-attribute",
					id: edit.nodeId,
					key: edit.key,
					value: edit.value,
				},
			];
		case "set-name":
			return [{ op: "set-name", id: edit.nodeId, name: edit.name }];
		case "remove-node":
			return [{ op: "remove", id: edit.nodeId }];
		case "insert-node": {
			const parent = findById(tree, edit.parentId);
			if (!parent) return [];
			const node = { ...edit.node, id: "n900001" };
			return placements(parent, edit.index).map((p) => ({
				op: "insert",
				node,
				...p,
			}));
		}
		case "move-node": {
			const parent = findById(tree, edit.newParentId);
			if (!parent) return [];
			return placements(parent, edit.index).map((p) => ({
				op: "move",
				id: edit.nodeId,
				...p,
			}));
		}
	}
}

/** Pick the first candidate op that applies and matches expected. */
export function correctOpFor(
	tree: BarkupNode,
	edit: Edit,
	expected: BarkupNode,
): Op | null {
	for (const op of opCandidates(tree, edit)) {
		const applied = applyShipped(JSON.stringify([op]), tree);
		if (
			applied.ok &&
			equalModuloNewIds(expected, applied.node, new Set(allIds(tree)))
		) {
			return op;
		}
	}
	return null;
}

/** Apply the registered corruption class to a correct op. */
export function corruptOp(
	op: Op,
	corruption: CorruptionClass,
	tree: BarkupNode,
): Op {
	const out: Op = { ...op };
	switch (corruption) {
		case "dangling-id": {
			// Replace the op's primary node reference with a nonexistent id.
			if ("id" in out) out.id = DANGLING_ID;
			else if ("parentId" in out) out.parentId = DANGLING_ID;
			else if ("before" in out) out.before = DANGLING_ID;
			else if ("after" in out) out.after = DANGLING_ID;
			return out;
		}
		case "bad-anchor": {
			// Replace the placement with an anchor that is never a sibling:
			// the tree root (no parent, so it has no siblings anywhere).
			delete out.parentId;
			delete out.after;
			out.before = tree.id;
			return out;
		}
		case "malformed-op":
			out.op = MALFORMED_OP_KIND;
			return out;
		case "missing-field": {
			if ("value" in out) delete out.value;
			else if ("name" in out) delete out.name;
			else if (out.op === "move") {
				delete out.parentId;
				delete out.before;
				delete out.after;
			} else if ("id" in out) delete out.id;
			return out;
		}
		case "unknown-attribute":
			out.key = UNKNOWN_ATTRIBUTE;
			return out;
	}
}

export function validateSeededTask(task: SeededTask): string[] {
	const problems: string[] = [];
	const base = new Set(allIds(task.tree));
	const correct = applyShipped(JSON.stringify(task.correctPatch), task.tree);
	if (!correct.ok) {
		problems.push("correct patch does not apply");
	} else if (!equalModuloNewIds(task.expected, correct.node, base)) {
		problems.push("correct patch does not match expected");
	}
	const corrupted = applyShipped(
		JSON.stringify(task.corruptedPatch),
		task.tree,
	);
	if (corrupted.ok) {
		problems.push("corrupted patch APPLIED — corruption is not a failure");
	} else if (corrupted.issues.length === 0) {
		problems.push("corrupted patch failed without issues");
	}
	if (
		JSON.stringify(task.correctPatch) === JSON.stringify(task.corruptedPatch)
	) {
		problems.push("corruption is a no-op");
	}
	return problems;
}
