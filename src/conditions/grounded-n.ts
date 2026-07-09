/**
 * Study N conditions (docs/BRIEF-N.md): the retrieval ladder between
 * Study L's floor (LG-lex) and ceiling (LG-full).
 *
 * - N-search: skeleton root view + a find_nodes content-search tool
 *   (src/harness/search-runner.ts drives it; this module supplies the
 *   scorer, the tool-result renderer, and the pre-registered prompt).
 * - N-embed: LG-lex with the scorer upgraded to embeddings. Retrieval
 *   is materialized in corpus/embed-focus.json (committed before any
 *   scored patch call) by scripts/generate-embed-focus.ts; the
 *   condition itself just renders the view on the committed focus ids.
 * - N-ground2 / N-ground2x: two-stage ground-then-patch
 *   (src/harness/ground2-runner.ts); this module supplies the grounder
 *   prompt, its user message, and the stage-1 validator.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { findById, walkTree } from "../tree.js";
import { conditionF } from "./f.js";
import { applyShipped } from "./f2.js";
import { searchableText, tokenize } from "./grounded.js";
import { extractArtifact, formatSection, serializeJsonTree } from "./shared.js";
import type { PatchCondition } from "./types.js";
import { serializeView, VIEW_RULES } from "./views.js";
import { HTML_PATCH_BASE, serializeViewHtml } from "./views-html.js";

/**
 * N-search's scorer: LG-lex's distinct-token overlap, applied to the
 * model's own query instead of the whole instruction. Nodes scoring 0
 * are excluded (BRIEF-N); top k, ties by document order.
 */
export function searchNodes(tree: BarkupNode, query: string, k = 5): string[] {
	const wanted = tokenize(query);
	const scored: { id: string; score: number; order: number }[] = [];
	let order = 0;
	walkTree(tree, ({ node }) => {
		if (node.id === undefined) return;
		let score = 0;
		for (const token of tokenize(searchableText(node))) {
			if (wanted.has(token)) score += 1;
		}
		if (score > 0) scored.push({ id: node.id, score, order });
		order += 1;
	});
	return scored
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.slice(0, k)
		.map((s) => s.id);
}

export const NO_MATCHES_MESSAGE =
	"No nodes match that query. Try different words (node types, names, attribute values).";

/** The find_nodes tool result: matches shown in place, or a structured miss. */
export function findNodesResult(tree: BarkupNode, query: string): string {
	const ids = searchNodes(tree, query);
	if (ids.length === 0) return NO_MATCHES_MESSAGE;
	return serializeViewHtml(tree, ids, "minimal");
}

/** Pre-registered search block (BRIEF-N.md). */
export const SEARCH_RULES = `
Search rules:
- You are shown a minimal view of the tree's root. Collapsed elements are real nodes shown without their contents; data-child-count is how many children each actually has.
- Call find_nodes with a few search words (names, types, attribute values) to retrieve the 5 best-matching nodes, shown in place in the tree with their ancestors. Search as many times as you need to locate the nodes the edit request concerns.
- When you have found them, reply with the anchored patch as your final message. Every id you use must be one you have seen.`;

export const SEARCH_SYSTEM_PROMPT = HTML_PATCH_BASE + SEARCH_RULES;

/** N-embed: minimal JSON view on the committed embedding focus ids. */
export function makeEmbedCondition(focusIds: string[]): PatchCondition {
	return {
		...conditionF,
		id: "N-embed",
		systemPrompt: conditionF.systemPrompt + VIEW_RULES,
		serialize: (tree) => serializeView(tree, focusIds, "minimal"),
		applyArtifact: applyShipped,
	};
}

/** Cosine similarity for the embedding retriever (unit-tested). */
export function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i += 1) {
		const x = a[i] as number;
		const y = b[i] as number;
		dot += x * y;
		normA += x * x;
		normB += y * y;
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Pre-registered grounder system prompt (BRIEF-N.md), stage 1 of N-ground2. */
export const GROUNDER_SYSTEM = `You are an expert reader of typed content trees.

${formatSection("json")}

Grounding rules:
- You will be shown a tree and an edit request. Do NOT perform the edit.
- Reply with a JSON array of the ids of every EXISTING node the edit concerns: the node(s) to be changed or removed, plus any node the request names as a destination or placement reference (the parent to insert into, the container an ordinal like "the 3rd child" counts within, a sibling the position is relative to).
- Every id must appear exactly as it does in the tree. Reply with the JSON array and nothing else; you may wrap it in a \`\`\`json code fence.`;

export function grounderMessage(tree: BarkupNode, instruction: string): string {
	return `Here is the current tree:

${serializeJsonTree(tree)}

Edit request: ${instruction}

Reply with the JSON array of the ids of the existing nodes this edit concerns.`;
}

export type GroundingParse =
	| { ok: true; ids: string[] }
	| { ok: false; reason: string };

/** Stage-1 validator: parseable, non-empty string array, every id in the tree. */
export function parseGrounding(text: string, tree: BarkupNode): GroundingParse {
	let parsed: unknown;
	try {
		parsed = JSON.parse(extractArtifact(text));
	} catch (error) {
		return {
			ok: false,
			reason: `the reply could not be parsed as JSON (${
				error instanceof Error ? error.message : String(error)
			}).`,
		};
	}
	if (
		!Array.isArray(parsed) ||
		parsed.length === 0 ||
		!parsed.every((item) => typeof item === "string")
	) {
		return {
			ok: false,
			reason: "the reply must be a non-empty JSON array of node id strings.",
		};
	}
	const ids = [...new Set(parsed as string[])];
	const missing = ids.filter((id) => !findById(tree, id));
	if (missing.length > 0) {
		return {
			ok: false,
			reason: `these ids do not exist in the tree: ${missing
				.map((id) => `"${id}"`)
				.join(", ")}.`,
		};
	}
	return { ok: true, ids };
}
