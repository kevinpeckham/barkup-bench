/**
 * Condition F — id-anchored patches (pre-registered in docs/BRIEF-F.md).
 *
 * Like E, the artifact is a patch against a base tree; unlike E, every
 * operation addresses nodes by id — insert/move anchor to a sibling id
 * (`before`/`after`, parent derived) or append into `parentId`. No
 * positional indexes exist in the dialect, testing whether E's
 * large-tree collapse is caused by path arithmetic.
 *
 * Application is atomic (any failing op rejects the whole patch, with
 * the op index in the issue) and the result passes the same twin
 * validation as the other JSON arms.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { BENCH_CONFIG } from "../grammar.js";
import { cloneTree, descendants, findById, findParent } from "../tree.js";
import { validateJsonValue } from "../twin/validate.js";
import {
	extractArtifact,
	formatSection,
	readingSystemPrompt,
	serializeJsonTree,
} from "./shared.js";
import type { ArtifactResult, BenchIssue, PatchCondition } from "./types.js";

interface RawOp {
	op?: unknown;
	id?: unknown;
	key?: unknown;
	value?: unknown;
	name?: unknown;
	node?: unknown;
	parentId?: unknown;
	before?: unknown;
	after?: unknown;
}

function fail(index: number, message: string): BenchIssue {
	return {
		code: "invalid-patch",
		message: `Operation ${index}: ${message}`,
		path: `(patch op ${index})`,
	};
}

function mustNode(
	tree: BarkupNode,
	id: unknown,
	index: number,
	role: string,
): BarkupNode | BenchIssue {
	if (typeof id !== "string") {
		return fail(index, `"${role}" must be a node id string.`);
	}
	const node = findById(tree, id);
	if (!node) {
		return fail(index, `No node with id "${id}" exists in the tree.`);
	}
	return node;
}

/**
 * Resolve an anchor spec to a concrete (parent, index) placement.
 * Exactly one of before/after/parentId must be provided; before/after
 * derive the parent from the sibling.
 */
function resolvePlacement(
	tree: BarkupNode,
	op: RawOp,
	index: number,
): { parent: BarkupNode; at: number } | BenchIssue {
	const anchors = [op.before, op.after, op.parentId].filter(
		(a) => a !== undefined,
	);
	if (anchors.length !== 1) {
		return fail(
			index,
			'provide exactly one placement anchor: "before" or "after" (a sibling id) or "parentId" (append as last child).',
		);
	}
	if (op.before !== undefined || op.after !== undefined) {
		const siblingId = op.before ?? op.after;
		const sibling = mustNode(
			tree,
			siblingId,
			index,
			op.before !== undefined ? "before" : "after",
		);
		if (!("type" in sibling)) return sibling;
		const located = findParent(tree, sibling.id as string);
		if (!located) {
			return fail(
				index,
				`Node "${sibling.id}" is the root and cannot anchor a sibling placement.`,
			);
		}
		return {
			parent: located.parent,
			at: op.before !== undefined ? located.index : located.index + 1,
		};
	}
	const parent = mustNode(tree, op.parentId, index, "parentId");
	if (!("type" in parent)) return parent;
	return { parent, at: (parent.children ?? []).length };
}

function applyOps(
	tree: BarkupNode,
	ops: RawOp[],
): { ok: true } | { ok: false; issue: BenchIssue } {
	for (let i = 0; i < ops.length; i += 1) {
		const op = ops[i] as RawOp;
		if (op === null || typeof op !== "object" || Array.isArray(op)) {
			return { ok: false, issue: fail(i, "each operation must be an object.") };
		}
		switch (op.op) {
			case "set-attribute": {
				const node = mustNode(tree, op.id, i, "id");
				if (!("type" in node)) return { ok: false, issue: node };
				if (typeof op.key !== "string") {
					return { ok: false, issue: fail(i, '"key" must be a string.') };
				}
				if (op.value === undefined) {
					return { ok: false, issue: fail(i, '"value" is required.') };
				}
				node.attributes = {
					...(node.attributes ?? {}),
					[op.key]: op.value as never,
				};
				break;
			}
			case "remove-attribute": {
				const node = mustNode(tree, op.id, i, "id");
				if (!("type" in node)) return { ok: false, issue: node };
				if (
					typeof op.key !== "string" ||
					!(op.key in (node.attributes ?? {}))
				) {
					return {
						ok: false,
						issue: fail(
							i,
							`attribute "${String(op.key)}" is not present on node "${node.id}".`,
						),
					};
				}
				if (node.attributes) {
					delete node.attributes[op.key];
					if (Object.keys(node.attributes).length === 0) {
						delete node.attributes;
					}
				}
				break;
			}
			case "set-name": {
				const node = mustNode(tree, op.id, i, "id");
				if (!("type" in node)) return { ok: false, issue: node };
				if (typeof op.name !== "string") {
					return { ok: false, issue: fail(i, '"name" must be a string.') };
				}
				node.name = op.name;
				break;
			}
			case "remove": {
				const node = mustNode(tree, op.id, i, "id");
				if (!("type" in node)) return { ok: false, issue: node };
				if (node === tree) {
					return {
						ok: false,
						issue: fail(i, "the root node cannot be removed."),
					};
				}
				const located = findParent(tree, node.id as string);
				if (!located) {
					return { ok: false, issue: fail(i, `No node with id "${node.id}".`) };
				}
				located.parent.children?.splice(located.index, 1);
				if (located.parent.children?.length === 0) {
					delete located.parent.children;
				}
				break;
			}
			case "insert": {
				if (
					op.node === null ||
					typeof op.node !== "object" ||
					Array.isArray(op.node)
				) {
					return {
						ok: false,
						issue: fail(i, '"node" must be a node object.'),
					};
				}
				const placement = resolvePlacement(tree, op, i);
				if (!("parent" in placement)) return { ok: false, issue: placement };
				const children = placement.parent.children ?? [];
				children.splice(
					placement.at,
					0,
					structuredClone(op.node) as BarkupNode,
				);
				placement.parent.children = children;
				break;
			}
			case "move": {
				const node = mustNode(tree, op.id, i, "id");
				if (!("type" in node)) return { ok: false, issue: node };
				if (node === tree) {
					return {
						ok: false,
						issue: fail(i, "the root node cannot be moved."),
					};
				}
				// The anchor may not be inside the moved subtree (or the node itself).
				const anchorId = op.before ?? op.after ?? op.parentId;
				if (
					anchorId === node.id ||
					descendants(node).some((d) => d.id === anchorId)
				) {
					return {
						ok: false,
						issue: fail(
							i,
							`Node "${node.id}" cannot be moved relative to itself or into its own subtree.`,
						),
					};
				}
				const from = findParent(tree, node.id as string);
				if (!from) {
					return { ok: false, issue: fail(i, `No node with id "${node.id}".`) };
				}
				from.parent.children?.splice(from.index, 1);
				if (from.parent.children?.length === 0) {
					delete from.parent.children;
				}
				// Resolve placement AFTER detaching (before/after semantics).
				const placement = resolvePlacement(tree, op, i);
				if (!("parent" in placement)) return { ok: false, issue: placement };
				const children = placement.parent.children ?? [];
				children.splice(placement.at, 0, node);
				placement.parent.children = children;
				break;
			}
			default:
				return {
					ok: false,
					issue: fail(
						i,
						`unknown op "${String(op.op)}" — allowed: set-attribute, remove-attribute, set-name, remove, insert, move.`,
					),
				};
		}
	}
	return { ok: true };
}

function applyArtifact(text: string, base: BarkupNode): ArtifactResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(extractArtifact(text));
	} catch (error) {
		return {
			ok: false,
			issues: [
				{
					code: "parse-failed",
					message: `The input could not be parsed as JSON: ${
						error instanceof Error ? error.message : String(error)
					}`,
					path: "(patch)",
				},
			],
		};
	}
	if (!Array.isArray(parsed)) {
		return {
			ok: false,
			issues: [
				{
					code: "invalid-patch",
					message: "An anchored patch must be an array of operations.",
					path: "(patch)",
				},
			],
		};
	}
	const tree = cloneTree(base);
	const applied = applyOps(tree, parsed as RawOp[]);
	if (!applied.ok) return { ok: false, issues: [applied.issue] };
	const validated = validateJsonValue(
		BENCH_CONFIG,
		JSON.parse(JSON.stringify(tree)),
	);
	if (!validated.ok) return { ok: false, issues: validated.issues };
	return { ok: true, node: validated.node };
}

export const conditionF: PatchCondition = {
	kind: "patch",
	id: "F",
	artifactName: "anchored patch",
	systemPrompt: `You are an expert editor of typed content trees.

${formatSection("json")}

Editing rules:
- Reply with an anchored patch: a JSON array of operations that address nodes by their id — {"op": "set-attribute", "id": ..., "key": ..., "value": ...}, {"op": "remove-attribute", "id": ..., "key": ...}, {"op": "set-name", "id": ..., "name": ...}, {"op": "remove", "id": ...}, {"op": "insert", "node": {...}, ...placement}, {"op": "move", "id": ..., ...placement}.
- Placement uses ids, never positions: "before": <sibling id> or "after": <sibling id> (the parent is implied), or "parentId": <id> to append as the last child. Exactly one of the three.
- Preserve every existing node id exactly; give every node you create a fresh unique "id" not used anywhere else in the tree.
- Change only what the request calls for; an operation that touches anything else is wrong.
- You may wrap the patch in a \`\`\`json code fence; output nothing else.`,
	readingSystemPrompt: readingSystemPrompt("json"),
	serialize: serializeJsonTree,
	applyArtifact,
};
