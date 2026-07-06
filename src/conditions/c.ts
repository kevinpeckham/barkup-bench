/**
 * Condition C — the textbook approach: JSON serialization + granular
 * mutation tools (see tools.ts for the session semantics).
 */
import { BENCH_CONFIG } from "../grammar.js";
import { validateJsonValue } from "../twin/validate.js";
import {
	formatSection,
	readingSystemPrompt,
	serializeJsonTree,
} from "./shared.js";
import { createToolSession, TOOLS_EDITING_RULES } from "./tools.js";
import type { ToolsCondition } from "./types.js";

export const conditionC: ToolsCondition = {
	kind: "tools",
	id: "C",
	artifactName: "JSON tree",
	systemPrompt: `You are an expert editor of typed content trees.

${formatSection("json")}

${TOOLS_EDITING_RULES}`,
	readingSystemPrompt: readingSystemPrompt("json"),
	serialize: serializeJsonTree,
	validateState: (tree) => {
		const result = validateJsonValue(
			BENCH_CONFIG,
			JSON.parse(JSON.stringify(tree)),
		);
		if (result.ok) return { ok: true };
		return { ok: false, issues: result.issues };
	},
	createSession: createToolSession,
};
