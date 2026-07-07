/**
 * Generate the focused-view conformance vectors
 * (corpus/view-vectors.json, committed): a portable test suite for the
 * view dialect validated by Studies I and J, in the spirit of
 * corpus/patch-vectors.json. Each vector is {name, tree, focus, mode,
 * expected} where expected is {ok: true, html} (the exact HTML-dialect
 * rendering) or {ok: false} (unknown focus id). Expectations are
 * computed with the benchmark's renderer (src/conditions/views-html.ts,
 * the implementation Study J scored). A shipped implementation of the
 * view dialect proves conformance by replaying this file against the
 * benchmark grammar (src/grammar.ts BENCH_CONFIG).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { treeArbitrary } from "@kevinpeckham/barkup/testing";
import fc from "fast-check";
import type { ViewMode } from "../src/conditions/views.js";
import { serializeViewHtml } from "../src/conditions/views-html.js";
import { BENCH_CONFIG } from "../src/grammar.js";
import { allIds, assignSequentialIds } from "../src/tree.js";

const BASE: BarkupNode = {
	type: "document",
	id: "d1",
	attributes: { title: "Vectors" },
	children: [
		{
			type: "page",
			id: "p1",
			name: "intro",
			attributes: { layoutSize: "narrow" },
			children: [
				{
					type: "block",
					id: "b1",
					children: [
						{
							type: "text-atom",
							id: "t1",
							attributes: { maxLength: 80, content: "Hi." },
						},
						{ type: "image-atom", id: "i1" },
					],
				},
				{
					type: "widget-slot",
					id: "w1",
					attributes: { allowedWidgetIds: ["a", "b"] },
				},
			],
		},
		{ type: "page", id: "p2" },
	],
};

interface Vector {
	name: string;
	tree: BarkupNode;
	focus: string[];
	mode: ViewMode;
	expected: { ok: true; html: string } | { ok: false };
}

const CURATED: { name: string; tree?: BarkupNode; focus: string[] }[] = [
	{ name: "leaf focus", focus: ["t1"] },
	{ name: "container focus (insert target)", focus: ["b1"] },
	{ name: "multi-focus (move: node + destination)", focus: ["t1", "p2"] },
	{ name: "root focus", focus: ["d1"] },
	{ name: "json-attribute node in focus", focus: ["w1"] },
	{ name: "focus with spine child of focus node", focus: ["t1", "p1"] },
	{ name: "childless placeholder keeps childCount 0", focus: ["i1"] },
];

const vectors: Vector[] = [];
for (const { name, tree, focus } of CURATED) {
	for (const mode of ["focused", "minimal"] as ViewMode[]) {
		const t = tree ?? BASE;
		vectors.push({
			name: `${name} (${mode})`,
			tree: t,
			focus,
			mode,
			expected: { ok: true, html: serializeViewHtml(t, focus, mode) },
		});
	}
}
vectors.push({
	name: "unknown focus id rejected",
	tree: BASE,
	focus: ["zzz"],
	mode: "focused",
	expected: { ok: false },
});

// Seeded random vectors over grammar-arbitrary trees for breadth.
const samples = fc.sample(
	treeArbitrary(BENCH_CONFIG, { maxDepth: 4, maxChildren: 4 }),
	{ seed: 424244, numRuns: 12 },
);
samples.forEach((raw, i) => {
	const tree = assignSequentialIds(raw);
	const ids = allIds(tree);
	const focus = [ids[ids.length - 1] as string];
	for (const mode of ["focused", "minimal"] as ViewMode[]) {
		vectors.push({
			name: `random-${i}: deepest-id focus (${mode})`,
			tree,
			focus,
			mode,
			expected: { ok: true, html: serializeViewHtml(tree, focus, mode) },
		});
	}
});

mkdirSync("corpus", { recursive: true });
writeFileSync(
	"corpus/view-vectors.json",
	`${JSON.stringify({ version: 1, grammar: "src/grammar.ts BENCH_CONFIG", note: "view metadata renders as data-collapsed / data-child-count / data-omitted-children; validated by BRIEF-I/BRIEF-J", vectors }, null, "\t")}\n`,
);
console.log(`corpus/view-vectors.json — ${vectors.length} vectors`);
