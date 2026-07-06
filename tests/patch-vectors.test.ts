/**
 * Conformance: both the shipped package and the benchmark's reference
 * applier must reproduce every committed vector exactly. Alternate
 * implementations of the anchored-patch dialect conform by passing
 * this same file.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { applyAnchoredPatch } from "@kevinpeckham/barkup/patch";
import { nodesEqual } from "@kevinpeckham/barkup/testing";
import { conditionF } from "../src/conditions/f.js";
import { grammar } from "../src/grammar.js";

interface Vector {
	name: string;
	base: BarkupNode;
	patch: unknown;
	expected:
		| { ok: true; node: BarkupNode }
		| { ok: false; code: string; opIndex?: number };
}

const { vectors } = JSON.parse(
	readFileSync("corpus/patch-vectors.json", "utf8"),
) as { vectors: Vector[] };

describe("anchored-patch conformance vectors", () => {
	test("vector file is present and non-trivial", () => {
		expect(vectors.length).toBeGreaterThanOrEqual(30);
	});

	for (const vector of vectors) {
		test(`shipped: ${vector.name}`, () => {
			const result = applyAnchoredPatch(grammar, vector.base, vector.patch);
			expect(result.ok).toBe(vector.expected.ok);
			if (result.ok && vector.expected.ok) {
				expect(nodesEqual(result.node, vector.expected.node)).toBe(true);
			}
			if (!result.ok && !vector.expected.ok) {
				expect(result.issues[0]?.code).toBe(vector.expected.code as never);
				if (vector.expected.opIndex !== undefined) {
					expect(result.issues[0]?.opIndex).toBe(vector.expected.opIndex);
				}
			}
		});

		test(`reference: ${vector.name}`, () => {
			const result = conditionF.applyArtifact(
				JSON.stringify(vector.patch),
				vector.base,
			);
			expect(result.ok).toBe(vector.expected.ok);
			if (result.ok && vector.expected.ok) {
				expect(nodesEqual(result.node, vector.expected.node)).toBe(true);
			}
		});
	}
});
