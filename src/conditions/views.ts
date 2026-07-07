/**
 * Study I — focused views (pre-registered in docs/BRIEF-I.md).
 *
 * A view shows the model only the part of the tree the edit references:
 * the spine (root-to-referenced-node paths) rendered fully, everything
 * else collapsed to id-bearing placeholders (FV) or omitted with a
 * count (FT). The patch still applies to the FULL base tree, so the
 * view is prompt-only: it changes what the model sees, never what the
 * grader checks. Children of referenced nodes always appear in order,
 * so ordinal placements ("as the 3rd child of ...") stay resolvable.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { Edit } from "../corpus/edits.js";
import { findById } from "../tree.js";
import { conditionF } from "./f.js";
import { applyShipped } from "./f2.js";
import type { PatchCondition } from "./types.js";

export type ViewMode = "focused" | "minimal";

/** Ids the edit (and its instruction text) reference — the view's focus. */
export function referencedIds(edit: Edit): string[] {
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

export function spineOf(tree: BarkupNode, ids: string[]): Set<BarkupNode> {
	const spine = new Set<BarkupNode>();
	const descend = (node: BarkupNode, targetId: string): boolean => {
		if (node.id === targetId) {
			spine.add(node);
			return true;
		}
		for (const child of node.children ?? []) {
			if (descend(child, targetId)) {
				spine.add(node);
				return true;
			}
		}
		return false;
	};
	for (const id of ids) {
		if (!findById(tree, id)) {
			throw new Error(`View focus id "${id}" not in tree — corpus bug`);
		}
		descend(tree, id);
	}
	return spine;
}

function placeholder(node: BarkupNode): Record<string, unknown> {
	const out: Record<string, unknown> = { type: node.type };
	if (node.name !== undefined) out.name = node.name;
	if (node.id !== undefined) out.id = node.id;
	out.collapsed = true;
	out.childCount = node.children?.length ?? 0;
	return out;
}

/**
 * Render the view object. Spine nodes are full; children of referenced
 * nodes are always at least placeholders; other spine children are
 * placeholders (focused) or omitted with a count (minimal).
 */
export function buildView(
	tree: BarkupNode,
	focusIds: string[],
	mode: ViewMode,
): Record<string, unknown> {
	const spine = spineOf(tree, focusIds);
	const focus = new Set(focusIds);
	const render = (node: BarkupNode): Record<string, unknown> => {
		const out: Record<string, unknown> = { type: node.type };
		if (node.name !== undefined) out.name = node.name;
		if (node.id !== undefined) out.id = node.id;
		if (node.attributes && Object.keys(node.attributes).length > 0) {
			out.attributes = node.attributes;
		}
		const children = node.children ?? [];
		if (children.length === 0) return out;
		const rendered: Record<string, unknown>[] = [];
		let omitted = 0;
		for (const child of children) {
			if (spine.has(child)) {
				rendered.push(render(child));
			} else if (focus.has(node.id as string)) {
				rendered.push(placeholder(child));
			} else if (mode === "focused") {
				rendered.push(placeholder(child));
			} else {
				omitted += 1;
			}
		}
		if (rendered.length > 0) out.children = rendered;
		if (omitted > 0) out.omittedChildren = omitted;
		return out;
	};
	return render(tree);
}

export function serializeView(
	tree: BarkupNode,
	focusIds: string[],
	mode: ViewMode,
): string {
	return `${JSON.stringify(buildView(tree, focusIds, mode), null, 2)}\n`;
}

/** Pre-registered view block appended to F's system prompt (BRIEF-I.md). */
export const VIEW_RULES = `
View rules:
- You are shown a focused view of the tree, not the whole tree. The view is centered on the nodes the edit request references. Your patch is applied to the full tree, where every hidden node still exists.
- A node with "collapsed": true is a real node shown without its contents; "childCount" is how many children it actually has.
- A node with "omittedChildren": N has N additional children that are not shown at all.
- Every visible "id" is a valid patch target. Never use an id that is not visible in the view.
- Give every node you create a fresh id unlikely to exist anywhere in the full tree (e.g. with a random-looking suffix); if it collides with a hidden node's id, the patch is rejected with a duplicate-id issue and you can correct it.`;

/**
 * A per-task condition: F's dialect and shipped applier, with the
 * prompt tree replaced by the edit's focused view.
 */
export function makeViewCondition(mode: ViewMode, edit: Edit): PatchCondition {
	const ids = referencedIds(edit);
	return {
		...conditionF,
		id: mode === "focused" ? "FV" : "FT",
		systemPrompt: conditionF.systemPrompt + VIEW_RULES,
		serialize: (tree) => serializeView(tree, ids, mode),
		applyArtifact: applyShipped,
	};
}
