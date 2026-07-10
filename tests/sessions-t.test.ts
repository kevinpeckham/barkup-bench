/**
 * Study T corpus + runner surface (pre-registered, BRIEF-T.md): the
 * callback-session generator, its no-leakage validation, and the
 * session-notes block. These decide what counts as a callback step's
 * ground truth, so they are grader surface.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	CODENAMES,
	generateCallbackSession,
	RULE_TEXT_STYLE,
	validateCallbackSession,
} from "../src/corpus/callbacks.js";
import { createRng } from "../src/corpus/rng.js";
import type { SessionCorpus, SessionTask } from "../src/corpus/sessions.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import { sessionNotes } from "../src/harness/session-runner.js";

const [baseTree] = sampleTrees(BUCKETS.l, 20260713, 1);

function makeSession(seedOffset = 0): SessionTask {
	const rng = createRng(20260713 + seedOffset);
	return generateCallbackSession(
		structuredClone(baseTree as NonNullable<typeof baseTree>),
		rng,
		"sesscb-test-1",
		"l",
	);
}

describe("generateCallbackSession", () => {
	const task = makeSession();

	test("emits 12 steps with the fixed callback schedule", () => {
		expect(task.steps.length).toBe(12);
		expect(
			task.steps.filter((s) => s.callback === "fact").map((s) => s.index),
		).toEqual([7, 12]);
		expect(
			task.steps.filter((s) => s.callback === "rule").map((s) => s.index),
		).toEqual([4, 9]);
		expect(task.steps.filter((s) => s.declares).map((s) => s.index)).toEqual([
			1, 3, 6,
		]);
	});

	test("is deterministic", () => {
		expect(JSON.stringify(makeSession())).toBe(JSON.stringify(task));
	});

	test("validates: chain applies and nothing leaks", () => {
		expect(validateCallbackSession(task)).toEqual([]);
	});

	test("fact steps require a codename their instruction never states", () => {
		for (const step of task.steps.filter((s) => s.callback === "fact")) {
			expect(step.edit.kind).toBe("set-name");
			if (step.edit.kind !== "set-name") continue;
			expect([...CODENAMES] as string[]).toContain(step.edit.name);
			expect(step.instruction).not.toContain(step.edit.name);
			expect(step.instruction).toContain("codename");
		}
	});

	test("rule steps carry the attribute their instruction never mentions", () => {
		for (const step of task.steps.filter((s) => s.callback === "rule")) {
			expect(step.edit.kind).toBe("insert-node");
			if (step.edit.kind !== "insert-node") continue;
			expect(step.edit.node.attributes?.textStyle).toBe(RULE_TEXT_STYLE);
			expect(step.instruction).not.toContain("textStyle");
			expect(step.instruction).not.toContain(RULE_TEXT_STYLE);
		}
	});

	test("declaring steps are graded on their own self-contained edit", () => {
		for (const step of task.steps.filter((s) => s.declares)) {
			expect(step.callback).toBeUndefined();
			// The rider carries the same substance as the recorded note
			// (codename value or the full rule sentence).
			const quoted = (step.declares as string).match(/"[^"]+"/)?.[0] as string;
			expect(step.instruction).toContain(quoted);
			expect(/For later reference:|Standing rule:/.test(step.instruction)).toBe(
				true,
			);
		}
	});
});

describe("sessionNotes", () => {
	const task = makeSession();

	test("nothing recorded before the first declaration", () => {
		expect(sessionNotes(task, 1)).toBeNull();
	});

	test("accumulates declarations in order, in the registered format", () => {
		const atStep7 = sessionNotes(task, 7);
		expect(atStep7).not.toBeNull();
		const lines = (atStep7 as string).split("\n");
		expect(lines[2]).toBe("Session notes (maintained by the application):");
		expect(lines.length).toBe(6); // blank, blank, header, 3 declarations
		expect(atStep7).toContain("campaign codename");
		expect(atStep7).toContain("Standing rule:");
		expect(atStep7).toContain("sponsor codename");
	});

	test("mid-session, only prior declarations appear", () => {
		const atStep4 = sessionNotes(task, 4);
		expect(atStep4).toContain("campaign codename");
		expect(atStep4).toContain("Standing rule:");
		expect(atStep4).not.toContain("sponsor codename");
	});
});

describe("committed Study T corpus", () => {
	const corpus = JSON.parse(
		readFileSync("corpus/sessions-callback.json", "utf8"),
	) as SessionCorpus;

	test("20 sessions × 12 steps, pre-registered seed", () => {
		expect(corpus.seed).toBe(20260713);
		expect(corpus.sessions.length).toBe(20);
		for (const session of corpus.sessions) {
			expect(session.steps.length).toBe(12);
		}
	});

	test("every committed session validates (including no-leakage)", () => {
		for (const session of corpus.sessions) {
			expect(validateCallbackSession(session)).toEqual([]);
		}
	});

	test("80 callback steps: 40 fact, 40 rule", () => {
		const steps = corpus.sessions.flatMap((s) => s.steps);
		expect(steps.filter((s) => s.callback === "fact").length).toBe(40);
		expect(steps.filter((s) => s.callback === "rule").length).toBe(40);
	});
});
