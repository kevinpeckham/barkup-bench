/**
 * Pieces shared across conditions. The two format-spec renderers are
 * deliberately parallel — same section order, same level of detail —
 * because prompt parity is a fairness requirement (BRIEF: parity regime
 * is "mechanically equal prompt budgets/structure").
 */
import type {
	AttributeSpec,
	BarkupNode,
	GrammarConfig,
	GrammarIssue,
} from "@kevinpeckham/barkup";

function camelToKebab(key: string): string {
	return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function attributeLine(
	key: string,
	spec: AttributeSpec,
	html: boolean,
): string {
	const name = html ? `data-${camelToKebab(key)}` : key;
	return `${name} (${spec.type}${spec.required ? ", required" : ""})`;
}

/** One line per node type: tag/type, allowed children, attributes. */
export function grammarTypeLines(
	config: GrammarConfig,
	style: "html" | "json",
): string {
	const lines: string[] = [];
	for (const [type, spec] of Object.entries(config.nodes)) {
		const children = spec.children ?? [];
		const childText =
			children.length > 0 ? children.join(", ") : "(none — leaf node)";
		const attrs = Object.entries(spec.attributes ?? {}).map(([key, attr]) =>
			attributeLine(key, attr, style === "html"),
		);
		const attrText = attrs.length > 0 ? attrs.join(", ") : "(none)";
		const head =
			style === "html"
				? `<${spec.tag ?? "div"} data-type="${type}">`
				: `"${type}"`;
		lines.push(
			`- ${head} — allowed children: ${childText}; attributes: ${attrText}`,
		);
	}
	const roots = config.roots ?? Object.keys(config.nodes);
	lines.push(`- Root node type: ${roots.join(", ")}`);
	return lines.join("\n");
}

/** Canonical JSON serialization: fixed key order, 2-space indent (the counterpart of barkup's canonical build output). */
export function serializeJsonTree(tree: BarkupNode): string {
	return `${JSON.stringify(orderNode(tree), null, 2)}\n`;
}

function orderNode(node: BarkupNode): Record<string, unknown> {
	const out: Record<string, unknown> = { type: node.type };
	if (node.name !== undefined) out.name = node.name;
	if (node.id !== undefined) out.id = node.id;
	if (node.attributes && Object.keys(node.attributes).length > 0) {
		out.attributes = node.attributes;
	}
	if (node.children && node.children.length > 0) {
		out.children = node.children.map(orderNode);
	}
	return out;
}

/**
 * Extract the artifact from a model reply: the first fenced code block if
 * any, else the whole reply trimmed.
 */
export function extractArtifact(text: string): string {
	const fence = text.match(/```[a-zA-Z]*\r?\n([\s\S]*?)```/);
	if (fence?.[1] !== undefined) return fence[1].trim();
	return text.trim();
}

/** Issues formatted for the correction loop — the structured issues verbatim, one per line. */
export function formatIssuesFeedback(
	issues: readonly GrammarIssue[],
	artifactName: string,
): string {
	const lines = issues.map(
		(issue) => `- [${issue.code}] at ${issue.path}: ${issue.message}`,
	);
	return `Your ${artifactName} was not valid. Issues found:\n${lines.join(
		"\n",
	)}\n\nReply with the corrected complete ${artifactName}.`;
}
