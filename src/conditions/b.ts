/**
 * Condition B — JSON + whole-tree rewrite. Isolates the format variable
 * on the rewrite side: same strategy as A, same validation semantics
 * (the twin), JSON instead of the HTML dialect.
 */
import { BENCH_CONFIG } from "../grammar.js";
import { parseJsonTree } from "../twin/validate.js";
import {
	extractArtifact,
	formatSection,
	readingSystemPrompt,
	serializeJsonTree,
} from "./shared.js";
import type { RewriteCondition } from "./types.js";

export const conditionB: RewriteCondition = {
	kind: "rewrite",
	id: "B",
	artifactName: "JSON tree",
	systemPrompt: `You are an expert editor of typed content trees.

${formatSection("json")}

Editing rules:
- Always reply with the COMPLETE tree as JSON — the whole artifact, never a fragment, a diff, or commentary.
- Preserve every existing node id exactly; never renumber, reuse, or drop ids.
- Give every node you create a fresh unique id not used anywhere else in the tree.
- Change only what the request calls for; leave everything else exactly as it was.
- You may wrap the JSON in a \`\`\`json code fence; output nothing else.`,
	readingSystemPrompt: readingSystemPrompt("json"),
	serialize: serializeJsonTree,
	parseArtifact: (text) => parseJsonTree(BENCH_CONFIG, extractArtifact(text)),
};
