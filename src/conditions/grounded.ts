/**
 * Study L conditions (docs/BRIEF-L.md): three context-delivery
 * mechanisms for id-free grounded instructions, all emitting the F
 * anchored-patch dialect applied by the shipped package.
 *
 * - LG-full: the whole tree in the prompt (F parity prompt).
 * - LG-lex: naive deterministic lexical retrieval feeding the minimal
 *   JSON view (Study I's FT prompt). Deliberately dumb — the floor.
 * - LG-nav: handled by src/harness/nav-runner.ts; this module supplies
 *   its local expand view and the pre-registered prompt.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { walkTree } from "../tree.js";
import { conditionF } from "./f.js";
import { applyShipped } from "./f2.js";
import type { PatchCondition } from "./types.js";
import { serializeView, VIEW_RULES } from "./views.js";
import { HTML_PATCH_BASE, viewGrammar } from "./views-html.js";

/** Lowercase alphanumeric tokens of a string. */
export function tokenize(text: string): Set<string> {
	return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function searchableText(node: BarkupNode): string {
	const attrs = Object.entries(node.attributes ?? {})
		.map(([key, value]) => `${key} ${JSON.stringify(value)}`)
		.join(" ");
	return `${node.type} ${node.name ?? ""} ${attrs}`;
}

/**
 * Top-k nodes by distinct-token overlap with the instruction, ties
 * broken by document order (BRIEF-L: k = 5, pre-registered).
 */
export function lexicalFocus(
	tree: BarkupNode,
	instruction: string,
	k = 5,
): string[] {
	const wanted = tokenize(instruction);
	const scored: { id: string; score: number; order: number }[] = [];
	let order = 0;
	walkTree(tree, ({ node }) => {
		if (node.id === undefined) return;
		let score = 0;
		for (const token of tokenize(searchableText(node))) {
			if (wanted.has(token)) score += 1;
		}
		scored.push({ id: node.id, score, order });
		order += 1;
	});
	return scored
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.slice(0, k)
		.map((s) => s.id);
}

/** LG-full: condition F with the shipped applier, full tree shown. */
export function makeFullCondition(): PatchCondition {
	return { ...conditionF, id: "LG-full", applyArtifact: applyShipped };
}

/** LG-lex: minimal JSON view focused by lexical retrieval. */
export function makeLexCondition(instruction: string): PatchCondition {
	return {
		...conditionF,
		id: "LG-lex",
		systemPrompt: conditionF.systemPrompt + VIEW_RULES,
		serialize: (tree) =>
			serializeView(tree, lexicalFocus(tree, instruction), "minimal"),
		applyArtifact: applyShipped,
	};
}

/**
 * LG-nav's local expand view: the node rendered fully with its
 * children as collapsed placeholders — no root spine, just the
 * neighborhood the model asked for.
 */
export function expandNodeView(tree: BarkupNode, id: string): string | null {
	let target: BarkupNode | null = null;
	walkTree(tree, ({ node }) => {
		if (node.id === id && target === null) target = node;
	});
	if (!target) return null;
	const node = target as BarkupNode;
	const local: BarkupNode = {
		type: node.type,
		...(node.name !== undefined ? { name: node.name } : {}),
		...(node.id !== undefined ? { id: node.id } : {}),
		...(node.attributes && Object.keys(node.attributes).length > 0
			? { attributes: node.attributes }
			: {}),
		...(node.children && node.children.length > 0
			? {
					children: node.children.map((child) => ({
						type: child.type,
						...(child.name !== undefined ? { name: child.name } : {}),
						...(child.id !== undefined ? { id: child.id } : {}),
						attributes: {
							collapsed: true,
							childCount: child.children?.length ?? 0,
						},
					})),
				}
			: {}),
	};
	return viewGrammar.build(local);
}

/** Pre-registered navigation block (BRIEF-L.md). */
export const NAVIGATION_RULES = `
Navigation rules:
- You are shown a minimal view of the tree's root. Collapsed elements are real nodes shown without their contents; data-child-count is how many children each actually has.
- Call expand_node with a visible id to reveal that node in full with its children collapsed. Expand as many nodes as you need to locate the nodes the edit request concerns.
- When you have found them, reply with the anchored patch as your final message. Every id you use must be one you have seen.`;

export const NAV_SYSTEM_PROMPT = HTML_PATCH_BASE + NAVIGATION_RULES;
