/**
 * Render the pre-registered parity prompts to prompts/parity/ for the
 * record. The code in src/conditions + src/harness/prompts.ts is the
 * single source of truth; these files are the committed, human-readable
 * registration artifact.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { conditionA } from "../src/conditions/a.js";
import { conditionC } from "../src/conditions/c.js";
import type { Condition } from "../src/conditions/types.js";
import { DESCRIBER_SYSTEM } from "../src/corpus/describe.js";
import {
	constructionMessage,
	editMessage,
	followUpMessage,
	readingMessage,
} from "../src/harness/prompts.js";

mkdirSync("prompts/parity", { recursive: true });

const PLACEHOLDER_TREE = { type: "document" };

function withPlaceholderSerialize(condition: Condition): Condition {
	return { ...condition, serialize: () => "{TREE}" } as Condition;
}

for (const condition of [conditionA, conditionC]) {
	const c = withPlaceholderSerialize(condition);
	const sections = [
		`# Condition ${condition.id} — parity prompts (pre-registered)`,
		`## System prompt (editing)\n\n\`\`\`\n${condition.systemPrompt}\n\`\`\``,
		`## System prompt (reading)\n\n\`\`\`\n${condition.readingSystemPrompt}\n\`\`\``,
		`## User message — edit\n\n\`\`\`\n${editMessage(c, PLACEHOLDER_TREE, "{INSTRUCTION}")}\n\`\`\``,
		`## User message — construction\n\n\`\`\`\n${constructionMessage(
			c,
			"{SPEC}",
			condition.kind === "tools" ? PLACEHOLDER_TREE : null,
		)}\n\`\`\``,
		`## User message — follow-up edit (reference tasks)\n\n\`\`\`\n${followUpMessage(c, "{INSTRUCTION}")}\n\`\`\``,
		`## User message — reading\n\n\`\`\`\n${readingMessage(c, PLACEHOLDER_TREE, "{QUESTION}")}\n\`\`\``,
	];
	writeFileSync(
		`prompts/parity/${condition.id}.md`,
		`${sections.join("\n\n")}\n`,
	);
	console.log(`prompts/parity/${condition.id}.md`);
}

writeFileSync(
	"prompts/parity/describer.md",
	`# Held-out describer (construction specs; pre-registered)\n\n## System prompt\n\n\`\`\`\n${DESCRIBER_SYSTEM}\n\`\`\`\n\n## User message\n\n\`\`\`\nHere is the tree to specify:\n\n{OUTLINE}\n\nWrite the specification now.\n\`\`\`\n`,
);
console.log("prompts/parity/describer.md");
