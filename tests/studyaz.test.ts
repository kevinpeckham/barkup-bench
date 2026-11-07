/**
 * Study AZ grader proofs (docs/BRIEF-AZ.md) and arm-text identity pins:
 * the three static blocks differ ONLY by the registered deltas.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
	deadWrites,
	gradeExact,
	gradeRequired,
	gradeRequiredAny,
	sizingWrites,
} from "../src/studyaz/grade.js";

describe("gradeExact (S bucket)", () => {
	const want = [
		{
			op: "set-attribute",
			id: "slot-feature-a",
			key: "slotSpan",
			value: "half",
		},
	];
	test("exact match passes, order-free, numeric values normalize", () => {
		expect(
			gradeExact(
				[
					{
						op: "set-attribute",
						id: "slot-feature-a",
						key: "slotSpan",
						value: "half",
					},
				],
				want,
			),
		).toBe(true);
		expect(
			gradeExact(
				[
					{
						op: "set-attribute",
						id: "slot-hero",
						key: "slotHeightPx",
						value: 320,
					},
				],
				[
					{
						op: "set-attribute",
						id: "slot-hero",
						key: "slotHeightPx",
						value: "320",
					},
				],
			),
		).toBe(true);
	});
	test("wrong target, wrong value, or extra ops fail", () => {
		expect(
			gradeExact(
				[
					{
						op: "set-attribute",
						id: "slot-feature-b",
						key: "slotSpan",
						value: "half",
					},
				],
				want,
			),
		).toBe(false);
		expect(
			gradeExact(
				[
					{
						op: "set-attribute",
						id: "slot-feature-a",
						key: "slotSpan",
						value: "third",
					},
				],
				want,
			),
		).toBe(false);
		expect(
			gradeExact(
				[
					{
						op: "set-attribute",
						id: "slot-feature-a",
						key: "slotSpan",
						value: "half",
					},
					{
						op: "set-attribute",
						id: "slot-feature-a",
						key: "data-label",
						value: "x",
					},
				],
				want,
			),
		).toBe(false);
	});
	test("two-op task matches in either order and misses a missing op", () => {
		const want2 = [
			{
				op: "set-attribute",
				id: "slot-feature-a",
				key: "slotSpan",
				value: "two-thirds",
			},
			{
				op: "set-attribute",
				id: "slot-feature-b",
				key: "slotSpan",
				value: "third",
			},
		];
		expect(
			gradeExact(
				[
					{
						op: "set-attribute",
						id: "slot-feature-b",
						key: "slotSpan",
						value: "third",
					},
					{
						op: "set-attribute",
						id: "slot-feature-a",
						key: "slotSpan",
						value: "two-thirds",
					},
				],
				want2,
			),
		).toBe(true);
		expect(
			gradeExact(
				[
					{
						op: "set-attribute",
						id: "slot-feature-a",
						key: "slotSpan",
						value: "two-thirds",
					},
				],
				want2,
			),
		).toBe(false);
	});
});

describe("gradeRequired / gradeRequiredAny (D bucket)", () => {
	test("required op present among extras passes; absent fails", () => {
		const req = [{ op: "remove", id: "slot-feature-b" }];
		expect(
			gradeRequired(
				[
					{ op: "remove", id: "slot-feature-b" },
					{
						op: "set-attribute",
						id: "blk-features",
						key: "data-label",
						value: "x",
					},
				],
				req,
			),
		).toBe(true);
		expect(gradeRequired([{ op: "remove", id: "slot-feature-a" }], req)).toBe(
			false,
		);
	});
	test("either swap form satisfies requiredAny", () => {
		const alts = [
			[{ op: "move", id: "slot-feature-b", before: "slot-feature-a" }],
			[{ op: "move", id: "slot-feature-a", after: "slot-feature-b" }],
		];
		expect(
			gradeRequiredAny(
				[{ op: "move", id: "slot-feature-a", after: "slot-feature-b" }],
				alts,
			),
		).toBe(true);
		expect(
			gradeRequiredAny(
				[{ op: "move", id: "slot-feature-a", before: "slot-feature-b" }],
				alts,
			),
		).toBe(false);
	});
});

describe("sizing and dead-attribute censuses", () => {
	test("counts set-attribute writes and attributes smuggled in via insert", () => {
		const ops = [
			{
				op: "set-attribute",
				id: "slot-hero",
				key: "requiredWidgetWidth",
				value: "full",
			},
			{ op: "set-attribute", id: "slot-hero", key: "data-label", value: "x" },
			{
				op: "insert",
				node: {
					type: "widget-slot",
					id: "new-1",
					attributes: { slotSpan: "half" },
				},
				parentId: "blk-hero",
			},
		];
		expect(sizingWrites(ops)).toBe(2);
		expect(deadWrites(ops)).toBe(1);
	});
});

describe("arm text identity (registered deltas only)", () => {
	const dir = "corpus/az-slot-sizing";
	const a = readFileSync(`${dir}/static-arm-a.txt`, "utf8");
	const a0 = readFileSync(`${dir}/static-arm-a0.txt`, "utf8");
	const b = readFileSync(`${dir}/static-arm-b.txt`, "utf8");
	test("A0 differs from A only by the two digest names", () => {
		expect(a.replace(", slotHeightPx, slotSpan\n", "\n")).toBe(a0);
	});
	test("B differs from A only by the widget-slot prose line", () => {
		expect(a).toContain("`data-required-widget-width`, ");
		expect(b).not.toContain("data-required-widget-width");
		expect(b).toContain(
			"`data-slot-span` (full|half|third|two-thirds) and `data-slot-height-px` record the slot's column span and fixed height — set them only when the user asks to size a slot.",
		);
		// everything outside the one prose line is byte-identical
		const stripProse = (s: string) =>
			s
				.split("\n")
				.filter((line) => !line.startsWith("- **widget-slot** references"))
				.join("\n");
		expect(stripProse(a)).toBe(stripProse(b));
	});
	test("A carries the dev digest (both new names) and the stale prose", () => {
		expect(a).toContain("slotHeightPx, slotSpan");
		expect(a).toContain("data-required-widget-width");
	});
});
