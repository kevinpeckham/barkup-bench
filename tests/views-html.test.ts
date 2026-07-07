/**
 * Study J HTML view renderer (pre-registered, BRIEF-J.md). Grader
 * surface, so it gets tests: byte parity with condition A's
 * serialization on plain trees, placeholder/omission rendering,
 * structural equivalence with Study I's JSON views, and composition
 * with the shipped applier.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { buildView, referencedIds } from "../src/conditions/views.js";
import {
	buildViewTree,
	makeHtmlViewCondition,
	serializeViewHtml,
	viewGrammar,
} from "../src/conditions/views-html.js";
import type { Edit } from "../src/corpus/edits.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import { grammar } from "../src/grammar.js";
import { allIds } from "../src/tree.js";

const tree: BarkupNode = {
	type: "document",
	id: "doc",
	attributes: { title: "T" },
	children: [
		{
			type: "page",
			id: "p1",
			name: "intro",
			children: [
				{
					type: "block",
					id: "b1",
					children: [
						{ type: "text-atom", id: "t1", attributes: { maxLength: 80 } },
						{ type: "text-atom", id: "t2", attributes: { maxLength: 40 } },
					],
				},
				{
					type: "block",
					id: "b2",
					children: [{ type: "image-atom", id: "i1" }],
				},
			],
		},
		{
			type: "page",
			id: "p2",
			children: [{ type: "widget-slot", id: "w1" }],
		},
	],
};

describe("viewGrammar", () => {
	test("is byte-identical to the bench grammar on plain trees", () => {
		expect(viewGrammar.build(tree)).toBe(grammar.build(tree));
	});
});

describe("serializeViewHtml", () => {
	test("placeholders render as collapsed data-* elements", () => {
		const html = serializeViewHtml(tree, ["t1"], "focused");
		expect(html).toContain(
			'id="p2" data-collapsed="true" data-child-count="1"',
		);
		expect(html).toContain(
			'id="b2" data-collapsed="true" data-child-count="1"',
		);
		// Nothing below a placeholder leaks.
		expect(html).not.toContain('id="i1"');
		expect(html).not.toContain('id="w1"');
		// The spine keeps its real attributes.
		expect(html).toContain('data-max-length="80"');
	});

	test("minimal mode carries omission counts on the parent", () => {
		const html = serializeViewHtml(tree, ["t1"], "minimal");
		expect(html).toContain('data-omitted-children="1"');
		expect(html).not.toContain('id="p2"');
		expect(html).not.toContain('id="b2"');
	});

	test("children of a referenced node stay visible in order", () => {
		const html = serializeViewHtml(tree, ["b1"], "minimal");
		const t1 = html.indexOf('id="t1"');
		const t2 = html.indexOf('id="t2"');
		expect(t1).toBeGreaterThan(-1);
		expect(t2).toBeGreaterThan(t1);
	});

	test("is deterministic", () => {
		expect(serializeViewHtml(tree, ["t1"], "focused")).toBe(
			serializeViewHtml(tree, ["t1"], "focused"),
		);
	});
});

describe("structural equivalence with Study I's JSON views", () => {
	type ViewNode = {
		id?: string;
		collapsed?: boolean;
		childCount?: number;
		omittedChildren?: number;
		children?: ViewNode[];
	};
	function jsonShape(node: ViewNode): Record<string, unknown>[] {
		return [
			{
				id: node.id,
				collapsed: node.collapsed ?? false,
				childCount: node.childCount,
				omitted: node.omittedChildren,
			},
			...(node.children ?? []).flatMap((c) => jsonShape(c)),
		];
	}
	function htmlShape(node: BarkupNode): Record<string, unknown>[] {
		return [
			{
				id: node.id,
				collapsed: node.attributes?.collapsed === true,
				childCount: node.attributes?.childCount,
				omitted: node.attributes?.omittedChildren,
			},
			...(node.children ?? []).flatMap((c) => htmlShape(c)),
		];
	}

	test("same nodes, same collapse/omission metadata, both modes", () => {
		for (const focus of [["t1"], ["b1"], ["t1", "p2"]]) {
			for (const mode of ["focused", "minimal"] as const) {
				expect(htmlShape(buildViewTree(tree, focus, mode))).toEqual(
					jsonShape(buildView(tree, focus, mode) as ViewNode),
				);
			}
		}
	});
});

describe("makeHtmlViewCondition", () => {
	const edit: Edit = {
		kind: "set-attribute",
		nodeId: "t1",
		key: "maxLength",
		value: 120,
	};

	test("ids and prompts follow the pre-registration", () => {
		const fvh = makeHtmlViewCondition("focused", edit);
		const fth = makeHtmlViewCondition("minimal", edit);
		expect(fvh.id).toBe("FVH");
		expect(fth.id).toBe("FTH");
		expect(fvh.systemPrompt).toContain("HTML dialect");
		expect(fvh.systemPrompt).toContain("View rules:");
		expect(fvh.systemPrompt).toContain("camelCase attribute keys");
		expect(fth.systemPrompt).toBe(fvh.systemPrompt);
	});

	test("a patch against visible ids applies to the FULL tree", () => {
		const fth = makeHtmlViewCondition("minimal", edit);
		const patch = `[{"op": "set-attribute", "id": "t1", "key": "maxLength", "value": 120}]`;
		const applied = fth.applyArtifact(patch, tree);
		expect(applied.ok).toBe(true);
		if (applied.ok) expect(allIds(applied.node)).toEqual(allIds(tree));
	});
});

describe("size-extension corpus HTML views", () => {
	const corpus = JSON.parse(
		readFileSync("corpus/size-extension.json", "utf8"),
	) as Corpus;
	const tasks = corpus.tasks as TransformationTask[];

	test("every task renders in both modes with its focus expanded", () => {
		for (const task of tasks) {
			for (const mode of ["focused", "minimal"] as const) {
				const html = serializeViewHtml(
					task.tree,
					referencedIds(task.edit),
					mode,
				);
				for (const id of referencedIds(task.edit)) {
					expect(html).toContain(`id="${id}"`);
					expect(html).not.toContain(`id="${id}" data-collapsed`);
				}
			}
		}
	});

	test("HTML views are terser than their JSON twins", () => {
		for (const task of tasks.filter((t) => t.bucket === "xxxl")) {
			const ids = referencedIds(task.edit);
			const html = serializeViewHtml(task.tree, ids, "minimal").length;
			const json =
				`${JSON.stringify(buildView(task.tree, ids, "minimal"), null, 2)}\n`
					.length;
			expect(html).toBeLessThan(json);
		}
	});
});
