/**
 * Condition D — completes the factorial: HTML dialect serialization +
 * the SAME granular mutation tools as condition C. Isolates the format
 * variable on the tools side. State validation and issues come from
 * barkup's validate() so the feedback style matches the HTML family.
 */
import { grammar } from "../grammar.js";
import { formatSection, readingSystemPrompt } from "./shared.js";
import { createToolSession, TOOLS_EDITING_RULES } from "./tools.js";
import type { ToolsCondition } from "./types.js";

export const conditionD: ToolsCondition = {
	kind: "tools",
	id: "D",
	artifactName: "tree",
	systemPrompt: `You are an expert editor of typed content trees.

${formatSection("html")}

${TOOLS_EDITING_RULES}`,
	readingSystemPrompt: readingSystemPrompt("html"),
	serialize: (tree) => grammar.build(tree),
	validateState: (tree) => {
		const result = grammar.validate(tree);
		if (result.ok) return { ok: true };
		return { ok: false, issues: [...result.issues] };
	},
	createSession: createToolSession,
};
