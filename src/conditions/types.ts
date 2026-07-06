import type { BarkupNode, GrammarIssue } from "@kevinpeckham/barkup";
import type { ToolSet } from "ai";

/**
 * GrammarIssue widened so patch-application failures (condition E) can
 * carry their own code ("invalid-patch") while barkup/twin issues pass
 * through untouched.
 */
export interface BenchIssue {
	code: GrammarIssue["code"] | "invalid-patch";
	message: string;
	path: string;
	nodeId?: string;
	attribute?: string;
}

export type ArtifactResult =
	| { ok: true; node: BarkupNode }
	| { ok: false; issues: BenchIssue[] };

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
	): { ok: true } | { ok: false; issues: BenchIssue[] };
	createSession(initial: BarkupNode): ToolSession;
}

export interface ToolSession {
	state: { tree: BarkupNode };
	/** Failed tool calls — the "invalid intermediate state" metric. */
	toolErrorCount: number;
	tools: ToolSet;
}

/** JSON Patch condition (E): the artifact is a patch against a base tree. */
export interface PatchCondition {
	kind: "patch";
	id: string;
	artifactName: string;
	systemPrompt: string;
	readingSystemPrompt: string;
	serialize(tree: BarkupNode): string;
	applyArtifact(text: string, base: BarkupNode): ArtifactResult;
}

export type Condition = RewriteCondition | ToolsCondition | PatchCondition;
