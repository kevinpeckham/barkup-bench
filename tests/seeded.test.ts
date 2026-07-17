import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { applyShipped } from "../src/conditions/f2.js";
import type { SeededTask } from "../src/corpus/seeded.js";
import { CORRUPTION_MATRIX, validateSeededTask } from "../src/corpus/seeded.js";
import {
	feedbackFor,
	RETRY_WRAPPER,
} from "../src/harness/correction-runner.js";

const corpus = JSON.parse(
	readFileSync("corpus/seeded-failures.json", "utf8"),
) as { seed: number; tasks: SeededTask[] };

describe("seeded-failure corpus (Study AJ)", () => {
	it("has 45 cells with the registered class distribution and seed", () => {
		expect(corpus.seed).toBe(20260719);
		expect(corpus.tasks.length).toBe(45);
		const byClass = new Map<string, number>();
		for (const t of corpus.tasks) {
			byClass.set(t.corruption, (byClass.get(t.corruption) ?? 0) + 1);
		}
		expect(Object.fromEntries(byClass)).toEqual({
			"dangling-id": 15,
			"missing-field": 12,
			"malformed-op": 9,
			"bad-anchor": 6,
			"unknown-attribute": 3,
		});
	});

	it("every cell passes the validator (correct applies, corrupted fails)", () => {
		for (const task of corpus.tasks) {
			expect({ id: task.id, problems: validateSeededTask(task) }).toEqual({
				id: task.id,
				problems: [],
			});
		}
	});

	it("assignments follow the registered matrix per edit kind", () => {
		for (const task of corpus.tasks) {
			expect(CORRUPTION_MATRIX[task.editKind]).toContain(task.corruption);
		}
	});
});

describe("feedbackFor (registered arm texts)", () => {
	const task = corpus.tasks[0] as SeededTask;
	const seeded = applyShipped(JSON.stringify(task.corruptedPatch), task.tree);
	if (seeded.ok) throw new Error("fixture corruption applied");
	const issues = seeded.issues;

	it("structured carries the shipped issue text plus the shared wrapper", () => {
		const text = feedbackFor("AJ-structured", issues);
		expect(text).toContain(issues[0]?.message as string);
		expect(text.endsWith(RETRY_WRAPPER)).toBe(true);
	});

	it("codes carries only codes; bare carries neither", () => {
		const codes = feedbackFor("AJ-codes", issues);
		expect(codes).toContain(issues[0]?.code as string);
		expect(codes).not.toContain(issues[0]?.message as string);
		const bare = feedbackFor("AJ-bare", issues);
		expect(bare).toBe(`The anchored patch was invalid. ${RETRY_WRAPPER}`);
		expect(bare).not.toContain(issues[0]?.code as string);
	});
});
