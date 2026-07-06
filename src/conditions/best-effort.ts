/**
 * Best-effort regime system prompts (pre-registered).
 *
 * Method: each condition's parity prompt is kept verbatim and extended
 * with the SAME three additions, adapted only to the condition's own
 * format/mechanism so no arm gets more guidance than another:
 *   1. a worked micro-example (same example tree and request for all),
 *   2. a no-embellishment rule,
 *   3. a pre-reply verification checklist.
 * Authored before any full-matrix scored run; sanity-checked on the dev
 * split only. Disclosure for the report: the no-embellishment rule was
 * motivated by pilot failure analysis (conditions A/C, parity); it is
 * applied uniformly to all five conditions.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { conditionA } from "./a.js";
import { conditionB } from "./b.js";
import { conditionC } from "./c.js";
import { conditionD } from "./d.js";
import { conditionE } from "./e.js";

const EXAMPLE_TREE: BarkupNode = {
	type: "document",
	id: "d1",
	attributes: { title: "Notes" },
	children: [
		{
			type: "page",
			id: "p1",
			children: [
				{ type: "text-atom", id: "t1", attributes: { maxLength: 40 } },
			],
		},
	],
};

const EXAMPLE_EDITED: BarkupNode = {
	type: "document",
	id: "d1",
	attributes: { title: "Notes" },
	children: [
		{
			type: "page",
			id: "p1",
			children: [
				{
					type: "text-atom",
					id: "t1",
					attributes: { maxLength: 40, content: "Hello." },
				},
			],
		},
	],
};

const EXAMPLE_REQUEST = `Set the "content" attribute to "Hello." on the text-atom with id "t1".`;

const GUARDRAILS = `Accuracy rules:
- Never add nodes, names, or attributes that were not requested; never embellish or "improve" anything beyond the request.
- Before replying, verify: every requested change was made; nothing else changed; every node still has its required attributes; the id rules were followed exactly.`;

function rewriteExample(current: string, correct: string): string {
	return `Worked example:
Request: ${EXAMPLE_REQUEST}
Current tree:
${current.trimEnd()}
Correct reply:
${correct.trimEnd()}`;
}

function toolsExample(current: string): string {
	return `Worked example:
Request: ${EXAMPLE_REQUEST}
Current tree:
${current.trimEnd()}
Correct actions: exactly one tool call — setAttribute {"nodeId":"t1","key":"content","value":"Hello."} — then reply DONE.`;
}

const patchExample = (current: string): string => `Worked example:
Request: ${EXAMPLE_REQUEST}
Current tree:
${current.trimEnd()}
Correct reply:
[{"op":"add","path":"/children/0/children/0/attributes/content","value":"Hello."}]`;

export const BEST_EFFORT_SYSTEM: Record<string, string> = {
	A: `${conditionA.systemPrompt}

${rewriteExample(
	conditionA.serialize(EXAMPLE_TREE),
	conditionA.serialize(EXAMPLE_EDITED),
)}

${GUARDRAILS}`,
	B: `${conditionB.systemPrompt}

${rewriteExample(
	conditionB.serialize(EXAMPLE_TREE),
	conditionB.serialize(EXAMPLE_EDITED),
)}

${GUARDRAILS}`,
	C: `${conditionC.systemPrompt}

${toolsExample(conditionC.serialize(EXAMPLE_TREE))}

${GUARDRAILS}`,
	D: `${conditionD.systemPrompt}

${toolsExample(conditionD.serialize(EXAMPLE_TREE))}

${GUARDRAILS}`,
	E: `${conditionE.systemPrompt}

${patchExample(conditionE.serialize(EXAMPLE_TREE))}

${GUARDRAILS}`,
};
