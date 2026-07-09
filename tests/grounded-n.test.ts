/**
 * Study N machinery (pre-registered, BRIEF-N.md). Grader-adjacent
 * surfaces: the find_nodes scorer decides what the search arm can see,
 * the stage-1 validator decides what counts as a grounding, and the
 * materialized embed focus decides what the embedding arm can see.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import {
	cosine,
	findNodesResult,
	GROUNDER_SYSTEM,
	grounderMessage,
	makeEmbedCondition,
	NO_MATCHES_MESSAGE,
	parseGrounding,
	SEARCH_SYSTEM_PROMPT,
	searchNodes,
} from "../src/conditions/grounded-n.js";
import { groundedTargetIds } from "../src/corpus/grounded.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
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
						{
							type: "text-atom",
							id: "t1",
							name: "hero",
							attributes: { maxLength: 80 },
						},
						{ type: "text-atom", id: "t2", attributes: { maxLength: 41 } },
					],
				},
				{ type: "block", id: "b2" },
			],
		},
		{ type: "page", id: "p2", name: "atlas" },
	],
};

describe("searchNodes / findNodesResult", () => {
	test("finds a named node and ranks it first", () => {
		const ids = searchNodes(tree, "hero text-atom");
		expect(ids[0]).toBe("t1");
	});

	test("excludes zero-score nodes entirely", () => {
		expect(searchNodes(tree, "zzzz qqqq")).toEqual([]);
		// A narrow query returns only matching nodes, not doc-order filler.
		const ids = searchNodes(tree, "atlas");
		expect(ids).toEqual(["p2"]);
	});

	test("caps at 5 with document-order ties", () => {
		const ids = searchNodes(tree, "page block text-atom document");
		expect(ids.length).toBeLessThanOrEqual(5);
	});

	test("no matches returns the structured message", () => {
		expect(findNodesResult(tree, "zzzz")).toBe(NO_MATCHES_MESSAGE);
	});

	test("matches render in place with their ancestors visible", () => {
		const view = findNodesResult(tree, "hero");
		expect(view).toContain('id="t1"');
		expect(view).toContain('id="b1"');
		expect(view).toContain('id="doc"');
	});
});

describe("prompts", () => {
	test("search prompt carries the HTML dialect and the search block", () => {
		expect(SEARCH_SYSTEM_PROMPT).toContain("HTML dialect");
		expect(SEARCH_SYSTEM_PROMPT).toContain("Search rules:");
		expect(SEARCH_SYSTEM_PROMPT).toContain("find_nodes");
		expect(SEARCH_SYSTEM_PROMPT).not.toContain("expand_node");
	});

	test("grounder prompt forbids editing and demands an id array", () => {
		expect(GROUNDER_SYSTEM).toContain("Do NOT perform the edit");
		expect(GROUNDER_SYSTEM).toContain("JSON array");
		const message = grounderMessage(tree, "Rename the hero.");
		expect(message).toContain('"hero"');
		expect(message).toContain("Rename the hero.");
	});
});

describe("parseGrounding", () => {
	test("accepts a plain and a fenced array, deduplicated", () => {
		const plain = parseGrounding('["t1", "b1", "t1"]', tree);
		expect(plain).toEqual({ ok: true, ids: ["t1", "b1"] });
		const fenced = parseGrounding('```json\n["p2"]\n```', tree);
		expect(fenced).toEqual({ ok: true, ids: ["p2"] });
	});

	test("rejects non-arrays, empty arrays, and non-strings", () => {
		expect(parseGrounding('{"ids": ["t1"]}', tree).ok).toBe(false);
		expect(parseGrounding("[]", tree).ok).toBe(false);
		expect(parseGrounding("[1, 2]", tree).ok).toBe(false);
		expect(parseGrounding("not json", tree).ok).toBe(false);
	});

	test("rejects unknown ids and names them", () => {
		const result = parseGrounding('["t1", "ghost"]', tree);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toContain('"ghost"');
	});
});

describe("cosine", () => {
	test("identical vectors score 1, orthogonal score 0", () => {
		expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
		expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
	});
});

describe("N-embed condition and materialized focus", () => {
	const corpus = JSON.parse(
		readFileSync("corpus/grounded.json", "utf8"),
	) as Corpus;
	const tasks = corpus.tasks as TransformationTask[];
	const embedFocus = JSON.parse(
		readFileSync("corpus/embed-focus.json", "utf8"),
	) as { model: string; k: number; focus: Record<string, string[]> };

	test("focus file covers every task with 5 real ids", () => {
		expect(embedFocus.model).toBe("openai/text-embedding-3-small");
		expect(embedFocus.k).toBe(5);
		expect(Object.keys(embedFocus.focus).length).toBe(tasks.length);
		for (const task of tasks) {
			const ids = embedFocus.focus[task.id] as string[];
			expect(ids).toHaveLength(5);
			const real = new Set(allIds(task.tree));
			for (const id of ids) expect(real.has(id)).toBe(true);
		}
	});

	test("condition renders a valid minimal view on the focus ids", () => {
		const task = tasks[0] as TransformationTask;
		const ids = embedFocus.focus[task.id] as string[];
		const condition = makeEmbedCondition(ids);
		expect(condition.id).toBe("N-embed");
		const parsed = JSON.parse(condition.serialize(task.tree));
		expect(parsed.type).toBe("document");
	});

	test("groundedTargetIds stays computable for hit-rate analysis", () => {
		for (const task of tasks.slice(0, 3)) {
			expect(groundedTargetIds(task.edit).length).toBeGreaterThan(0);
		}
	});
});
