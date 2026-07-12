/**
 * Study Y surface (pre-registered, BRIEF-Y.md): the twin generator,
 * pool hygiene, and the committed corpus. Grader surface throughout.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { YPair } from "../src/corpus/casual.js";
import {
	CASUAL_POOLS,
	CHATTER_POOL,
	generateYPair,
	validateYPair,
	Y_SCHEDULE,
} from "../src/corpus/casual.js";
import { createRng } from "../src/corpus/rng.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";

const [baseTree] = sampleTrees(BUCKETS.l, 20260719, 1);

function makePair(): YPair {
	return generateYPair(
		structuredClone(baseTree as NonNullable<typeof baseTree>),
		createRng(20260719),
		createRng(20260719 + 13),
		"sessy-test-1",
		"l",
	);
}

describe("generateYPair", () => {
	const pair = makePair();

	test("twins share id, edits, and schedule; deterministic", () => {
		expect(pair.formulaic.id).toBe(pair.casual.id);
		expect(pair.formulaic.steps.length).toBe(12);
		expect(JSON.stringify(makePair())).toBe(JSON.stringify(pair));
		expect(pair.formulaic.callbackSteps).toEqual([
			Y_SCHEDULE.governed1,
			Y_SCHEDULE.factF1,
			Y_SCHEDULE.governed2,
			Y_SCHEDULE.factF2,
		]);
	});

	test("validates (chain, no leakage, twin identity, rider presence)", () => {
		expect(validateYPair(pair)).toEqual([]);
	});

	test("casual riders differ from formulaic on every declaring step", () => {
		for (const i of pair.formulaic.declaringSteps) {
			const f = pair.formulaic.steps[i - 1];
			const c = pair.casual.steps[i - 1];
			expect(f?.instruction).not.toBe(c?.instruction);
			expect(f?.declares).toBe(c?.declares);
		}
	});

	test("chatter is present and identical in both twins", () => {
		for (const i of Y_SCHEDULE.chatter) {
			const f = pair.formulaic.steps[i - 1];
			const c = pair.casual.steps[i - 1];
			expect(f?.instruction).toBe(c?.instruction);
			expect(CHATTER_POOL.some((line) => f?.instruction.includes(line))).toBe(
				true,
			);
		}
	});

	test("the retraction rider carries both values in both styles", () => {
		const d = pair.formulaic.declarables;
		for (const task of [pair.formulaic, pair.casual]) {
			const step = task.steps[Y_SCHEDULE.retractF1 - 1];
			expect(step?.instruction).toContain(d.f1Final);
			expect(step?.instruction).toContain(d.f1Initial);
		}
	});
});

describe("pool hygiene", () => {
	test("casual pools reference declarables only through placeholders", () => {
		for (const pool of [
			CASUAL_POOLS.campaign,
			CASUAL_POOLS.retraction,
			CASUAL_POOLS.sponsor,
		]) {
			for (const template of pool) {
				expect(/\{X1\}|\{X2\}|\{Y\}/.test(template)).toBe(true);
			}
		}
	});

	test("chatter mentions no codename-shaped token", () => {
		for (const line of CHATTER_POOL) {
			expect(/[a-z]+-\d/.test(line)).toBe(false);
			expect(line.includes("small-caps")).toBe(false);
		}
	});
});

describe("committed Study Y corpus", () => {
	const corpus = JSON.parse(
		readFileSync("corpus/sessions-casual.json", "utf8"),
	) as { seed: number; pairs: YPair[] };

	test("12 pairs, pre-registered seed, every pair validates", () => {
		expect(corpus.seed).toBe(20260719);
		expect(corpus.pairs.length).toBe(12);
		for (const pair of corpus.pairs) {
			expect(validateYPair(pair)).toEqual([]);
		}
	});

	test("48 callback cells per arm-model", () => {
		const steps = corpus.pairs.flatMap((p) => p.casual.steps);
		expect(steps.filter((s) => s.callback).length).toBe(48);
	});
});
