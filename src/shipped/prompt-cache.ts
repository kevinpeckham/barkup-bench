/**
 * Study Z shipped artifact (docs/BRIEF-Z.md): VERBATIM port of
 * slx-replicator v3.185.0's `buildCachedSystem` (commit 34c942f) —
 * the system-array Anthropic cache layout with the breakpoint at the
 * static/dynamic seam. Do not "improve" anything here; character
 * identity with the shipped source is the point and
 * tests/standing.test.ts guards it.
 */

import type { SystemModelMessage } from "ai";

/**
 * Compose the two-block cached system layout: static prefix (cache
 * breakpoint) + dynamic tail. Blocks are joined by the model exactly
 * as if concatenated, so `staticBlock + dynamicBlock` remains the
 * canonical full-prompt text for tests and logging.
 */
export function buildCachedSystem(
	staticBlock: string,
	dynamicBlock: string,
): SystemModelMessage[] {
	const system: SystemModelMessage[] = [
		{
			content: staticBlock,
			providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
			role: "system",
		},
	];
	if (dynamicBlock) system.push({ content: dynamicBlock, role: "system" });
	return system;
}
