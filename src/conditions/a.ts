/**
 * Condition A — the barkup approach: HTML dialect + whole-tree rewrite.
 * Validation and issues come straight from barkup's parse().
 */
import { grammar } from "../grammar.js";
import {
	extractArtifact,
	formatSection,
	readingSystemPrompt,
} from "./shared.js";
import type { RewriteCondition } from "./types.js";

export const conditionA: RewriteCondition = {
	kind: "rewrite",
	id: "A",
	artifactName: "markup",
	systemPrompt: `You are an expert editor of typed content trees.

${formatSection("html")}

Editing rules:
- Always reply with the COMPLETE tree as markup — the whole artifact, never a fragment, a diff, or commentary.
- Preserve every existing node id exactly; never renumber, reuse, or drop ids.
- Give every node you create a fresh unique id not used anywhere else in the tree.
- Change only what the request calls for; leave everything else exactly as it was.
- You may wrap the markup in a \`\`\`html code fence; output nothing else.`,
	readingSystemPrompt: readingSystemPrompt("html"),
	serialize: (tree) => grammar.build(tree),
	parseArtifact: (text) => {
		const result = grammar.parse(extractArtifact(text));
		if (result.ok) return { ok: true, node: result.node };
		return { ok: false, issues: [...result.issues] };
	},
};
