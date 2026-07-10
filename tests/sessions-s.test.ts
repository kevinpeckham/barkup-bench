/**
 * Study S corpus + runner surface (pre-registered, BRIEF-S.md): the
 * session generator at the 36-step horizon and the condition-id
 * override. Grader-relevant properties mirror tests/sessions.test.ts;
 * the 12-step default must be untouched.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRng } from "../src/corpus/rng.js";
import type { SessionCorpus, SessionTask } from "../src/corpus/sessions.js";
import {
	generateSession,
	SESSION_STEPS,
	validateSession,
} from "../src/corpus/sessions.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import { allIds, cloneTree } from "../src/tree.js";

const [baseTree] = sampleTrees(BUCKETS.l, 20260712, 1);

function makeLongSession(seedOffset = 0): SessionTask {
	const rng = createRng(20260712 + seedOffset);
	return generateSession(
		cloneTree(baseTree as NonNullable<typeof baseTree>),
		rng,
		"sesslong-test-1",
		"l",
		36,
	);
}

describe("generateSession at 36 steps (Study S)", () => {
	const task = makeLongSession();

	test("emits 36 steps, still cycling the five kinds", () => {
		expect(task.steps.length).toBe(36);
		expect(task.steps.map((s) => s.kind).slice(30, 35)).toEqual([
			"set-attribute",
			"set-name",
			"remove-node",
			"insert-node",
			"move-node",
		]);
	});

	test("is deterministic", () => {
		const again = makeLongSession();
		expect(JSON.stringify(again)).toBe(JSON.stringify(task));
	});

	test("validates: chain applies, placeholders resolve, no stray ids", () => {
		expect(validateSession(task)).toEqual([]);
	});

	test("expectedFinal carries only source and placeholder ids", () => {
		const source = new Set(allIds(task.tree));
		for (const id of allIds(task.expectedFinal)) {
			expect(source.has(id) || id.startsWith("sess-new-")).toBe(true);
		}
	});

	test("the 12-step default is unchanged", () => {
		const rng = createRng(20260712);
		const short = generateSession(
			cloneTree(baseTree as NonNullable<typeof baseTree>),
			rng,
			"sess-test-default",
			"l",
		);
		expect(short.steps.length).toBe(SESSION_STEPS);
		// The first 12 steps of a 36-step session from the same seed are
		// byte-identical to the 12-step session: the horizon only extends
		// the loop, it never changes earlier draws.
		expect(JSON.stringify(short.steps.map((s) => ({ ...s })))).toBe(
			JSON.stringify(task.steps.slice(0, 12)),
		);
	});
});

describe("committed Study S corpus", () => {
	const corpus = JSON.parse(
		readFileSync("corpus/sessions-long.json", "utf8"),
	) as SessionCorpus;

	test("10 sessions × 36 steps, pre-registered seed", () => {
		expect(corpus.seed).toBe(20260712);
		expect(corpus.sessions.length).toBe(10);
		for (const session of corpus.sessions) {
			expect(session.steps.length).toBe(36);
		}
	});

	test("every committed session validates", () => {
		for (const session of corpus.sessions) {
			expect(validateSession(session)).toEqual([]);
		}
	});

	test("session ids never collide with the Study K corpus", () => {
		const kCorpus = JSON.parse(
			readFileSync("corpus/sessions.json", "utf8"),
		) as SessionCorpus;
		const kIds = new Set(kCorpus.sessions.map((s) => s.id));
		for (const session of corpus.sessions) {
			expect(kIds.has(session.id)).toBe(false);
		}
	});
});
