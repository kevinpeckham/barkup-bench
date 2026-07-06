import { describe, expect, test } from "bun:test";
import { mcnemarExact } from "../src/stats/mcnemar.js";
import { wilson } from "../src/stats/wilson.js";

describe("wilson", () => {
	test("known value: 8/10 at 95%", () => {
		const w = wilson(8, 10);
		expect(w.proportion).toBeCloseTo(0.8, 10);
		expect(w.low).toBeCloseTo(0.49, 2);
		expect(w.high).toBeCloseTo(0.943, 2);
	});

	test("edges", () => {
		expect(wilson(0, 10).low).toBe(0);
		expect(wilson(10, 10).high).toBe(1);
		expect(Number.isNaN(wilson(0, 0).proportion)).toBe(true);
	});
});

describe("mcnemarExact", () => {
	test("no discordant pairs → p=1", () => {
		expect(mcnemarExact(0, 0).pValue).toBe(1);
	});

	test("5 vs 1 discordant: exact two-sided p = 2*(C(6,0)+C(6,1))/2^6", () => {
		const result = mcnemarExact(5, 1);
		expect(result.discordant).toBe(6);
		expect(result.pValue).toBeCloseTo((2 * (1 + 6)) / 64, 10);
	});

	test("symmetric", () => {
		expect(mcnemarExact(2, 7).pValue).toBeCloseTo(
			mcnemarExact(7, 2).pValue,
			12,
		);
	});
});
