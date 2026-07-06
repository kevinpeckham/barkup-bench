/**
 * Condition E — JSON Patch (RFC 6902), the common middle ground between
 * whole-artifact rewrite and granular tools. The model emits a patch
 * against the JSON serialization; application uses fast-json-patch (a
 * battle-tested implementation, so E is never penalized by a bug in our
 * patch engine); the patched tree then passes through the same twin
 * validator as conditions B and C.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import * as jsonpatch from "fast-json-patch";
import { BENCH_CONFIG } from "../grammar.js";
import { validateJsonValue } from "../twin/validate.js";
import {
	extractArtifact,
	formatSection,
	readingSystemPrompt,
	serializeJsonTree,
} from "./shared.js";
import type { ArtifactResult, PatchCondition } from "./types.js";

function applyArtifact(text: string, base: BarkupNode): ArtifactResult {
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
	if (!Array.isArray(parsed)) {
		return {
			ok: false,
			issues: [
				{
					code: "invalid-patch",
					message:
						"A JSON Patch must be an array of operations ({op, path, ...}).",
					path: "(patch)",
				},
			],
		};
	}

	const document = structuredClone(base) as unknown;
	try {
		const result = jsonpatch.applyPatch(
			document,
			parsed as jsonpatch.Operation[],
			true,
			true,
		);
		const patched = result.newDocument ?? document;
		const validated = validateJsonValue(
			BENCH_CONFIG,
			JSON.parse(JSON.stringify(patched)),
		);
		if (!validated.ok) return { ok: false, issues: validated.issues };
		return { ok: true, node: validated.node };
	} catch (error) {
		const patchError = error as jsonpatch.JsonPatchError;
		const index = patchError.index ?? "?";
		const operation =
			patchError.operation !== undefined
				? ` ${JSON.stringify(patchError.operation).slice(0, 160)}`
				: "";
		return {
			ok: false,
			issues: [
				{
					code: "invalid-patch",
					message: `Operation ${index} could not be applied: ${
						patchError.name ?? "error"
					}.${operation}`,
					path: `(patch op ${index})`,
				},
			],
		};
	}
}

export const conditionE: PatchCondition = {
	kind: "patch",
	id: "E",
	artifactName: "JSON Patch",
	systemPrompt: `You are an expert editor of typed content trees.

${formatSection("json")}

Editing rules:
- Reply with a JSON Patch: an RFC 6902 array of operations ({"op": "add" | "remove" | "replace" | "move" | "copy", "path": "/children/0/attributes/title", ...}) that will be applied to the tree exactly as shown.
- Paths address the JSON structure shown, with array positions by index (e.g. /children/1/children/0).
- Preserve every existing node id exactly; give every node you create a fresh unique "id" not used anywhere else in the tree.
- Change only what the request calls for; an operation that touches anything else is wrong.
- You may wrap the patch in a \`\`\`json code fence; output nothing else.`,
	readingSystemPrompt: readingSystemPrompt("json"),
	serialize: serializeJsonTree,
	applyArtifact,
};
