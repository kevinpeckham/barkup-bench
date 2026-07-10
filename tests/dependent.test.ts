/**
 * Study U corpus (pre-registered, BRIEF-U.md): the dependent-edit
 * generator and its no-leakage validation are grader surface — they
 * decide what the model must read and what counts as correct.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { serializeView } from "../src/conditions/views.js";
import type { DependentTask } from "../src/corpus/dependent.js";
import {
	generateDependentTask,
	validateDependentTask,
} from "../src/corpus/dependent.js";
import { applyEdit } from "../src/corpus/edits.js";
import { createRng } from "../src/corpus/rng.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";

const source = JSON.parse(
	readFileSync("corpus/size-extension.json", "utf8"),
) as Corpus;
const sourceTree = (source.tasks[0] as TransformationTask).tree;

describe("generateDependentTask", () => {
	test("is deterministic", () => {
		const a = generateDependentTask(sourceTree, createRng(20260714), "value");
		const b = generateDependentTask(sourceTree, createRng(20260714), "value");
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	test("value and structure kinds both validate on a real tree", () => {
		for (const kind of ["value", "structure"] as const) {
			const task = generateDependentTask(sourceTree, createRng(20260714), kind);
			expect(validateDependentTask(task)).toEqual([]);
			expect(task.depKind).toBe(kind);
		}
	});
});

describe("committed Study U corpus", () => {
	const corpus = JSON.parse(readFileSync("corpus/dependent.json", "utf8")) as {
		seed: number;
		tasks: DependentTask[];
	};

	test("45 tasks, pre-registered seed and kind split", () => {
		expect(corpus.seed).toBe(20260714);
		expect(corpus.tasks.length).toBe(45);
		expect(corpus.tasks.filter((t) => t.depKind === "value").length).toBe(24);
		expect(corpus.tasks.filter((t) => t.depKind === "structure").length).toBe(
			21,
		);
		for (const bucket of ["xl", "xxl", "xxxl"]) {
			expect(corpus.tasks.filter((t) => t.bucket === bucket).length).toBe(15);
		}
	});

	test("every committed task validates (no leakage, view2 sufficiency)", () => {
		for (const task of corpus.tasks) {
			expect(validateDependentTask(task)).toEqual([]);
		}
	});

	test("expected trees are computed, never authored", () => {
		for (const task of corpus.tasks) {
			expect(JSON.stringify(applyEdit(task.tree, task.edit))).toBe(
				JSON.stringify(task.expected),
			);
		}
	});

	test("the needle is invisible to view1 and visible to view2", () => {
		for (const task of corpus.tasks) {
			const view1 = serializeView(task.tree, [task.targetId], "minimal");
			const view2 = serializeView(
				task.tree,
				[task.targetId, task.sourceId],
				"minimal",
			);
			expect(view1.includes(task.needle)).toBe(false);
			expect(view2.includes(task.needle)).toBe(true);
		}
	});
});
