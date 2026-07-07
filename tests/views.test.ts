/**
 * Study I view renderer (pre-registered, BRIEF-I.md). The view decides
 * what the model can see, so it is grader surface and gets tests:
 * spine expansion, placeholder honesty (real ids, real child counts),
 * omission accounting, and composition with the shipped patch applier.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { serializeJsonTree } from "../src/conditions/shared.js";
import {
	buildView,
	makeViewCondition,
	referencedIds,
	serializeView,
} from "../src/conditions/views.js";
import type { Edit } from "../src/corpus/edits.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import { allIds, countNodes } from "../src/tree.js";

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

type ViewNode = {
	type: string;
	id?: string;
	name?: string;
	attributes?: Record<string, unknown>;
	children?: ViewNode[];
	collapsed?: boolean;
	childCount?: number;
	omittedChildren?: number;
};

function collect(view: ViewNode): ViewNode[] {
	return [view, ...(view.children ?? []).flatMap((c) => collect(c))];
}

function byId(view: ViewNode, id: string): ViewNode | undefined {
	return collect(view).find((n) => n.id === id);
}

describe("referencedIds", () => {
	test("covers every edit kind", () => {
		expect(
			referencedIds({
				kind: "set-attribute",
				nodeId: "t1",
				key: "k",
				value: 1,
			}),
		).toEqual(["t1"]);
		expect(
			referencedIds({ kind: "set-name", nodeId: "b1", name: "x" }),
		).toEqual(["b1"]);
		expect(referencedIds({ kind: "remove-node", nodeId: "b2" })).toEqual([
			"b2",
		]);
		expect(
			referencedIds({
				kind: "insert-node",
				parentId: "p1",
				index: 0,
				node: { type: "block" },
			}),
		).toEqual(["p1"]);
		expect(
			referencedIds({
				kind: "move-node",
				nodeId: "t1",
				newParentId: "b2",
				index: 0,
			}),
		).toEqual(["t1", "b2"]);
	});
});

describe("buildView — focused (FV)", () => {
	const view = buildView(tree, ["t1"], "focused") as ViewNode;

	test("spine renders fully, with attributes", () => {
		for (const id of ["doc", "p1", "b1", "t1"]) {
			const node = byId(view, id) as ViewNode;
			expect(node.collapsed).toBeUndefined();
		}
		expect((byId(view, "t1") as ViewNode).attributes).toEqual({
			maxLength: 80,
		});
		expect((byId(view, "doc") as ViewNode).attributes).toEqual({ title: "T" });
	});

	test("off-spine nodes are placeholders with honest child counts", () => {
		const p2 = byId(view, "p2") as ViewNode;
		expect(p2.collapsed).toBe(true);
		expect(p2.childCount).toBe(1);
		expect(p2.children).toBeUndefined();
		expect(p2.attributes).toBeUndefined();
		const b2 = byId(view, "b2") as ViewNode;
		expect(b2.collapsed).toBe(true);
		expect(b2.childCount).toBe(1);
	});

	test("nothing below a placeholder leaks", () => {
		expect(byId(view, "i1")).toBeUndefined();
		expect(byId(view, "w1")).toBeUndefined();
	});

	test("every visible id exists in the source tree", () => {
		const source = new Set(allIds(tree));
		for (const node of collect(view)) {
			if (node.id !== undefined) expect(source.has(node.id)).toBe(true);
		}
	});
});

describe("buildView — minimal (FT)", () => {
	const view = buildView(tree, ["t1"], "minimal") as ViewNode;

	test("non-spine siblings are omitted with counts", () => {
		const doc = byId(view, "doc") as ViewNode;
		expect(doc.omittedChildren).toBe(1); // p2
		expect(byId(view, "p2")).toBeUndefined();
		const p1 = byId(view, "p1") as ViewNode;
		expect(p1.omittedChildren).toBe(1); // b2
		expect(byId(view, "b2")).toBeUndefined();
	});

	test("children of a referenced node still appear as placeholders", () => {
		const insertView = buildView(tree, ["b1"], "minimal") as ViewNode;
		const b1 = byId(insertView, "b1") as ViewNode;
		expect(b1.children?.map((c) => c.id)).toEqual(["t1", "t2"]);
		expect(b1.children?.every((c) => c.collapsed === true)).toBe(true);
		expect(b1.omittedChildren).toBeUndefined();
	});
});

describe("buildView — placement and multi-focus cases", () => {
	test("move: both the node and the destination are in focus", () => {
		const view = buildView(tree, ["t1", "p2"], "minimal") as ViewNode;
		expect((byId(view, "t1") as ViewNode).collapsed).toBeUndefined();
		expect((byId(view, "p2") as ViewNode).collapsed).toBeUndefined();
		// The destination's child list is visible for ordinal placement.
		const p2 = byId(view, "p2") as ViewNode;
		expect(p2.children?.map((c) => c.id)).toEqual(["w1"]);
	});

	test("a spine child of a focus node recurses instead of collapsing", () => {
		const view = buildView(tree, ["t1", "p1"], "focused") as ViewNode;
		// b1 is both a child of focus node p1 and on the spine to t1.
		const b1 = byId(view, "b1") as ViewNode;
		expect(b1.collapsed).toBeUndefined();
		expect(b1.children?.some((c) => c.id === "t1")).toBe(true);
	});

	test("focus id missing from the tree throws loudly", () => {
		expect(() => buildView(tree, ["nope"], "focused")).toThrow(/corpus bug/);
	});
});

describe("serializeView", () => {
	test("is deterministic", () => {
		const a = serializeView(tree, ["t1"], "focused");
		const b = serializeView(tree, ["t1"], "focused");
		expect(a).toBe(b);
	});
});

describe("makeViewCondition", () => {
	const edit: Edit = {
		kind: "set-attribute",
		nodeId: "t1",
		key: "maxLength",
		value: 120,
	};

	test("ids and prompts follow the pre-registration", () => {
		const fv = makeViewCondition("focused", edit);
		const ft = makeViewCondition("minimal", edit);
		expect(fv.id).toBe("FV");
		expect(ft.id).toBe("FT");
		expect(fv.systemPrompt).toContain("View rules:");
		expect(fv.systemPrompt).toContain("anchored patch");
		expect(ft.systemPrompt).toBe(fv.systemPrompt);
	});

	test("a patch against visible ids applies to the FULL tree", () => {
		const fv = makeViewCondition("focused", edit);
		const patch = `[{"op": "set-attribute", "id": "t1", "key": "maxLength", "value": 120}]`;
		const applied = fv.applyArtifact(patch, tree);
		expect(applied.ok).toBe(true);
		if (applied.ok) {
			// Untouched hidden regions survive byte-for-byte.
			expect(allIds(applied.node)).toEqual(allIds(tree));
		}
	});
});

describe("size-extension corpus views", () => {
	const corpus = JSON.parse(
		readFileSync("corpus/size-extension.json", "utf8"),
	) as Corpus;
	const tasks = corpus.tasks as TransformationTask[];

	test("every task renders in both modes with its focus fully visible", () => {
		for (const task of tasks) {
			for (const mode of ["focused", "minimal"] as const) {
				const view = buildView(
					task.tree,
					referencedIds(task.edit),
					mode,
				) as ViewNode;
				for (const id of referencedIds(task.edit)) {
					const node = byId(view, id) as ViewNode;
					expect(node).toBeDefined();
					expect(node.collapsed).toBeUndefined();
				}
			}
		}
	});

	test("views shrink xxxl inputs to a fraction of the full tree", () => {
		for (const task of tasks.filter((t) => t.bucket === "xxxl")) {
			const full = serializeJsonTree(task.tree).length;
			const fv = serializeView(
				task.tree,
				referencedIds(task.edit),
				"focused",
			).length;
			expect(fv).toBeLessThan(full * 0.35);
			expect(countNodes(task.tree)).toBeGreaterThanOrEqual(800);
		}
	});
});
