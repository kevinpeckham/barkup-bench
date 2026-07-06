/**
 * Render the pre-registered prompts (both regimes, all conditions) to
 * prompts/ for the record. The code in src/conditions + src/harness is
 * the single source of truth; these files are the committed,
 * human-readable registration artifact.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { Regime } from "../src/conditions/index.js";
import {
	ALL_CONDITIONS,
	conditionsForRegime,
} from "../src/conditions/index.js";
import type { Condition } from "../src/conditions/types.js";
import { DESCRIBER_SYSTEM } from "../src/corpus/describe.js";
import {
	constructionMessage,
	editMessage,
	followUpMessage,
	readingMessage,
} from "../src/harness/prompts.js";

const PLACEHOLDER_TREE = { type: "document" };

function withPlaceholderSerialize(condition: Condition): Condition {
	return { ...condition, serialize: () => "{TREE}" } as Condition;
}

for (const regime of ["parity", "best"] as Regime[]) {
	const dir = regime === "parity" ? "prompts/parity" : "prompts/best-effort";
	mkdirSync(dir, { recursive: true });
	for (const condition of conditionsForRegime(regime)) {
		const c = withPlaceholderSerialize(condition);
		const sections = [
			`# Condition ${condition.id} — ${regime} prompts (pre-registered)`,
			`## System prompt (editing)\n\n\`\`\`\n${condition.systemPrompt}\n\`\`\``,
			`## System prompt (reading)\n\n\`\`\`\n${condition.readingSystemPrompt}\n\`\`\``,
			`## User message — edit\n\n\`\`\`\n${editMessage(c, PLACEHOLDER_TREE, "{INSTRUCTION}")}\n\`\`\``,
			`## User message — construction\n\n\`\`\`\n${constructionMessage(
				c,
				"{SPEC}",
				condition.kind === "rewrite" ? null : PLACEHOLDER_TREE,
			)}\n\`\`\``,
			`## User message — follow-up edit (reference tasks)\n\n\`\`\`\n${followUpMessage(c, "{INSTRUCTION}")}\n\`\`\``,
			`## User message — reading\n\n\`\`\`\n${readingMessage(c, PLACEHOLDER_TREE, "{QUESTION}")}\n\`\`\``,
		];
		writeFileSync(`${dir}/${condition.id}.md`, `${sections.join("\n\n")}\n`);
		console.log(`${dir}/${condition.id}.md`);
	}
}

writeFileSync(
	"prompts/parity/describer.md",
	`# Held-out describer (construction specs; pre-registered)\n\n## System prompt\n\n\`\`\`\n${DESCRIBER_SYSTEM}\n\`\`\`\n\n## User message\n\n\`\`\`\nHere is the tree to specify:\n\n{OUTLINE}\n\nWrite the specification now.\n\`\`\`\n`,
);
console.log("prompts/parity/describer.md");
console.log(`Rendered ${ALL_CONDITIONS.length} conditions × 2 regimes.`);
