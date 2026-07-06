/**
 * Parity user-message templates. Identical structure across conditions;
 * the only differences are the serialization itself and the one sentence
 * saying how to deliver the result (rewrite vs tools) — which is the
 * variable under test.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { Condition } from "../conditions/types.js";

function deliverySentence(condition: Condition): string {
	switch (condition.kind) {
		case "rewrite":
			return `Reply with the complete updated ${condition.artifactName}.`;
		case "tools":
			return "Make the changes with the tools, then reply DONE.";
		case "patch":
			return "Reply with a JSON Patch that makes this change.";
	}
}

export function editMessage(
	condition: Condition,
	tree: BarkupNode,
	instruction: string,
): string {
	return `Here is the current tree:

${condition.serialize(tree)}

Edit request: ${instruction}

${deliverySentence(condition)}`;
}

export function constructionMessage(
	condition: Condition,
	spec: string,
	initialTree: BarkupNode | null,
): string {
	const current =
		initialTree !== null
			? `Here is the current tree (a bare root to build on):

${condition.serialize(initialTree)}

`
			: "";
	return `${current}Build request: create a tree that matches this specification exactly:

${spec}

${
	condition.kind === "rewrite"
		? `Reply with the complete ${condition.artifactName}.`
		: condition.kind === "patch"
			? "Reply with a JSON Patch that builds the tree."
			: "Build the tree with the tools, then reply DONE."
}`;
}

export function followUpMessage(
	condition: Condition,
	instruction: string,
): string {
	return `Next edit request: ${instruction}

${deliverySentence(condition)}`;
}

export function readingMessage(
	condition: Condition,
	tree: BarkupNode,
	question: string,
): string {
	return `Here is the tree:

${condition.serialize(tree)}

Question: ${question}
Answer with only the value, nothing else.`;
}
