/**
 * Generate the anchored-patch conformance vectors
 * (corpus/patch-vectors.json, committed): a portable test suite for
 * the dialect, in the spirit of the RFC 6902 test suite. Each vector
 * is {name, base, patch, expected} where expected is either
 * {ok: true, node} or {ok: false, code, opIndex?}. Expectations are
 * computed with the SHIPPED implementation
 * (@kevinpeckham/barkup/patch) and cross-checked against the
 * benchmark's reference applier — generation fails on any divergence.
 * Alternate implementations of the dialect can prove conformance by
 * replaying this file against the benchmark grammar (src/grammar.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { applyAnchoredPatch } from "@kevinpeckham/barkup/patch";
import { nodesEqual, treeArbitrary } from "@kevinpeckham/barkup/testing";
import fc from "fast-check";
import { conditionF } from "../src/conditions/f.js";
import { BENCH_CONFIG, grammar } from "../src/grammar.js";
import { assignSequentialIds } from "../src/tree.js";

const BASE: BarkupNode = {
	type: "document",
	id: "d1",
	attributes: { title: "Vectors" },
	children: [
		{
			type: "page",
			id: "p1",
			children: [
				{
					type: "block",
					id: "b1",
					children: [
						{ type: "text-atom", id: "t1", attributes: { maxLength: 80 } },
						{ type: "image-atom", id: "i1" },
					],
				},
				{ type: "widget-slot", id: "w1" },
			],
		},
		{ type: "page", id: "p2" },
	],
};

interface Vector {
	name: string;
	base: BarkupNode;
	patch: unknown;
	expected:
		| { ok: true; node: BarkupNode }
		| { ok: false; code: string; opIndex?: number };
}

const CURATED: { name: string; base?: BarkupNode; patch: unknown }[] = [
	{
		name: "set-attribute happy",
		patch: [{ op: "set-attribute", id: "t1", key: "content", value: "Hi." }],
	},
	{
		name: "set-attribute overwrite",
		patch: [{ op: "set-attribute", id: "t1", key: "maxLength", value: 40 }],
	},
	{
		name: "remove-attribute happy",
		patch: [{ op: "remove-attribute", id: "d1", key: "title" }],
	},
	{
		name: "remove-attribute absent",
		patch: [{ op: "remove-attribute", id: "t1", key: "content" }],
	},
	{
		name: "set-name happy",
		patch: [{ op: "set-name", id: "b1", name: "hero" }],
	},
	{ name: "remove subtree", patch: [{ op: "remove", id: "b1" }] },
	{ name: "remove root rejected", patch: [{ op: "remove", id: "d1" }] },
	{
		name: "insert before sibling",
		patch: [
			{ op: "insert", node: { type: "widget-slot", id: "w2" }, before: "b1" },
		],
	},
	{
		name: "insert after sibling",
		patch: [{ op: "insert", node: { type: "block", id: "b2" }, after: "w1" }],
	},
	{
		name: "insert append via parentId",
		patch: [
			{
				op: "insert",
				node: { type: "text-atom", id: "t2", attributes: { maxLength: 5 } },
				parentId: "b1",
			},
		],
	},
	{
		name: "insert missing required attribute rejected at validation",
		patch: [
			{ op: "insert", node: { type: "text-atom", id: "t9" }, parentId: "b1" },
		],
	},
	{
		name: "insert bad containment rejected",
		patch: [{ op: "insert", node: { type: "page", id: "p9" }, parentId: "b1" }],
	},
	{
		name: "insert duplicate id rejected",
		patch: [
			{ op: "insert", node: { type: "block", id: "b1" }, parentId: "p2" },
		],
	},
	{
		name: "move before sibling",
		patch: [{ op: "move", id: "i1", before: "t1" }],
	},
	{
		name: "move cross-parent append",
		patch: [{ op: "move", id: "b1", parentId: "p2" }],
	},
	{
		name: "move root rejected",
		patch: [{ op: "move", id: "d1", parentId: "p2" }],
	},
	{
		name: "move into own subtree rejected",
		patch: [{ op: "move", id: "p1", parentId: "b1" }],
	},
	{
		name: "anchor ambiguity rejected",
		patch: [
			{ op: "insert", node: { type: "page" }, before: "p1", parentId: "d1" },
		],
	},
	{
		name: "anchor missing rejected",
		patch: [{ op: "insert", node: { type: "page" } }],
	},
	{
		name: "stale id names op index",
		patch: [
			{ op: "set-name", id: "p1", name: "ok" },
			{ op: "set-attribute", id: "zzz", key: "title", value: "x" },
		],
	},
	{ name: "unknown op rejected", patch: [{ op: "replace", id: "t1" }] },
	{
		name: "atomicity: later failure rejects earlier ops",
		patch: [
			{ op: "remove", id: "w1" },
			{ op: "remove", id: "zzz" },
		],
	},
	{
		name: "multi-op compound edit",
		patch: [
			{
				op: "insert",
				node: { type: "block", id: "b9", attributes: { featured: true } },
				after: "b1",
			},
			{ op: "move", id: "t1", parentId: "b9" },
			{ op: "set-attribute", id: "t1", key: "content", value: "Moved." },
			{ op: "set-name", id: "b9", name: "landing" },
		],
	},
	{ name: "non-array patch rejected", patch: { op: "remove", id: "t1" } },
	{
		name: "sequential anchors resolve against current state",
		patch: [
			{ op: "insert", node: { type: "block", id: "b3" }, before: "w1" },
			{ op: "insert", node: { type: "block", id: "b4" }, before: "b3" },
		],
	},
];

function computeExpected(base: BarkupNode, patch: unknown): Vector["expected"] {
	const shipped = applyAnchoredPatch(grammar, base, patch);
	const reference = conditionF.applyArtifact(JSON.stringify(patch), base);
	if (shipped.ok !== reference.ok) {
		throw new Error("Divergence between shipped and reference applier");
	}
	if (shipped.ok && reference.ok) {
		if (!nodesEqual(shipped.node, reference.node)) {
			throw new Error("Tree divergence between shipped and reference applier");
		}
		return { ok: true, node: shipped.node };
	}
	if (!shipped.ok) {
		const issue = shipped.issues[0];
		return {
			ok: false,
			code: issue?.code ?? "invalid-patch",
			...(issue?.opIndex !== undefined ? { opIndex: issue.opIndex } : {}),
		};
	}
	throw new Error("unreachable");
}

const vectors: Vector[] = CURATED.map(({ name, base, patch }) => ({
	name,
	base: base ?? BASE,
	patch,
	expected: computeExpected(base ?? BASE, patch),
}));

// Seeded random vectors over grammar-arbitrary trees for breadth.
const samples = fc.sample(
	treeArbitrary(BENCH_CONFIG, { maxDepth: 3, maxChildren: 3 }),
	{ seed: 424243, numRuns: 15 },
);
samples.forEach((raw, i) => {
	const base = assignSequentialIds(raw);
	const firstId = base.id as string;
	const patch = [
		{ op: "set-name", id: firstId, name: `vec-${i}` },
		{ op: "insert", node: { type: "page", id: `vp-${i}` }, parentId: firstId },
	];
	vectors.push({
		name: `random-${i}: rename root + append page`,
		base,
		patch,
		expected: computeExpected(base, patch),
	});
});

mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/patch-vectors.json",
	`${JSON.stringify({ version: 1, grammar: "src/grammar.ts BENCH_CONFIG", vectors }, null, "\t")}\n`,
);
console.log(
	`corpus/patch-vectors.json — ${vectors.length} vectors, all cross-checked`,
);
