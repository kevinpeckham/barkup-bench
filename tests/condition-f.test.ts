/** Condition F: the id-anchored patch applier (pre-registered, BRIEF-F.md). */
import { describe, expect, test } from "bun:test";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { conditionF } from "../src/conditions/f.js";
import { findById, findParent } from "../src/tree.js";

const tree: BarkupNode = {
	type: "document",
	id: "d1",
	attributes: { title: "T" },
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

function apply(ops: unknown) {
	return conditionF.applyArtifact(JSON.stringify(ops), tree);
}

describe("condition F applier — happy paths", () => {
	test("set-attribute / set-name / remove-attribute", () => {
		const result = apply([
			{ op: "set-attribute", id: "t1", key: "content", value: "Hi." },
			{ op: "set-name", id: "b1", name: "hero" },
			{ op: "remove-attribute", id: "t1", key: "content" },
			{ op: "set-attribute", id: "t1", key: "content", value: "Bye." },
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(findById(result.node, "t1")?.attributes?.content).toBe("Bye.");
			expect(findById(result.node, "b1")?.name).toBe("hero");
		}
	});

	test("insert before / after / append via parentId", () => {
		const result = apply([
			{ op: "insert", node: { type: "widget-slot", id: "w2" }, before: "b1" },
			{ op: "insert", node: { type: "block", id: "b2" }, after: "w1" },
			{
				op: "insert",
				node: { type: "text-atom", id: "t2", attributes: { maxLength: 5 } },
				parentId: "b1",
			},
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			const p1 = findById(result.node, "p1") as BarkupNode;
			expect((p1.children ?? []).map((c) => c.id)).toEqual([
				"w2",
				"b1",
				"w1",
				"b2",
			]);
			const b1 = findById(result.node, "b1") as BarkupNode;
			expect((b1.children ?? []).map((c) => c.id)).toEqual(["t1", "i1", "t2"]);
		}
	});

	test("move with sibling anchors and cross-parent append", () => {
		const result = apply([
			{ op: "move", id: "i1", before: "t1" },
			{ op: "move", id: "b1", parentId: "p2" },
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			const b1 = findById(result.node, "b1") as BarkupNode;
			expect((b1.children ?? []).map((c) => c.id)).toEqual(["i1", "t1"]);
			expect(findParent(result.node, "b1")?.parent.id).toBe("p2");
		}
	});

	test("remove drops the subtree", () => {
		const result = apply([{ op: "remove", id: "b1" }]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(findById(result.node, "t1")).toBeNull();
			expect(findById(result.node, "w1")).not.toBeNull();
		}
	});
});

describe("condition F applier — failures are atomic and indexed", () => {
	test("stale id names the operation", () => {
		const result = apply([
			{ op: "set-name", id: "p1", name: "ok" },
			{ op: "set-attribute", id: "zzz", key: "title", value: "x" },
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]?.code).toBe("invalid-patch");
			expect(result.issues[0]?.message).toContain("Operation 1");
			expect(result.issues[0]?.message).toContain('"zzz"');
		}
	});

	test("ambiguous or missing placement anchors rejected", () => {
		expect(
			apply([
				{ op: "insert", node: { type: "page" }, before: "p1", parentId: "d1" },
			]).ok,
		).toBe(false);
		expect(apply([{ op: "insert", node: { type: "page" } }]).ok).toBe(false);
	});

	test("root guards and own-subtree moves rejected", () => {
		expect(apply([{ op: "remove", id: "d1" }]).ok).toBe(false);
		expect(apply([{ op: "move", id: "p1", parentId: "b1" }]).ok).toBe(false);
		expect(apply([{ op: "move", id: "b1", after: "t1" }]).ok).toBe(false);
	});

	test("unknown op rejected with the allowed list", () => {
		const result = apply([{ op: "replace", id: "t1" }]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues[0]?.message).toContain("allowed:");
	});

	test("patched tree still passes twin validation (containment)", () => {
		const result = apply([
			{ op: "insert", node: { type: "page", id: "p9" }, parentId: "b1" },
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.some((i) => i.code === "invalid-child")).toBe(true);
		}
	});

	test("base tree never mutated, even on multi-op failure", () => {
		apply([
			{ op: "remove", id: "w1" },
			{ op: "set-attribute", id: "zzz", key: "x", value: 1 },
		]);
		expect(findById(tree, "w1")).not.toBeNull();
	});
});
