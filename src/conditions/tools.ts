/**
 * The granular mutation-tool session shared by conditions C and D:
 * insertNode / setAttribute / setName / moveNode / removeNode over
 * server-maintained tree state. Tool failures are realistic data errors
 * (stale id, containment violation, type error): the call returns
 * { ok: false, error } and changes nothing. Error-message wording
 * mirrors the twin validator (which mirrors barkup) so the tools arms
 * get the same quality of feedback as the rewrite arms.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { tool } from "ai";
import { z } from "zod";
import { BENCH_CONFIG } from "../grammar.js";
import {
	cloneTree,
	descendants,
	findById,
	findParent,
	walkTree,
} from "../tree.js";
import type { ToolSession } from "./types.js";

/** Editing-rules block shared verbatim by both tools conditions. */
export const TOOLS_EDITING_RULES = `Editing rules:
- Edit the tree by calling the provided tools; the system maintains the tree state between calls.
- Ids of new nodes are assigned by the system and returned by insertNode; use returned ids in follow-up calls.
- A tool call that violates the rules returns an error and changes nothing; read the error and correct your call.
- Change only what the request calls for; leave everything else exactly as it was.
- When the tree fully matches the request, reply with the single word DONE and stop calling tools.`;

type ToolResult =
	| { ok: true; nodeId?: string; message: string }
	| { ok: false; error: string };

function fail(error: string): ToolResult {
	return { ok: false, error };
}

function allowedChildrenOf(type: string): readonly string[] {
	return BENCH_CONFIG.nodes[type]?.children ?? [];
}

function checkAttributes(
	nodeType: string,
	attributes: Record<string, unknown>,
): string | null {
	const declared = BENCH_CONFIG.nodes[nodeType]?.attributes ?? {};
	for (const [key, value] of Object.entries(attributes)) {
		const spec = declared[key];
		if (!spec) {
			return `Attribute "${key}" is not declared for node type "${nodeType}".`;
		}
		switch (spec.type) {
			case "string":
				if (typeof value !== "string") {
					return `Attribute "${key}" is declared "string" but is ${typeof value}.`;
				}
				break;
			case "number":
				if (typeof value !== "number" || !Number.isFinite(value)) {
					return `Attribute "${key}" is declared "number" but is not a finite number.`;
				}
				break;
			case "boolean":
				if (typeof value !== "boolean") {
					return `Attribute "${key}" is declared "boolean" but is ${typeof value}.`;
				}
				break;
			case "json":
				try {
					if (JSON.stringify(value) === undefined) {
						return `Attribute "${key}" is declared "json" but is not JSON-serializable.`;
					}
				} catch {
					return `Attribute "${key}" is declared "json" but is not JSON-serializable.`;
				}
				break;
		}
	}
	return null;
}

const attributeValueSchema = z
	.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(z.any()),
		z.record(z.any()),
	])
	.describe(
		"The attribute value, matching the attribute's declared type (string, number, boolean, or any JSON value for json attributes).",
	);

export function createToolSession(initial: BarkupNode): ToolSession {
	const session: ToolSession = {
		state: { tree: cloneTree(initial) },
		toolErrorCount: 0,
		tools: {},
	};

	const usedIds = new Set<string>();
	let idCounter = 0;
	const refreshIds = () => {
		usedIds.clear();
		walkTree(session.state.tree, ({ node }) => {
			if (node.id !== undefined) usedIds.add(node.id);
		});
	};
	refreshIds();
	const nextId = (): string => {
		idCounter += 1;
		while (usedIds.has(`m${idCounter}`)) idCounter += 1;
		return `m${idCounter}`;
	};

	const track = (result: ToolResult): ToolResult => {
		if (!result.ok) session.toolErrorCount += 1;
		return result;
	};

	const mustNode = (id: string): BarkupNode | null =>
		findById(session.state.tree, id);

	session.tools = {
		insertNode: tool({
			description:
				"Insert a new node as a child of an existing node. Returns the id the system assigned to the new node.",
			inputSchema: z.object({
				parentId: z.string().describe("Id of the parent node."),
				type: z.string().describe("Node type of the new node."),
				index: z
					.number()
					.int()
					.optional()
					.describe(
						"Position among the parent's children (0-based). Omit to append at the end.",
					),
				name: z.string().optional().describe("Optional name for the new node."),
				attributes: z
					.record(attributeValueSchema)
					.optional()
					.describe("Declared attributes for the new node."),
			}),
			execute: async ({ parentId, type, index, name, attributes }) =>
				track(
					(() => {
						const parent = mustNode(parentId);
						if (!parent) {
							return fail(`No node with id "${parentId}" exists in the tree.`);
						}
						if (!BENCH_CONFIG.nodes[type]) {
							return fail(
								`Node type "${type}" is not declared in the grammar.`,
							);
						}
						if (!allowedChildrenOf(parent.type).includes(type)) {
							return fail(
								`Node type "${type}" is not an allowed child of "${parent.type}".`,
							);
						}
						const children = parent.children ?? [];
						const at = index ?? children.length;
						if (at < 0 || at > children.length) {
							return fail(
								`Index ${at} is out of range: the parent has ${children.length} children (valid: 0 to ${children.length}).`,
							);
						}
						if (attributes) {
							const problem = checkAttributes(type, attributes);
							if (problem) return fail(problem);
						}
						const node: BarkupNode = { type, id: nextId() };
						if (name !== undefined) node.name = name;
						if (attributes && Object.keys(attributes).length > 0) {
							node.attributes = attributes as Record<string, AttributeValue>;
						}
						usedIds.add(node.id as string);
						children.splice(at, 0, node);
						parent.children = children;
						return {
							ok: true,
							nodeId: node.id as string,
							message: `Inserted ${type} with id "${node.id}" as child ${at} of "${parentId}".`,
						};
					})(),
				),
		}),
		setAttribute: tool({
			description:
				"Set a declared attribute on an existing node to a new value.",
			inputSchema: z.object({
				nodeId: z.string().describe("Id of the node to modify."),
				key: z.string().describe("Attribute name (camelCase, as declared)."),
				value: attributeValueSchema,
			}),
			execute: async ({ nodeId, key, value }) =>
				track(
					(() => {
						const node = mustNode(nodeId);
						if (!node) {
							return fail(`No node with id "${nodeId}" exists in the tree.`);
						}
						const problem = checkAttributes(node.type, { [key]: value });
						if (problem) return fail(problem);
						node.attributes = {
							...(node.attributes ?? {}),
							[key]: value as AttributeValue,
						};
						return {
							ok: true,
							message: `Set ${key} on "${nodeId}".`,
						};
					})(),
				),
		}),
		setName: tool({
			description: "Set (or change) the name of an existing node.",
			inputSchema: z.object({
				nodeId: z.string().describe("Id of the node to rename."),
				name: z.string().describe("The new name."),
			}),
			execute: async ({ nodeId, name }) =>
				track(
					(() => {
						const node = mustNode(nodeId);
						if (!node) {
							return fail(`No node with id "${nodeId}" exists in the tree.`);
						}
						node.name = name;
						return { ok: true, message: `Named "${nodeId}" "${name}".` };
					})(),
				),
		}),
		moveNode: tool({
			description:
				"Move an existing node (with its whole subtree) to a new parent at a given position.",
			inputSchema: z.object({
				nodeId: z.string().describe("Id of the node to move."),
				newParentId: z.string().describe("Id of the destination parent."),
				index: z
					.number()
					.int()
					.describe(
						"Position among the destination parent's children (0-based, after the node is detached).",
					),
			}),
			execute: async ({ nodeId, newParentId, index }) =>
				track(
					(() => {
						const tree = session.state.tree;
						const node = mustNode(nodeId);
						if (!node) {
							return fail(`No node with id "${nodeId}" exists in the tree.`);
						}
						if (node === tree) {
							return fail("The root node cannot be moved.");
						}
						const target = mustNode(newParentId);
						if (!target) {
							return fail(
								`No node with id "${newParentId}" exists in the tree.`,
							);
						}
						if (node === target || descendants(node).includes(target)) {
							return fail(
								`Node "${nodeId}" cannot be moved into its own subtree.`,
							);
						}
						if (!allowedChildrenOf(target.type).includes(node.type)) {
							return fail(
								`Node type "${node.type}" is not an allowed child of "${target.type}".`,
							);
						}
						const located = findParent(tree, nodeId);
						if (!located) {
							return fail(`No node with id "${nodeId}" exists in the tree.`);
						}
						located.parent.children?.splice(located.index, 1);
						if (located.parent.children?.length === 0) {
							located.parent.children = [];
						}
						const children = target.children ?? [];
						if (index < 0 || index > children.length) {
							// Undo the detach before failing.
							located.parent.children?.splice(located.index, 0, node);
							return fail(
								`Index ${index} is out of range: the destination has ${children.length} children (valid: 0 to ${children.length}).`,
							);
						}
						children.splice(index, 0, node);
						target.children = children;
						return {
							ok: true,
							message: `Moved "${nodeId}" to child ${index} of "${newParentId}".`,
						};
					})(),
				),
		}),
		removeNode: tool({
			description: "Remove an existing node and its whole subtree.",
			inputSchema: z.object({
				nodeId: z.string().describe("Id of the node to remove."),
			}),
			execute: async ({ nodeId }) =>
				track(
					(() => {
						const tree = session.state.tree;
						const node = mustNode(nodeId);
						if (!node) {
							return fail(`No node with id "${nodeId}" exists in the tree.`);
						}
						if (node === tree) {
							return fail("The root node cannot be removed.");
						}
						const located = findParent(tree, nodeId);
						if (!located) {
							return fail(`No node with id "${nodeId}" exists in the tree.`);
						}
						located.parent.children?.splice(located.index, 1);
						return { ok: true, message: `Removed "${nodeId}".` };
					})(),
				),
		}),
	};

	return session;
}
