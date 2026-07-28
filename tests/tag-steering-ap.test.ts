/** Study AP grader validation (docs/BRIEF-AP.md — graders get unit tests). */
import { describe, expect, test } from "bun:test";
import {
	CellCatalog,
	scoreCell,
	tagSlug,
} from "../src/grading/tag-steering-ap.js";

const FIXTURE = [
	{ name: "AI", category: "other" },
	{ name: "LLMs", category: "other" },
	{ name: "Front-End", category: "other" },
	{ name: "Open Source", category: "other" },
	{ name: "eCommerce", category: "other" },
	{ name: "Security", category: "other" },
	{ name: "Databases", category: "other" },
];

function catalog(): CellCatalog {
	return new CellCatalog(FIXTURE);
}

describe("tagSlug (shipped algorithm)", () => {
	test("lowercases and hyphenates", () => {
		expect(tagSlug("Open Source")).toBe("open-source");
		expect(tagSlug("Front-End")).toBe("front-end");
		expect(tagSlug("eCommerce")).toBe("ecommerce");
	});
	test("strips marks and edge hyphens", () => {
		expect(tagSlug("React™")).toBe("react");
		expect(tagSlug("  weird!! name  ")).toBe("weird-name");
	});
});

describe("lint (shipped, verbatim messages)", () => {
	test("exact names pass silently", () => {
		expect(catalog().lint(["AI", "Front-End"])).toEqual([]);
	});
	test("slug-equivalent variants get did-you-mean", () => {
		const warnings = catalog().lint(["front-end", "open source"]);
		expect(warnings).toHaveLength(2);
		expect(warnings[0]?.message).toBe(
			'"front-end" is not a canonical tag — did you mean "Front-End"?',
		);
		expect(warnings[0]?.path).toBe("tags.0");
	});
	test("unknowns get the pick-from-tags_list message", () => {
		const warnings = catalog().lint(["Sourdough"]);
		expect(warnings[0]?.message).toBe(
			'"Sourdough" is not a canonical tag — pick from tags_list, or add it in Org Settings → Tags',
		);
	});
	test("non-arrays and blank entries are ignored", () => {
		expect(catalog().lint("AI")).toEqual([]);
		expect(catalog().lint(["", "  ", 3])).toEqual([]);
	});
});

describe("tag_create guard", () => {
	test("accepts a novel name and it joins the catalog + lint", () => {
		const c = catalog();
		expect(c.mint("GraphQL")).toEqual({ ok: true });
		expect(c.mints).toEqual(["GraphQL"]);
		expect(c.mintAttempts).toBe(1);
		expect(c.lint(["GraphQL"])).toEqual([]);
	});
	test("rejects slug-equivalent of a fixture name with the registered message", () => {
		const c = catalog();
		const result = c.mint("front end");
		expect(result).toEqual({
			ok: false,
			error:
				'"front end" is slug-equivalent to canonical tag "Front-End" — use "Front-End" instead.',
		});
		expect(c.mints).toEqual([]);
		expect(c.mintRejections).toEqual(["front end"]);
	});
	test("rejects slug-equivalent of a prior mint", () => {
		const c = catalog();
		expect(c.mint("GraphQL").ok).toBe(true);
		expect(c.mint("graphql").ok).toBe(false);
		expect(c.mintAttempts).toBe(2);
	});
	test("rejects empty and over-long names", () => {
		const c = catalog();
		expect(c.mint("   ").ok).toBe(false);
		expect(c.mint("x".repeat(41)).ok).toBe(false);
		expect(c.mint("x".repeat(40)).ok).toBe(true);
	});
});

describe("scoreCell — covered/trap", () => {
	test("canonical-clean passes; variant casing fails", () => {
		const clean = scoreCell({
			cls: "covered",
			arm: "AP-shipped",
			finalTags: ["AI", "LLMs"],
			catalog: catalog(),
		});
		expect(clean.conformant).toBe(true);
		expect(clean.canonicalClean).toBe(true);
		const drifted = scoreCell({
			cls: "trap",
			arm: "AP-fork",
			finalTags: ["llms"],
			catalog: catalog(),
		});
		expect(drifted.conformant).toBe(false);
	});
	test("empty and null are not clean", () => {
		expect(
			scoreCell({
				cls: "covered",
				arm: "AP-empty",
				finalTags: [],
				catalog: catalog(),
			}).conformant,
		).toBe(false);
		expect(
			scoreCell({
				cls: "covered",
				arm: "AP-empty",
				finalTags: null,
				catalog: catalog(),
			}).conformant,
		).toBe(false);
	});
	test("in AP-tool, any mint attempt (even rejected) breaks conformance", () => {
		const c = catalog();
		c.mint("front end"); // rejected, still an attempt
		expect(
			scoreCell({
				cls: "trap",
				arm: "AP-tool",
				finalTags: ["Front-End"],
				catalog: c,
			}).conformant,
		).toBe(false);
		expect(
			scoreCell({
				cls: "trap",
				arm: "AP-shipped",
				finalTags: ["Front-End"],
				catalog: catalog(),
			}).conformant,
		).toBe(true);
	});
});

describe("scoreCell — adjacent", () => {
	const acceptable = ["Security", "AI", "LLMs"];
	test("non-empty subset of acceptable passes", () => {
		expect(
			scoreCell({
				cls: "adjacent",
				arm: "AP-fork",
				finalTags: ["Security", "AI"],
				catalog: catalog(),
				acceptableTags: acceptable,
			}).conformant,
		).toBe(true);
	});
	test("a canonical but out-of-set tag fails", () => {
		expect(
			scoreCell({
				cls: "adjacent",
				arm: "AP-fork",
				finalTags: ["Security", "eCommerce"],
				catalog: catalog(),
				acceptableTags: acceptable,
			}).conformant,
		).toBe(false);
	});
	test("empty fails and an invented tag fails", () => {
		expect(
			scoreCell({
				cls: "adjacent",
				arm: "AP-empty",
				finalTags: [],
				catalog: catalog(),
				acceptableTags: acceptable,
			}).conformant,
		).toBe(false);
		const invented = scoreCell({
			cls: "adjacent",
			arm: "AP-shipped",
			finalTags: ["Security", "Prompt Injection"],
			catalog: catalog(),
			acceptableTags: acceptable,
		});
		expect(invented.conformant).toBe(false);
		expect(invented.inventedCount).toBe(1);
	});
	test("in AP-tool an accepted mint is permitted alongside acceptable tags", () => {
		const c = catalog();
		expect(c.mint("Prompt Injection").ok).toBe(true);
		expect(
			scoreCell({
				cls: "adjacent",
				arm: "AP-tool",
				finalTags: ["Prompt Injection", "Security"],
				catalog: c,
				acceptableTags: acceptable,
			}).conformant,
		).toBe(true);
	});
});

describe("scoreCell — foreign", () => {
	test("AP-shipped carries no conformance bit (both readings descriptive)", () => {
		const score = scoreCell({
			cls: "foreign",
			arm: "AP-shipped",
			finalTags: [],
			catalog: catalog(),
		});
		expect(score.conformant).toBeNull();
		expect(score.empty).toBe(true);
	});
	test("AP-fork and AP-empty: empty conforms, generalization does not", () => {
		for (const arm of ["AP-fork", "AP-empty"] as const) {
			expect(
				scoreCell({ cls: "foreign", arm, finalTags: [], catalog: catalog() })
					.conformant,
			).toBe(true);
			expect(
				scoreCell({
					cls: "foreign",
					arm,
					finalTags: ["AI"],
					catalog: catalog(),
				}).conformant,
			).toBe(false);
		}
	});
	test("AP-tool: empty or accepted-mint conforms; invention does not", () => {
		expect(
			scoreCell({
				cls: "foreign",
				arm: "AP-tool",
				finalTags: [],
				catalog: catalog(),
			}).conformant,
		).toBe(true);
		const minted = catalog();
		expect(minted.mint("Baking").ok).toBe(true);
		expect(
			scoreCell({
				cls: "foreign",
				arm: "AP-tool",
				finalTags: ["Baking"],
				catalog: minted,
			}).conformant,
		).toBe(true);
		expect(
			scoreCell({
				cls: "foreign",
				arm: "AP-tool",
				finalTags: ["Baking"],
				catalog: catalog(), // never actually minted
			}).conformant,
		).toBe(false);
	});
	test("null final tags conform nowhere", () => {
		for (const arm of ["AP-fork", "AP-empty", "AP-tool"] as const) {
			expect(
				scoreCell({ cls: "foreign", arm, finalTags: null, catalog: catalog() })
					.conformant,
			).toBe(false);
		}
	});
});
