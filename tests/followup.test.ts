/** Study G: corpus generator determinism/validity and the grading helper. */
import { describe, expect, test } from "bun:test";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { applyEdit } from "../src/corpus/edits.js";
import {
	FILLERS_PER_TASK,
	generateFollowupCorpus,
} from "../src/corpus/followup.js";
import { grammar } from "../src/grammar.js";
import { gradeFinal } from "../src/harness/followup-runner.js";
import { findById } from "../src/tree.js";

const SEED = 777;

describe("followup corpus", () => {
	const corpus = generateFollowupCorpus(SEED);

	test("deterministic from the seed", () => {
		expect(JSON.stringify(generateFollowupCorpus(SEED))).toBe(
			JSON.stringify(corpus),
		);
	}, 60_000);

	test("40 tasks, 20 per bucket, 6 fillers each", () => {
		expect(corpus.tasks.length).toBe(40);
		expect(corpus.tasks.filter((t) => t.bucket === "s").length).toBe(20);
		expect(corpus.tasks.filter((t) => t.bucket === "m").length).toBe(20);
		for (const task of corpus.tasks) {
			expect(task.fillers.length).toBe(FILLERS_PER_TASK);
			expect(task.finalInstructionTemplate).toContain("%ID%");
		}
	});

	test("insert + all fillers apply cleanly and stay grammar-valid", () => {
		for (const task of corpus.tasks) {
			let tree = applyEdit(task.tree, task.insertEdit);
			for (const filler of task.fillers) {
				tree = applyEdit(tree, filler.edit);
			}
			expect(grammar.validate(tree).ok).toBe(true);
			// The spotlight node exists exactly once by name.
			const matches = JSON.stringify(tree).match(
				new RegExp(`"${task.newNodeName}"`, "g"),
			);
			expect(matches?.length).toBe(1);
		}
	});

	test("fillers target distinct (node,key) pairs and change values", () => {
		for (const task of corpus.tasks) {
			const seen = new Set<string>();
			for (const filler of task.fillers) {
				if (filler.edit.kind !== "set-attribute") throw new Error("kind");
				const key = `${filler.edit.nodeId}::${filler.edit.key}`;
				expect(seen.has(key)).toBe(false);
				seen.add(key);
				const before = findById(task.tree, filler.edit.nodeId);
				expect(JSON.stringify(before?.attributes?.[filler.edit.key])).not.toBe(
					JSON.stringify(filler.edit.value),
				);
			}
		}
	});

	test("final edit actually changes the inserted node", () => {
		for (const task of corpus.tasks) {
			if (task.insertEdit.kind !== "insert-node") throw new Error("kind");
			expect(
				JSON.stringify(task.insertEdit.node.attributes?.[task.finalKey]),
			).not.toBe(JSON.stringify(task.finalValue));
		}
	});
});

describe("gradeFinal", () => {
	const tree: BarkupNode = {
		type: "document",
		id: "d1",
		children: [
			{
				type: "page",
				id: "p1",
				children: [{ type: "block", id: "b1", attributes: { featured: true } }],
			},
		],
	};

	test("true only when node exists with the exact value", () => {
		expect(gradeFinal(tree, "b1", "featured", true)).toBe(true);
		expect(gradeFinal(tree, "b1", "featured", false)).toBe(false);
		expect(gradeFinal(tree, "b1", "containerClasses", "p-4")).toBe(false);
		expect(gradeFinal(tree, "zz", "featured", true)).toBe(false);
	});
});
