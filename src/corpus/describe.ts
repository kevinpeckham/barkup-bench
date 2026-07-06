/**
 * Construction-task specs come from a HELD-OUT describer model that sees
 * the target tree in a neutral outline (neither the HTML dialect nor the
 * JSON twin, so neither arm gets a format head start) and writes an
 * exhaustive natural-language specification.
 *
 * Known limitation (pre-registered, reported): one describer family may
 * phrase specs that favor its own family — the describer is therefore
 * drawn from a vendor family that is NOT among the subject models.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";

function formatValue(value: AttributeValue): string {
	if (typeof value === "string") return `"${value}"`;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return JSON.stringify(value);
}

/** Neutral indented outline of a tree — no ids (ids are not part of a construction spec). */
export function outlineTree(node: BarkupNode, depth = 0): string {
	const indent = "  ".repeat(depth);
	const name = node.name !== undefined ? ` (named "${node.name}")` : "";
	const attrs = Object.entries(node.attributes ?? {})
		.map(([key, value]) => `${key} = ${formatValue(value)}`)
		.join(", ");
	const attrText = attrs !== "" ? ` — attributes: ${attrs}` : "";
	const lines = [`${indent}- ${node.type}${name}${attrText}`];
	for (const child of node.children ?? []) {
		lines.push(outlineTree(child, depth + 1));
	}
	return lines.join("\n");
}

export const DESCRIBER_SYSTEM = `You write precise natural-language specifications of content trees.

You will be shown a tree as an indented outline. Write a specification so complete and unambiguous that someone who cannot see the outline could rebuild the tree EXACTLY — every node, its type, its name (when it has one), its exact position among its siblings, its nesting, and every attribute with its exact value.

Rules:
- Cover every node and every attribute value verbatim; do not add, omit, round, or embellish anything.
- Make sibling order explicit (first, second, ...).
- Never mention node ids.
- Write prose or nested prose bullets. Do NOT write JSON, HTML, XML, code, or anything that mimics a serialization format.`;

export function describerPrompt(target: BarkupNode): string {
	return `Here is the tree to specify:\n\n${outlineTree(target)}\n\nWrite the specification now.`;
}
