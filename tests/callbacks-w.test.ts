/**
 * Study W surface (pre-registered, BRIEF-W.md): the shipped ports'
 * character identity, the window-crossing schedule, no-leakage at the
 * post-truncation callbacks, the oracle memo, and the carrier
 * computation. All grader surface.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { WTask } from "../src/corpus/callbacks-w.js";
import {
	generateWTask,
	validateWTask,
	W_SCHEDULE,
} from "../src/corpus/callbacks-w.js";
import { createRng } from "../src/corpus/rng.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import { carrierSteps, oracleNotes } from "../src/harness/memo-runner.js";
import {
	formatSessionNotesBlock,
	MAX_HISTORY_MESSAGES,
	MAX_SESSION_NOTE_CHARS,
	MAX_SESSION_NOTES,
	normalizeSessionNotes,
	SESSION_NOTES_PROMPT_RULE,
	UPDATE_SESSION_NOTES_DESCRIPTION,
} from "../src/shipped/session-notes.js";

const [baseTree] = sampleTrees(BUCKETS.l, 20260717, 1);

function makeTask(): WTask {
	return generateWTask(
		structuredClone(baseTree as NonNullable<typeof baseTree>),
		createRng(20260717),
		"sessw-test-1",
		"l",
	);
}

describe("shipped ports (verbatim, slx-replicator v3.183.0 @ 3c714f4)", () => {
	test("window and clamp constants", () => {
		expect(MAX_HISTORY_MESSAGES).toBe(32);
		expect(MAX_SESSION_NOTES).toBe(20);
		expect(MAX_SESSION_NOTE_CHARS).toBe(300);
	});

	test("prompt rule text is the shipped sentence", () => {
		expect(
			SESSION_NOTES_PROMPT_RULE.startsWith(
				"Session-notes rule: maintain the memo with update_session_notes.",
			),
		).toBe(true);
		expect(SESSION_NOTES_PROMPT_RULE).toContain(
			"views carry values, memos carry goals",
		);
		expect(
			SESSION_NOTES_PROMPT_RULE.endsWith("Remove notes the user retracts."),
		).toBe(true);
	});

	test("tool description is the shipped text", () => {
		expect(
			UPDATE_SESSION_NOTES_DESCRIPTION.startsWith(
				"Replace the session-notes memo:",
			),
		).toBe(true);
		expect(UPDATE_SESSION_NOTES_DESCRIPTION).toContain(
			"Send the COMPLETE updated list every time",
		);
	});

	test("normalizeSessionNotes clamps like the shipped code", () => {
		expect(normalizeSessionNotes(null)).toEqual([]);
		expect(
			normalizeSessionNotes([
				{ kind: "fact", text: "  a fact  " },
				{ kind: "bogus", text: "dropped" },
				{ kind: "rule", text: "" },
				{ kind: "goal", text: "x".repeat(400) },
			]),
		).toEqual([
			{ kind: "fact", text: "a fact" },
			{ kind: "goal", text: "x".repeat(300) },
		]);
	});

	test("block rendering groups kinds under the shipped header", () => {
		const block = formatSessionNotesBlock([
			{ kind: "goal", text: "G" },
			{ kind: "fact", text: "F" },
			{ kind: "rule", text: "R" },
		]);
		expect(block).toContain("## Session notes (app-maintained memo)");
		expect(block.indexOf("Facts:")).toBeLessThan(
			block.indexOf("Standing rules:"),
		);
		expect(block.indexOf("Standing rules:")).toBeLessThan(
			block.indexOf("Goals:"),
		);
		expect(formatSessionNotesBlock([])).toBe("");
	});
});

describe("generateWTask", () => {
	const task = makeTask();

	test("36 steps on the registered schedule, deterministic", () => {
		expect(task.steps.length).toBe(36);
		expect(JSON.stringify(makeTask())).toBe(JSON.stringify(task));
		expect(task.callbackSteps).toEqual([4, 7, 24, 27, 32, 34]);
		expect(task.declaringSteps).toEqual([1, 3, 6, 21]);
	});

	test("validates (chain, schedule, no leakage at every callback)", () => {
		expect(validateWTask(task)).toEqual([]);
	});

	test("retraction: both F1 callbacks expect the FINAL value", () => {
		for (const i of [W_SCHEDULE.factF1Within, W_SCHEDULE.factF1Post]) {
			const step = task.steps[i - 1];
			expect(step?.edit.kind).toBe("set-name");
			if (step?.edit.kind === "set-name") {
				expect(step.edit.name).toBe(task.declarables.f1Final);
			}
		}
	});

	test("cleanup: the codename leaves the tree before the post callback", () => {
		// Replay to just before step 32 and assert x2 is absent.
		const { applyEdit } = require("../src/corpus/edits.js") as {
			applyEdit: (t: unknown, e: unknown) => unknown;
		};
		let state: unknown = structuredClone(task.tree);
		for (const step of task.steps) {
			if (step.index === W_SCHEDULE.factF1Post) break;
			state = applyEdit(state, step.edit);
		}
		expect(JSON.stringify(state).includes(task.declarables.f1Final)).toBe(
			false,
		);
	});
});

describe("oracle memo and carriers", () => {
	const task = makeTask();

	test("oracle memo applies the retraction and accumulates in order", () => {
		const before = oracleNotes(task, W_SCHEDULE.retractF1);
		expect(
			before.some((n) => n.text.includes(task.declarables.f1Initial)),
		).toBe(true);
		const after = oracleNotes(task, W_SCHEDULE.retractF1 + 1);
		expect(after.some((n) => n.text.includes(task.declarables.f1Final))).toBe(
			true,
		);
		expect(after.some((n) => n.text.includes(task.declarables.f1Initial))).toBe(
			false,
		);
		const end = oracleNotes(task, 37);
		expect(end.length).toBe(3);
		expect(oracleNotes(task, 1)).toEqual([]);
	});

	test("carriers include the declaring steps and the cleanup step", () => {
		const carriers = carrierSteps(task);
		for (const s of task.declaringSteps) expect(carriers).toContain(s);
		expect(carriers).toContain(W_SCHEDULE.cleanupF1);
	});
});

describe("committed Study W corpus", () => {
	const corpus = JSON.parse(
		readFileSync("corpus/sessions-callback-long.json", "utf8"),
	) as { seed: number; sessions: WTask[] };

	test("12 sessions × 36 steps, pre-registered seed, all validate", () => {
		expect(corpus.seed).toBe(20260717);
		expect(corpus.sessions.length).toBe(12);
		for (const session of corpus.sessions) {
			expect(session.steps.length).toBe(36);
			expect(validateWTask(session)).toEqual([]);
		}
	});

	test("72 callback cells per arm-model (36 fact, 36 rule)", () => {
		const steps = corpus.sessions.flatMap((s) => s.steps);
		expect(steps.filter((s) => s.callback === "fact").length).toBe(36);
		expect(steps.filter((s) => s.callback === "rule").length).toBe(36);
	});
});
