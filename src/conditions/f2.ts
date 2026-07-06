/**
 * Condition F2 — the dogfood replica of F: identical prompts and
 * dialect, but application goes through the SHIPPED package
 * (`@kevinpeckham/barkup/patch` 0.2.0, applyAnchoredPatch) instead of
 * the benchmark's reference applier. Not part of the pre-registered
 * condition registry; exists to validate that the released artifact
 * behaves identically to the implementation the benchmark validated
 * (Tier-1 QA — see tests/patch-dogfood.test.ts and the conformance
 * vectors).
 */

import type { BarkupNode } from "@kevinpeckham/barkup";
import { applyAnchoredPatch } from "@kevinpeckham/barkup/patch";
import { grammar } from "../grammar.js";
import { conditionF } from "./f.js";
import { extractArtifact } from "./shared.js";
import type { ArtifactResult, PatchCondition } from "./types.js";

export function applyShipped(text: string, base: BarkupNode): ArtifactResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(extractArtifact(text));
	} catch (error) {
		return {
			ok: false,
			issues: [
				{
					code: "parse-failed",
					message: `The input could not be parsed as JSON: ${
						error instanceof Error ? error.message : String(error)
					}`,
					path: "(patch)",
				},
			],
		};
	}
	const result = applyAnchoredPatch(grammar, base, parsed);
	if (result.ok) return { ok: true, node: result.node };
	return {
		ok: false,
		issues: result.issues.map((issue) => ({
			code: issue.code,
			message: issue.message,
			path: issue.path,
			...(issue.nodeId !== undefined ? { nodeId: issue.nodeId } : {}),
			...(issue.attribute !== undefined ? { attribute: issue.attribute } : {}),
		})),
	};
}

export const conditionF2: PatchCondition = {
	...conditionF,
	id: "F2",
	applyArtifact: applyShipped,
};
