/**
 * Tier-1 QA: the shipped `@kevinpeckham/barkup/patch` applier must be
 * behaviorally identical to the benchmark's reference applier
 * (condition F). Differential property test: random trees × random
 * anchored-op sequences (valid and invalid) → identical verdicts, and
 * identical resulting trees on success.
 */
import { describe, expect, test } from "bun:test";
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { nodesEqual, treeArbitrary } from "@kevinpeckham/barkup/testing";
import fc from "fast-check";
import { conditionF } from "../src/conditions/f.js";
import { applyShipped } from "../src/conditions/f2.js";
import { BENCH_CONFIG } from "../src/grammar.js";
import { allIds, assignSequentialIds } from "../src/tree.js";

/** Ops built from a tree's real ids, with occasional deliberate corruption. */
function opsArbitrary(tree: BarkupNode): fc.Arbitrary<unknown[]> {
	const ids = allIds(tree);
	const idArb = fc.oneof(
		{ weight: 8, arbitrary: fc.constantFrom(...ids) },
		{ weight: 1, arbitrary: fc.constant("zzz-stale") },
	);
	const keyArb = fc.constantFrom(
		"title",
		"theme",
		"layoutSize",
		"featured",
		"maxLength",
		"content",
		"requireBleed",
		"bogusKey",
	);
	const valueArb: fc.Arbitrary<AttributeValue> = fc.oneof(
		fc.string(),
		fc.integer({ min: 0, max: 200 }),
		fc.boolean(),
	);
	const typeArb = fc.constantFrom(
		"page",
		"block",
		"text-atom",
		"widget-slot",
		"image-atom",
		"bogus-type",
	);
	let fresh = 0;
	const newNodeArb: fc.Arbitrary<BarkupNode> = fc
		.record({ type: typeArb, withMax: fc.boolean() })
		.map(({ type, withMax }) => {
			fresh += 1;
			const node: BarkupNode = { type, id: `fresh-${fresh}` };
			if (withMax && type === "text-atom") {
				node.attributes = { maxLength: 50 };
			}
			return node;
		});
	const placementArb = fc.oneof(
		idArb.map((id) => ({ before: id })),
		idArb.map((id) => ({ after: id })),
		idArb.map((id) => ({ parentId: id })),
		// Corrupt placements: none, or two anchors.
		fc.constant({}),
		idArb.map((id) => ({ before: id, parentId: id })),
	);
	const opArb: fc.Arbitrary<unknown> = fc.oneof(
		{
			weight: 4,
			arbitrary: fc
				.record({ id: idArb, key: keyArb, value: valueArb })
				.map((o) => ({ op: "set-attribute", ...o })),
		},
		{
			weight: 2,
			arbitrary: fc
				.record({ id: idArb, name: fc.stringMatching(/^[a-z]{2,8}$/) })
				.map((o) => ({ op: "set-name", ...o })),
		},
		{
			weight: 2,
			arbitrary: fc
				.record({ id: idArb, key: keyArb })
				.map((o) => ({ op: "remove-attribute", ...o })),
		},
		{ weight: 1, arbitrary: idArb.map((id) => ({ op: "remove", id })) },
		{
			weight: 2,
			arbitrary: fc
				.record({ node: newNodeArb, placement: placementArb })
				.map(({ node, placement }) => ({ op: "insert", node, ...placement })),
		},
		{
			weight: 2,
			arbitrary: fc
				.record({ id: idArb, placement: placementArb })
				.map(({ id, placement }) => ({ op: "move", id, ...placement })),
		},
		{ weight: 1, arbitrary: fc.constant({ op: "replace", id: "x" }) },
	);
	return fc.array(opArb, { minLength: 1, maxLength: 6 });
}

describe("shipped applyAnchoredPatch ≡ benchmark reference applier", () => {
	test("identical verdicts and trees over random trees × op sequences", () => {
		fc.assert(
			fc.property(
				treeArbitrary(BENCH_CONFIG).chain((raw) => {
					const tree = assignSequentialIds(raw);
					return fc
						.record({ ops: opsArbitrary(tree) })
						.map(({ ops }) => ({ tree, ops }));
				}),
				({ tree, ops }) => {
					const text = JSON.stringify(ops);
					const reference = conditionF.applyArtifact(text, tree);
					const shipped = applyShipped(text, tree);
					expect(shipped.ok).toBe(reference.ok);
					if (reference.ok && shipped.ok) {
						expect(nodesEqual(shipped.node, reference.node)).toBe(true);
					}
					if (!reference.ok && !shipped.ok) {
						// When both reject at op level, they must blame the same op.
						const refIndex =
							reference.issues[0]?.message.match(/Operation (\d+)/)?.[1];
						const shippedIndex =
							shipped.issues[0]?.message.match(/Operation (\d+)/)?.[1];
						if (refIndex !== undefined && shippedIndex !== undefined) {
							expect(shippedIndex).toBe(refIndex);
						}
					}
				},
			),
			{ numRuns: 150 },
		);
	}, 120_000);

	test("non-array and malformed payloads agree", () => {
		for (const text of ['{"op":"remove"}', "42", "null", "[not json"]) {
			const reference = conditionF.applyArtifact(text, {
				type: "document",
				id: "d1",
			});
			const shipped = applyShipped(text, { type: "document", id: "d1" });
			expect(shipped.ok).toBe(reference.ok);
			expect(shipped.ok).toBe(false);
		}
	});
});
