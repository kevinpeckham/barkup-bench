import type { BarkupNode, GrammarIssue } from "@kevinpeckham/barkup";
import type { ToolSet } from "ai";

export type ArtifactResult =
	| { ok: true; node: BarkupNode }
	| { ok: false; issues: GrammarIssue[] };

/** Whole-artifact rewrite conditions (A, and later B/E). */
export interface RewriteCondition {
	kind: "rewrite";
	id: string;
	/** e.g. "markup" / "JSON tree" — used in prompts and feedback. */
	artifactName: string;
	systemPrompt: string;
	readingSystemPrompt: string;
	serialize(tree: BarkupNode): string;
	parseArtifact(text: string): ArtifactResult;
}

/** Granular mutation-tool conditions (C, and later D). */
export interface ToolsCondition {
	kind: "tools";
	id: string;
	artifactName: string;
	systemPrompt: string;
	readingSystemPrompt: string;
	serialize(tree: BarkupNode): string;
	validateState(
		tree: BarkupNode,
	): { ok: true } | { ok: false; issues: GrammarIssue[] };
	createSession(initial: BarkupNode): ToolSession;
}

export interface ToolSession {
	state: { tree: BarkupNode };
	/** Failed tool calls — the "invalid intermediate state" metric. */
	toolErrorCount: number;
	tools: ToolSet;
}

export type Condition = RewriteCondition | ToolsCondition;
