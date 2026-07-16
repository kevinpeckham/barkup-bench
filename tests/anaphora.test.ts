/**
 * Study X surface (pre-registered, BRIEF-X.md): the anaphora
 * generator's schedule and no-leakage validation, the last-edit note
 * format, and the committed corpus. Grader surface throughout.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { XTask } from "../src/corpus/anaphora.js";
import {
	generateXTask,
	validateXTask,
	X_SCHEDULE,
} from "../src/corpus/anaphora.js";
import { applyEdit, formatValue } from "../src/corpus/edits.js";
import { createRng } from "../src/corpus/rng.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import {
	isEchoArm,
	isHatchArm,
	lastEditNote,
	X_ARMS,
} from "../src/harness/anaphora-runner.js";

const [baseTree] = sampleTrees(BUCKETS.l, 20260718, 1);

function makeTask(): XTask {
	return generateXTask(
		structuredClone(baseTree as NonNullable<typeof baseTree>),
		createRng(20260718),
		"sessx-test-1",
		"l",
	);
}

describe("generateXTask", () => {
	const task = makeTask();

	test("12 steps on the registered schedule, deterministic", () => {
		expect(task.steps.length).toBe(12);
		expect(JSON.stringify(makeTask())).toBe(JSON.stringify(task));
		for (const [index, kind] of Object.entries(X_SCHEDULE.anaphora)) {
			expect(task.steps[Number(index) - 1]?.anaphora).toBe(kind);
		}
		for (const p of X_SCHEDULE.predecessors) {
			expect(task.steps[p - 1]?.edit.kind).toBe("set-attribute");
			expect(task.steps[p - 1]?.anaphora).toBeUndefined();
		}
	});

	test("validates: chain applies and nothing leaks", () => {
		expect(validateXTask(task)).toEqual([]);
	});

	test("anaphora instructions are pure anaphora", () => {
		for (const step of task.steps) {
			if (!step.anaphora) continue;
			const pred = task.steps[step.index - 2];
			if (pred?.edit.kind !== "set-attribute") continue;
			expect(step.instruction).not.toContain(pred.edit.nodeId);
			if (step.anaphora === "repeat") {
				expect(step.instruction).not.toContain(`"${pred.edit.key}"`);
				expect(step.instruction).not.toContain(formatValue(pred.edit.value));
			}
			if (step.anaphora === "undo") {
				expect(step.instruction).toBe("Actually, undo that last change.");
			}
		}
	});

	test("undo restores the exact pre-predecessor value in the chain", () => {
		let state = structuredClone(task.tree);
		let before: unknown;
		for (const step of task.steps) {
			if (step.index === 9 && step.edit.kind === "set-attribute") {
				expect(JSON.stringify(step.edit.value)).toBe(JSON.stringify(before));
			}
			if (step.index === 8 && step.edit.kind === "set-attribute") {
				const walk = (n: typeof state): unknown => {
					if (n.id === (step.edit as { nodeId: string }).nodeId) {
						return n.attributes?.[(step.edit as { key: string }).key];
					}
					for (const c of n.children ?? []) {
						const hit = walk(c);
						if (hit !== undefined) return hit;
					}
					return undefined;
				};
				before = walk(state);
			}
			state = applyEdit(state, step.edit) as typeof state;
		}
	});
});

describe("lastEditNote", () => {
	const task = makeTask();

	test("set-attribute notes carry from and to values plus the node ref", () => {
		const pred = task.steps[1];
		if (pred?.edit.kind !== "set-attribute") throw new Error("schedule");
		const note = lastEditNote(task.tree, pred.edit, true);
		expect(note).toContain("Previous edit (applied by the app): set");
		expect(note).toContain(`"${pred.edit.key}"`);
		expect(note).toContain(formatValue(pred.edit.value));
		expect(note).toContain(`"${pred.edit.nodeId}"`);
		expect(note).toContain(" from ");
	});

	test("failed steps produce the registered unchanged notice", () => {
		expect(lastEditNote(task.tree, null, false)).toContain(
			"could not be applied; the tree is unchanged",
		);
	});
});

describe("committed Study X corpus", () => {
	const corpus = JSON.parse(
		readFileSync("corpus/sessions-anaphora.json", "utf8"),
	) as { seed: number; sessions: XTask[] };

	test("12 sessions × 12 steps, pre-registered seed, all validate", () => {
		expect(corpus.seed).toBe(20260718);
		expect(corpus.sessions.length).toBe(12);
		for (const session of corpus.sessions) {
			expect(session.steps.length).toBe(12);
			expect(validateXTask(session)).toEqual([]);
		}
	});

	test("48 anaphora cells per arm-model: 24 amend, 12 repeat, 12 undo", () => {
		const steps = corpus.sessions.flatMap((s) => s.steps);
		expect(steps.filter((s) => s.anaphora === "amend").length).toBe(24);
		expect(steps.filter((s) => s.anaphora === "repeat").length).toBe(12);
		expect(steps.filter((s) => s.anaphora === "undo").length).toBe(12);
	});
});

describe("Study AG arm helpers", () => {
	test("classifies hatch and echo arms", () => {
		expect(isHatchArm("AG-stateless-hatch")).toBe(true);
		expect(isHatchArm("AG-echo-hatch")).toBe(true);
		expect(isHatchArm("X-stateless")).toBe(false);
		expect(isEchoArm("AG-echo-hatch")).toBe(true);
		expect(isEchoArm("X-lastedit")).toBe(true);
		expect(isEchoArm("AG-stateless-hatch")).toBe(false);
	});
	test("keeps Study X's registered arm list unchanged", () => {
		expect(X_ARMS).toEqual([
			"X-history",
			"X-window2",
			"X-lastedit",
			"X-stateless",
		]);
	});
});
