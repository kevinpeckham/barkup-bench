/**
 * Corpus generators: determinism from the seed, size stratification,
 * edit application correctness, and question/answer ground truth.
 */
import { describe, expect, test } from "bun:test";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { nodesEqual } from "@kevinpeckham/barkup/testing";
import { applyEdit } from "../src/corpus/edits.js";
import { createRng } from "../src/corpus/rng.js";
import { generatePilotCorpus } from "../src/corpus/tasks.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import { grammar } from "../src/grammar.js";
import { allIds, countNodes, findById } from "../src/tree.js";

const SEED = 424242;

function sampleTree(): BarkupNode {
	return {
		type: "document",
		id: "d1",
		attributes: { title: "Doc" },
		children: [
			{
				type: "page",
				id: "p1",
				name: "main",
				children: [
					{
						type: "block",
						id: "b1",
						children: [
							{
								type: "text-atom",
								id: "t1",
								attributes: { maxLength: 80, content: "Hello." },
							},
						],
					},
					{ type: "widget-slot", id: "w1" },
				],
			},
			{ type: "page", id: "p2" },
		],
	};
}

describe("rng", () => {
	test("deterministic", () => {
		const a = createRng(7);
		const b = createRng(7);
		for (let i = 0; i < 100; i += 1) {
			expect(a.next()).toBe(b.next());
		}
	});
});

describe("tree sampling", () => {
	test("buckets produce trees in their band, deterministically", () => {
		for (const bucket of [BUCKETS.xs, BUCKETS.s]) {
			const first = sampleTrees(bucket, SEED, 2);
			const second = sampleTrees(bucket, SEED, 2);
			expect(JSON.stringify(first)).toBe(JSON.stringify(second));
			for (const tree of first) {
				const n = countNodes(tree);
				expect(n).toBeGreaterThanOrEqual(bucket.min);
				expect(n).toBeLessThanOrEqual(bucket.max);
				// Every node has an id (edits reference nodes by id).
				expect(allIds(tree).length).toBe(n);
				// Still grammar-valid after humanization.
				expect(grammar.validate(tree).ok).toBe(true);
			}
		}
	});
});

describe("applyEdit", () => {
	test("set-attribute", () => {
		const out = applyEdit(sampleTree(), {
			kind: "set-attribute",
			nodeId: "t1",
			key: "textStyle",
			value: "caption",
		});
		expect(findById(out, "t1")?.attributes?.textStyle).toBe("caption");
		// Source untouched (pure function).
		expect(findById(sampleTree(), "t1")?.attributes?.textStyle).toBeUndefined();
	});

	test("set-name", () => {
		const out = applyEdit(sampleTree(), {
			kind: "set-name",
			nodeId: "b1",
			name: "hero",
		});
		expect(findById(out, "b1")?.name).toBe("hero");
	});

	test("remove-node removes the subtree", () => {
		const out = applyEdit(sampleTree(), { kind: "remove-node", nodeId: "b1" });
		expect(findById(out, "b1")).toBeNull();
		expect(findById(out, "t1")).toBeNull();
		expect(findById(out, "w1")).not.toBeNull();
	});

	test("insert-node at index", () => {
		const out = applyEdit(sampleTree(), {
			kind: "insert-node",
			parentId: "p1",
			index: 1,
			node: { type: "block", name: "inserted" },
		});
		const p1 = findById(out, "p1");
		expect(p1?.children?.[1]?.name).toBe("inserted");
		expect(p1?.children?.length).toBe(3);
	});

	test("move-node relocates with subtree", () => {
		const out = applyEdit(sampleTree(), {
			kind: "move-node",
			nodeId: "b1",
			newParentId: "p2",
			index: 0,
		});
		expect(findById(out, "p1")?.children?.length).toBe(1);
		expect(findById(out, "p2")?.children?.[0]?.id).toBe("b1");
		expect(findById(out, "t1")).not.toBeNull();
	});

	test("throws on stale ids", () => {
		expect(() =>
			applyEdit(sampleTree(), { kind: "remove-node", nodeId: "zzz" }),
		).toThrow();
	});
});

describe("pilot corpus", () => {
	const corpus = generatePilotCorpus(SEED);

	test("deterministic from the seed", () => {
		expect(JSON.stringify(generatePilotCorpus(SEED))).toBe(
			JSON.stringify(corpus),
		);
	}, 30_000);

	test("20 tasks with the pre-registered family mix", () => {
		expect(corpus.tasks.length).toBe(20);
		const byFamily = new Map<string, number>();
		for (const task of corpus.tasks) {
			byFamily.set(task.family, (byFamily.get(task.family) ?? 0) + 1);
		}
		expect(byFamily.get("transformation")).toBe(8);
		expect(byFamily.get("construction")).toBe(4);
		expect(byFamily.get("reference")).toBe(4);
		expect(byFamily.get("reading")).toBe(4);
	});

	test("transformation tasks cover every edit kind", () => {
		const kinds = new Set(
			corpus.tasks
				.filter((task) => task.family === "transformation")
				.map((task) =>
					task.family === "transformation" ? task.edit.kind : "",
				),
		);
		expect([...kinds].sort()).toEqual([
			"insert-node",
			"move-node",
			"remove-node",
			"set-attribute",
			"set-name",
		]);
	});

	test("reading tasks cover distinct question kinds", () => {
		const prompts = corpus.tasks
			.filter((task) => task.family === "reading")
			.map((task) => (task.family === "reading" ? task.question.prompt : ""));
		// Four different templates → four different phrasings.
		const shapes = new Set(
			prompts.map((p) => p.split(" ").slice(0, 3).join(" ")),
		);
		expect(shapes.size).toBeGreaterThanOrEqual(3);
	});

	test("transformation tasks: expected = applyEdit(tree), and differs from tree", () => {
		for (const task of corpus.tasks) {
			if (task.family !== "transformation") continue;
			expect(nodesEqual(task.expected, applyEdit(task.tree, task.edit))).toBe(
				true,
			);
			expect(nodesEqual(task.expected, task.tree)).toBe(false);
			expect(task.instruction.length).toBeGreaterThan(10);
			// Ground truth stays grammar-valid.
			expect(grammar.validate(task.expected).ok).toBe(true);
		}
	});

	test("reference tasks: expected1 valid, created node findable, step-2 changes it", () => {
		for (const task of corpus.tasks) {
			if (task.family !== "reference") continue;
			expect(grammar.validate(task.expected1).ok).toBe(true);
			expect(task.instruction2Template).toContain("%ID%");
			// The created node's name is unique in expected1.
			const matches = allIds(task.expected1).length; // ids intact
			expect(matches).toBeGreaterThan(0);
			const named = JSON.stringify(task.expected1).match(
				new RegExp(`"${task.newNodeName}"`, "g"),
			);
			expect(named?.length).toBe(1);
			// Step 2 must actually change the created node.
			const inserted =
				task.edit1.kind === "insert-node" ? task.edit1.node : null;
			expect(inserted).not.toBeNull();
			expect(JSON.stringify(inserted?.attributes?.[task.edit2Key])).not.toBe(
				JSON.stringify(task.edit2Value),
			);
		}
	});

	test("reading tasks: answers recompute correctly", () => {
		for (const task of corpus.tasks) {
			if (task.family !== "reading") continue;
			expect(task.question.prompt.length).toBeGreaterThan(10);
			expect(task.question.answer.length).toBeGreaterThan(0);
			// Spot-check the count-style questions by independent recount.
			const match = task.question.prompt.match(
				/^How many ([a-z-]+) nodes does the tree contain/,
			);
			if (match) {
				let count = 0;
				const stack = [task.tree];
				while (stack.length > 0) {
					const node = stack.pop() as BarkupNode;
					if (node.type === match[1]) count += 1;
					stack.push(...(node.children ?? []));
				}
				expect(String(count)).toBe(task.question.answer);
			}
		}
	});

	test("construction tasks: targets valid, spec pending", () => {
		for (const task of corpus.tasks) {
			if (task.family !== "construction") continue;
			expect(grammar.validate(task.target).ok).toBe(true);
			expect(task.spec).toBeNull();
		}
	});
});
