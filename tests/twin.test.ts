/**
 * The twin validator must be exactly as strict as barkup — agreement is
 * proven two ways: (1) property test — random grammar-valid trees are
 * accepted by both sides and round-trip through the JSON serialization;
 * (2) example battery — every issue code fires, and for checks that
 * exist on both sides the twin's code AND message match barkup's.
 */
import { describe, expect, test } from "bun:test";
import { normalizeNode } from "@kevinpeckham/barkup";
import { nodesEqual, treeArbitrary } from "@kevinpeckham/barkup/testing";
import fc from "fast-check";
import { serializeJsonTree } from "../src/conditions/shared.js";
import { BENCH_CONFIG, grammar } from "../src/grammar.js";
import { parseJsonTree, validateJsonValue } from "../src/twin/validate.js";

describe("twin validator agreement with barkup", () => {
	test("accepts every grammar-valid random tree (and barkup agrees)", () => {
		fc.assert(
			fc.property(treeArbitrary(BENCH_CONFIG), (tree) => {
				const twinResult = validateJsonValue(
					BENCH_CONFIG,
					JSON.parse(JSON.stringify(tree)),
				);
				const barkupResult = grammar.validate(tree);
				expect(twinResult.ok).toBe(true);
				expect(barkupResult.ok).toBe(true);
				if (twinResult.ok) {
					expect(nodesEqual(twinResult.node, normalizeNode(tree))).toBe(true);
				}
			}),
			{ numRuns: 100 },
		);
	});

	test("serializeJsonTree → parseJsonTree is identity (normalized)", () => {
		fc.assert(
			fc.property(treeArbitrary(BENCH_CONFIG), (tree) => {
				const result = parseJsonTree(BENCH_CONFIG, serializeJsonTree(tree));
				expect(result.ok).toBe(true);
				if (result.ok) {
					expect(nodesEqual(result.node, tree)).toBe(true);
				}
			}),
			{ numRuns: 100 },
		);
	});
});

function issuesOf(input: unknown): { code: string; message: string }[] {
	const result = validateJsonValue(BENCH_CONFIG, input);
	if (result.ok) return [];
	return result.issues.map(({ code, message }) => ({ code, message }));
}

describe("twin issue codes", () => {
	test("parse-failed on malformed JSON", () => {
		const result = parseJsonTree(BENCH_CONFIG, "{not json");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]?.code).toBe("parse-failed");
		}
	});

	test("invalid-root on non-object and on array", () => {
		expect(issuesOf(42)[0]?.code).toBe("invalid-root");
		expect(issuesOf([{ type: "document" }])[0]?.code).toBe("invalid-root");
	});

	test("invalid-root on a non-root type — same message as barkup", () => {
		const twin = issuesOf({ type: "page" });
		const viaBarkup = grammar.validate({ type: "page" });
		expect(twin[0]?.code).toBe("invalid-root");
		if (!viaBarkup.ok) {
			expect(twin[0]?.message).toBe(viaBarkup.issues[0]?.message as string);
		}
	});

	test("unknown-type — same message as barkup", () => {
		const twin = issuesOf({
			type: "document",
			children: [{ type: "pagee" }],
		});
		const viaBarkup = grammar.validate({
			type: "document",
			children: [{ type: "pagee" }],
		});
		expect(twin.some((i) => i.code === "unknown-type")).toBe(true);
		if (!viaBarkup.ok) {
			const twinMsg = twin.find((i) => i.code === "unknown-type")?.message;
			const barkupMsg = viaBarkup.issues.find(
				(i) => i.code === "unknown-type",
			)?.message;
			expect(twinMsg).toBe(barkupMsg as string);
		}
	});

	test('missing "type" property', () => {
		expect(issuesOf({ children: [] })[0]?.code).toBe("unknown-type");
	});

	test("invalid-child containment — same message as barkup", () => {
		const bad = {
			type: "document",
			children: [{ type: "page", children: [{ type: "page" }] }],
		};
		const twin = issuesOf(bad);
		const viaBarkup = grammar.validate(bad);
		const twinMsg = twin.find((i) => i.code === "invalid-child")?.message;
		expect(twinMsg).toBeDefined();
		if (!viaBarkup.ok) {
			const barkupMsg = viaBarkup.issues.find(
				(i) => i.code === "invalid-child",
			)?.message;
			expect(twinMsg).toBe(barkupMsg as string);
		}
	});

	test("unknown-attribute — same message as barkup", () => {
		const bad = { type: "document", attributes: { titel: "x" } };
		const twin = issuesOf(bad);
		const viaBarkup = grammar.validate(bad);
		expect(twin[0]?.code).toBe("unknown-attribute");
		if (!viaBarkup.ok) {
			expect(twin[0]?.message).toBe(viaBarkup.issues[0]?.message as string);
		}
	});

	test("invalid-attribute-value on wrong primitive type", () => {
		const twin = issuesOf({ type: "document", attributes: { title: 5 } });
		expect(twin[0]?.code).toBe("invalid-attribute-value");
		expect(twin[0]?.message).toContain('declared "string"');
	});

	test("missing-attribute — same message as barkup", () => {
		const bad = {
			type: "document",
			children: [
				{
					type: "page",
					children: [{ type: "block", children: [{ type: "text-atom" }] }],
				},
			],
		};
		const twin = issuesOf(bad);
		const viaBarkup = grammar.validate(bad);
		const twinMsg = twin.find((i) => i.code === "missing-attribute")?.message;
		expect(twinMsg).toBeDefined();
		if (!viaBarkup.ok) {
			const barkupMsg = viaBarkup.issues.find(
				(i) => i.code === "missing-attribute",
			)?.message;
			expect(twinMsg).toBe(barkupMsg as string);
		}
	});

	test("duplicate-id — same message as barkup", () => {
		const bad = {
			type: "document",
			id: "x",
			children: [{ type: "page", id: "x" }],
		};
		const twin = issuesOf(bad);
		const viaBarkup = grammar.validate(bad);
		expect(twin[0]?.code).toBe("duplicate-id");
		if (!viaBarkup.ok) {
			expect(twin[0]?.message).toBe(viaBarkup.issues[0]?.message as string);
		}
	});

	test("reserved-attribute on unexpected node property", () => {
		const twin = issuesOf({ type: "document", props: {} });
		expect(twin[0]?.code).toBe("reserved-attribute");
	});

	test("unexpected-text on a bare string child", () => {
		const twin = issuesOf({ type: "document", children: ["hello"] });
		expect(twin[0]?.code).toBe("unexpected-text");
	});

	test("non-string id and malformed containers", () => {
		expect(
			issuesOf({ type: "document", id: 7 }).some(
				(i) => i.code === "invalid-attribute-value",
			),
		).toBe(true);
		expect(issuesOf({ type: "document", attributes: [] })[0]?.code).toBe(
			"invalid-attribute-value",
		);
		expect(issuesOf({ type: "document", children: {} })[0]?.code).toBe(
			"invalid-child",
		);
	});

	test("paths use barkup's format", () => {
		const result = validateJsonValue(BENCH_CONFIG, {
			type: "document",
			children: [
				{
					type: "page",
					name: "main",
					children: [{ type: "block", attributes: { featured: "yes" } }],
				},
			],
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]?.path).toBe("document > page(main) > block");
		}
	});
});
