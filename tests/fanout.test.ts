/**
 * Study Q fan-out corpus machinery (pre-registered, BRIEF-Q.md). The
 * applier computes ground truth and the generator decides what every
 * task asks for, so both are grader surface.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import {
	applyFanout,
	describeFanout,
	type FanoutTask,
	fanoutTargets,
	generateFanoutTask,
	REMOVE_TYPES,
	SET_TYPES,
} from "../src/corpus/fanout.js";
import { refFor, resolveRef } from "../src/corpus/grounded.js";
import { createRng } from "../src/corpus/rng.js";
import { equalExact } from "../src/grading/equal.js";
import { findById } from "../src/tree.js";

const tree: BarkupNode = {
	type: "document",
	id: "doc",
	children: [
		{
			type: "page",
			id: "p1",
			name: "intro",
			children: [
				{
					type: "block",
					id: "b1",
					name: "gallery",
					children: [
						{ type: "image-atom", id: "i1", attributes: { src: "a.webp" } },
						{ type: "image-atom", id: "i2" },
						{ type: "text-atom", id: "t1", attributes: { maxLength: 40 } },
					],
				},
				{ type: "block", id: "b2" },
			],
		},
	],
};

describe("fanoutTargets / applyFanout / describeFanout", () => {
	test("targets are strict descendants of the container, in document order", () => {
		expect(fanoutTargets(tree, "b1", "image-atom")).toEqual(["i1", "i2"]);
		expect(fanoutTargets(tree, "doc", "block")).toEqual(["b1", "b2"]);
		expect(fanoutTargets(tree, "b1", "block")).toEqual([]);
	});

	test("set-attribute-all sets every target and nothing else", () => {
		const out = applyFanout(tree, {
			fanKind: "set-attribute-all",
			targetIds: ["i1", "i2"],
			key: "aspectRatio",
			value: "16:9",
		});
		expect(findById(out, "i1")?.attributes?.aspectRatio).toBe("16:9");
		expect(findById(out, "i1")?.attributes?.src).toBe("a.webp");
		expect(findById(out, "i2")?.attributes?.aspectRatio).toBe("16:9");
		expect(findById(out, "t1")?.attributes?.aspectRatio).toBeUndefined();
		expect(equalExact(tree, tree)).toBe(true); // input untouched
	});

	test("remove-all removes every target", () => {
		const out = applyFanout(tree, {
			fanKind: "remove-all",
			targetIds: ["i1", "i2"],
		});
		expect(findById(out, "i1")).toBeNull();
		expect(findById(out, "i2")).toBeNull();
		expect(findById(out, "t1")).not.toBeNull();
	});

	test("instructions are id-free and name the container", () => {
		const text = describeFanout(tree, "b1", "image-atom", {
			fanKind: "remove-all",
			targetIds: ["i1", "i2"],
		});
		expect(text).toBe(
			'Remove every image-atom inside the block named "gallery" (each with its whole subtree, if any).',
		);
		expect(text).not.toMatch(/"(doc|p\d|b\d|i\d|t\d)"/);
	});
});

describe("generateFanoutTask", () => {
	test("is deterministic for a fixed seed", () => {
		const a = generateFanoutTask(
			tree,
			"xl",
			"fan-x",
			createRng(7),
			"remove-all",
		);
		const b = generateFanoutTask(
			tree,
			"xl",
			"fan-x",
			createRng(7),
			"remove-all",
		);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	test("respects the pre-registered type pools", () => {
		expect([...SET_TYPES]).toEqual(["text-atom", "image-atom", "block"]);
		expect([...REMOVE_TYPES]).toEqual([
			"text-atom",
			"image-atom",
			"widget-slot",
		]);
	});
});

describe("fan-out corpus", () => {
	const corpus = JSON.parse(readFileSync("corpus/fanout.json", "utf8")) as {
		seed: number;
		tasks: FanoutTask[];
	};

	test("45 tasks on the size-extension trees, seed 20260710", () => {
		expect(corpus.seed).toBe(20260710);
		expect(corpus.tasks).toHaveLength(45);
		for (const bucket of ["xl", "xxl", "xxxl"]) {
			expect(corpus.tasks.filter((t) => t.bucket === bucket)).toHaveLength(15);
		}
	});

	test("every task validates: unique container ref, ≥2 non-nested targets, id-free instruction, computed expected", () => {
		for (const task of corpus.tasks) {
			expect(task.targetIds.length).toBeGreaterThanOrEqual(2);
			expect(task.instruction).not.toMatch(/"n\d+"/);
			// Container ref resolves uniquely back to the container.
			const matches = resolveRef(
				task.tree,
				refFor(task.tree, task.containerId),
			);
			expect(matches).toHaveLength(1);
			expect((matches[0] as BarkupNode).id).toBe(task.containerId);
			// Target set is exactly the type-inside-container set.
			expect(task.targetIds).toEqual(
				fanoutTargets(task.tree, task.containerId, task.targetType),
			);
			// No target is an ancestor of another (order-independence).
			for (const id of task.targetIds) {
				const node = findById(task.tree, id) as BarkupNode;
				const inner = fanoutTargets(task.tree, id, task.targetType);
				expect(inner.filter((x) => task.targetIds.includes(x))).toHaveLength(0);
				expect(node).not.toBeNull();
			}
			// Expected is the committed applier's output and differs from base.
			const expected = applyFanout(task.tree, task);
			expect(equalExact(expected, task.expected)).toBe(true);
			expect(equalExact(task.tree, task.expected)).toBe(false);
		}
	});

	test("kinds are represented in both directions", () => {
		const set = corpus.tasks.filter((t) => t.fanKind === "set-attribute-all");
		const remove = corpus.tasks.filter((t) => t.fanKind === "remove-all");
		expect(set.length).toBeGreaterThan(10);
		expect(remove.length).toBeGreaterThan(10);
	});
});
