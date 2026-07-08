/**
 * Study J — HTML-rendered focused views (pre-registered in
 * docs/BRIEF-J.md). Content-identical to Study I's views, serialized
 * in the HTML dialect via a view grammar: the bench config with three
 * extra declared attributes (collapsed / childCount / omittedChildren)
 * on every node type, rendered by the shipped barkup build(). On trees
 * without view metadata the output is byte-identical to condition A's
 * serialization, so expanded regions look exactly like A's HTML.
 * The patch dialect, applier, and grading are unchanged.
 */
import type { BarkupNode, GrammarConfig } from "@kevinpeckham/barkup";
import { defineGrammar } from "@kevinpeckham/barkup";
import type { Edit } from "../corpus/edits.js";
import { adapter, BENCH_CONFIG } from "../grammar.js";
import { conditionF } from "./f.js";
import { applyShipped } from "./f2.js";
import { formatSection } from "./shared.js";
import type { PatchCondition } from "./types.js";
import { referencedIds, spineOf, type ViewMode } from "./views.js";

const viewConfig = structuredClone(BENCH_CONFIG) as GrammarConfig;
for (const spec of Object.values(viewConfig.nodes)) {
	spec.attributes = {
		...(spec.attributes ?? {}),
		collapsed: { type: "boolean" },
		childCount: { type: "number" },
		omittedChildren: { type: "number" },
	};
}
/** Bench grammar + declared view attributes; byte-parity is unit-tested. */
export const viewGrammar = defineGrammar(viewConfig, { adapter });

/**
 * The view as a BarkupNode: placeholders carry the view metadata as
 * attributes, so the shipped build() does all serialization. Same
 * spine/placeholder/omission rules as Study I's buildView.
 */
export function buildViewTree(
	tree: BarkupNode,
	focusIds: string[],
	mode: ViewMode,
): BarkupNode {
	const spine = spineOf(tree, focusIds);
	const focus = new Set(focusIds);
	const placeholder = (node: BarkupNode): BarkupNode => ({
		type: node.type,
		...(node.name !== undefined ? { name: node.name } : {}),
		...(node.id !== undefined ? { id: node.id } : {}),
		attributes: { collapsed: true, childCount: node.children?.length ?? 0 },
	});
	const render = (node: BarkupNode): BarkupNode => {
		const children = node.children ?? [];
		const rendered: BarkupNode[] = [];
		let omitted = 0;
		for (const child of children) {
			if (spine.has(child)) {
				rendered.push(render(child));
			} else if (focus.has(node.id as string) || mode === "focused") {
				rendered.push(placeholder(child));
			} else {
				omitted += 1;
			}
		}
		const attributes = {
			...(node.attributes ?? {}),
			...(omitted > 0 ? { omittedChildren: omitted } : {}),
		};
		return {
			type: node.type,
			...(node.name !== undefined ? { name: node.name } : {}),
			...(node.id !== undefined ? { id: node.id } : {}),
			...(Object.keys(attributes).length > 0 ? { attributes } : {}),
			...(rendered.length > 0 ? { children: rendered } : {}),
		};
	};
	return render(tree);
}

export function serializeViewHtml(
	tree: BarkupNode,
	focusIds: string[],
	mode: ViewMode,
): string {
	return viewGrammar.build(buildViewTree(tree, focusIds, mode));
}

/** Pre-registered HTML view block (BRIEF-J.md) — Study I's, with the two format-specific sentences adapted. */
export const VIEW_RULES_HTML = `
View rules:
- You are shown a focused view of the tree, not the whole tree. The view is centered on the nodes the edit request references. Your patch is applied to the full tree, where every hidden node still exists.
- An element with data-collapsed="true" is a real node shown without its contents; data-child-count is how many children it actually has.
- An element with data-omitted-children="N" has N additional children that are not shown at all.
- Every visible id is a valid patch target. Never use an id that is not visible in the view.
- Give every node you create a fresh id unlikely to exist anywhere in the full tree (e.g. with a random-looking suffix); if it collides with a hidden node's id, the patch is rejected with a duplicate-id issue and you can correct it.`;

/** F's editing rules with the format section swapped to the HTML dialect (no view rules; Study L composes its own navigation block onto this). */
export const HTML_PATCH_BASE = `You are an expert editor of typed content trees.

${formatSection("html")}

Editing rules:
- Reply with an anchored patch: a JSON array of operations that address nodes by their id — {"op": "set-attribute", "id": ..., "key": ..., "value": ...}, {"op": "remove-attribute", "id": ..., "key": ...}, {"op": "set-name", "id": ..., "name": ...}, {"op": "remove", "id": ...}, {"op": "insert", "node": {...}, ...placement}, {"op": "move", "id": ..., ...placement}.
- Patch operations use JSON node objects and camelCase attribute keys ({"type": ..., "name": ..., "id": ..., "attributes": {...}}), even though the tree is shown as markup.
- Placement uses ids, never positions: "before": <sibling id> or "after": <sibling id> (the parent is implied), or "parentId": <id> to append as the last child. Exactly one of the three.
- Preserve every existing node id exactly; give every node you create a fresh unique "id" not used anywhere else in the tree.
- Change only what the request calls for; an operation that touches anything else is wrong.
- You may wrap the patch in a \`\`\`json code fence; output nothing else.`;

/** The Study J view-condition prompt: base + view rules (byte-identical to the pre-refactor constant). */
const HTML_PATCH_SYSTEM_PROMPT = HTML_PATCH_BASE + VIEW_RULES_HTML;

/**
 * A per-task condition: F's dialect and shipped applier, with the
 * prompt tree replaced by the edit's focused view in the HTML dialect.
 */
export function makeHtmlViewCondition(
	mode: ViewMode,
	edit: Edit,
): PatchCondition {
	const ids = referencedIds(edit);
	return {
		...conditionF,
		id: mode === "focused" ? "FVH" : "FTH",
		systemPrompt: HTML_PATCH_SYSTEM_PROMPT,
		serialize: (tree) => serializeViewHtml(tree, ids, mode),
		applyArtifact: applyShipped,
	};
}
