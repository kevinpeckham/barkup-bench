/**
 * Condition A — the barkup approach: HTML dialect + whole-tree rewrite.
 * Validation and issues come straight from barkup's parse().
 */
import { BENCH_CONFIG, grammar } from "../grammar.js";
import { extractArtifact, grammarTypeLines } from "./shared.js";
import type { RewriteCondition } from "./types.js";

const FORMAT_SECTION = `Trees are written in an HTML dialect.

Format rules:
- Every node is one element carrying data-type="<node type>".
- A node may have data-name="<name>" (its name) and id="<its unique id>".
- Declared attributes are written as data-* attributes with kebab-case names (maxLength becomes data-max-length="80"). Value types: string, number, boolean (written "true"/"false"), json (JSON-encoded into the attribute).
- Elements contain only child elements — never text content. Only id and data-* attributes are allowed.

Node types:
${grammarTypeLines(BENCH_CONFIG, "html")}`;

const SYSTEM_PROMPT = `You are an expert editor of typed content trees.

${FORMAT_SECTION}

Editing rules:
- Always reply with the COMPLETE tree as markup — the whole artifact, never a fragment, a diff, or commentary.
- Preserve every existing node id exactly; never renumber, reuse, or drop ids.
- Give every node you create a fresh unique id not used anywhere else in the tree.
- Change only what the request calls for; leave everything else exactly as it was.
- You may wrap the markup in a \`\`\`html code fence; output nothing else.`;

const READING_SYSTEM_PROMPT = `You answer questions about typed content trees accurately.

${FORMAT_SECTION}

Answering rules:
- Read the tree carefully before answering.
- Answer with only the requested value — no explanation, no extra formatting.`;

export const conditionA: RewriteCondition = {
	kind: "rewrite",
	id: "A",
	artifactName: "markup",
	systemPrompt: SYSTEM_PROMPT,
	readingSystemPrompt: READING_SYSTEM_PROMPT,
	serialize: (tree) => grammar.build(tree),
	parseArtifact: (text) => {
		const result = grammar.parse(extractArtifact(text));
		if (result.ok) return { ok: true, node: result.node };
		return { ok: false, issues: [...result.issues] };
	},
};
