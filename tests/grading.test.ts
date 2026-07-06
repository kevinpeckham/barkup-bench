/** Graders measure nothing unless they are themselves validated. */
import { describe, expect, test } from "bun:test";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { driftCount } from "../src/grading/drift.js";
import {
	equalExact,
	equalModuloAllIds,
	equalModuloNewIds,
	eraseAllIds,
} from "../src/grading/equal.js";
import { answersMatch, normalizeAnswer } from "../src/grading/reading.js";
import { allIds } from "../src/tree.js";

const source: BarkupNode = {
	type: "document",
	id: "d1",
	children: [
		{
			type: "page",
			id: "p1",
			children: [
				{
					type: "block",
					id: "b1",
					attributes: { featured: false },
				},
				{ type: "widget-slot", id: "w1" },
			],
		},
	],
};

describe("equality graders", () => {
	test("equalModuloAllIds ignores every id, nothing else", () => {
		const relabeled = JSON.parse(
			JSON.stringify(source).replaceAll("p1", "x9"),
		) as BarkupNode;
		expect(equalModuloAllIds(source, relabeled)).toBe(true);
		const changed = structuredClone(source);
		const changedPage = (changed.children as BarkupNode[])[0] as BarkupNode;
		changedPage.attributes = { layoutSize: "wide" };
		expect(equalModuloAllIds(source, changed)).toBe(false);
	});

	test("equalModuloNewIds: new-node ids free, source ids enforced", () => {
		const sourceIds = new Set(allIds(source));
		// Expected: a new block appended with some id we chose.
		const expected = structuredClone(source);
		const page = (expected.children as BarkupNode[])[0] as BarkupNode;
		page.children = [
			...(page.children as BarkupNode[]),
			{ type: "block", id: "gt-new" },
		];
		// Actual: same content, different new-node id.
		const actual = JSON.parse(
			JSON.stringify(expected).replaceAll("gt-new", "m1"),
		) as BarkupNode;
		expect(equalModuloNewIds(expected, actual, sourceIds)).toBe(true);
		// But renaming a SOURCE id fails.
		const badActual = JSON.parse(
			JSON.stringify(expected).replaceAll('"b1"', '"zz"'),
		) as BarkupNode;
		expect(equalModuloNewIds(expected, badActual, sourceIds)).toBe(false);
	});

	test("equalExact requires ids too", () => {
		expect(equalExact(source, structuredClone(source))).toBe(true);
		const relabeled = JSON.parse(
			JSON.stringify(source).replaceAll("w1", "w2"),
		) as BarkupNode;
		expect(equalExact(source, relabeled)).toBe(false);
	});

	test("eraseAllIds leaves no ids", () => {
		expect(allIds(eraseAllIds(source)).length).toBe(0);
	});
});

describe("driftCount", () => {
	// The edit: set featured=true on b1.
	const expected = structuredClone(source);
	{
		const page = (expected.children as BarkupNode[])[0] as BarkupNode;
		const blockB1 = (page.children as BarkupNode[])[0] as BarkupNode;
		blockB1.attributes = { featured: true };
	}

	test("perfect edit → drift 0", () => {
		expect(driftCount(source, expected, structuredClone(expected))).toBe(0);
	});

	test("uncalled-for attribute change counts", () => {
		const actual = structuredClone(expected);
		actual.attributes = { title: "Sneaky" };
		expect(driftCount(source, expected, actual)).toBe(1);
	});

	test("uncalled-for removal counts", () => {
		const actual = structuredClone(expected);
		const page = (actual.children as BarkupNode[])[0] as BarkupNode;
		page.children = (page.children as BarkupNode[]).slice(0, 1); // dropped w1
		expect(driftCount(source, expected, actual)).toBe(1);
	});

	test("uncalled-for insertion counts", () => {
		const actual = structuredClone(expected);
		const page = (actual.children as BarkupNode[])[0] as BarkupNode;
		page.children = [
			...(page.children as BarkupNode[]),
			{ type: "block", id: "extra" },
		];
		expect(driftCount(source, expected, actual)).toBe(1);
	});

	test("failing to make the edit counts as drift-from-expected? No — drift counts only extra changes", () => {
		// Actual = source unchanged: the called-for change is missing (task
		// fails on success), but no UNcalled-for change happened → drift 0.
		expect(driftCount(source, expected, structuredClone(source))).toBe(0);
	});
});

describe("reading answers", () => {
	test("normalizeAnswer strips wrapping", () => {
		expect(normalizeAnswer("The answer is:\n**3**")).toBe("3");
		expect(normalizeAnswer('`"wide"`')).toBe("wide");
		expect(normalizeAnswer("4.")).toBe("4");
	});

	test("numeric-aware", () => {
		expect(answersMatch("3", "There are 3.\n3")).toBe(true);
		expect(answersMatch("3", "4")).toBe(false);
		expect(answersMatch("80", "80.0")).toBe(true);
	});

	test("string answers exact", () => {
		expect(answersMatch("text-atom", "text-atom")).toBe(true);
		expect(answersMatch("text-atom", '"text-atom"')).toBe(true);
		expect(answersMatch("text-atom", "image-atom")).toBe(false);
	});

	test("json answers compare structurally", () => {
		expect(answersMatch('["wgt-a","wgt-b"]', '[ "wgt-a", "wgt-b" ]')).toBe(
			true,
		);
		expect(answersMatch('["wgt-a","wgt-b"]', '["wgt-b","wgt-a"]')).toBe(false);
		expect(answersMatch("true", "true")).toBe(true);
	});
});
