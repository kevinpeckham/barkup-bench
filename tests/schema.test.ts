/**
 * Cross-check the twin's strictness against an independent
 * implementation: the generated JSON Schema compiled by ajv must agree
 * with the twin validator's verdict (valid/invalid) on random valid
 * trees and on an invalid battery. (duplicate-id is validator-only —
 * JSON Schema cannot express tree-wide uniqueness — so it is excluded.)
 */
import { describe, expect, test } from "bun:test";
import { treeArbitrary } from "@kevinpeckham/barkup/testing";
import Ajv2020 from "ajv/dist/2020.js";
import fc from "fast-check";
import { BENCH_CONFIG } from "../src/grammar.js";
import { buildJsonSchema } from "../src/twin/schema.js";
import { validateJsonValue } from "../src/twin/validate.js";

const ajv = new Ajv2020({ allowUnionTypes: true });
const validate = ajv.compile(buildJsonSchema(BENCH_CONFIG));

describe("JSON Schema twin cross-check", () => {
	test("random valid trees: ajv and twin both accept", () => {
		fc.assert(
			fc.property(treeArbitrary(BENCH_CONFIG), (tree) => {
				const json = JSON.parse(JSON.stringify(tree));
				expect(validate(json)).toBe(true);
				expect(validateJsonValue(BENCH_CONFIG, json).ok).toBe(true);
			}),
			{ numRuns: 100 },
		);
	});

	const invalids: [string, unknown][] = [
		["non-root type as root", { type: "page" }],
		["unknown type", { type: "blok" }],
		["bad containment", { type: "document", children: [{ type: "block" }] }],
		["unknown attribute", { type: "document", attributes: { titel: "x" } }],
		["wrong attribute type", { type: "document", attributes: { title: 5 } }],
		[
			"missing required attribute",
			{
				type: "document",
				children: [
					{
						type: "page",
						children: [{ type: "block", children: [{ type: "text-atom" }] }],
					},
				],
			},
		],
		["extra node property", { type: "document", props: {} }],
		["string child", { type: "document", children: ["hello"] }],
		["non-string id", { type: "document", id: 7 }],
		[
			"children on a leaf",
			{
				type: "document",
				children: [
					{
						type: "page",
						children: [
							{
								type: "widget-slot",
								children: [{ type: "widget-slot" }],
							},
						],
					},
				],
			},
		],
	];

	for (const [label, value] of invalids) {
		test(`invalid battery agreement: ${label}`, () => {
			expect(validate(value)).toBe(false);
			expect(validateJsonValue(BENCH_CONFIG, value).ok).toBe(false);
		});
	}
});
