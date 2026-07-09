/**
 * Study P worked examples (pre-registered, BRIEF-P.md). The examples
 * ARE the intervention, so they are grader-adjacent twice over: their
 * patches must be genuinely correct (a broken example would teach the
 * wrong lesson), and both delivery framings must carry byte-identical
 * content.
 */
import { describe, expect, test } from "bun:test";
import { applyShipped } from "../src/conditions/f2.js";
import { applyEdit } from "../src/corpus/edits.js";
import { equalModuloNewIds } from "../src/grading/equal.js";
import {
	EXAMPLE_TREE,
	WORKED_EXAMPLES,
	WORKED_EXAMPLES_BLOCK,
} from "../src/harness/examples.js";
import {
	cannedMessages,
	POLICY_CONDITION,
	STATELESS_SYSTEM_EXAMPLES,
} from "../src/harness/session-runner.js";
import { allIds } from "../src/tree.js";

describe("worked examples", () => {
	test("both example patches apply cleanly and produce the described outcome", () => {
		for (const example of WORKED_EXAMPLES) {
			const applied = applyShipped(example.reply, EXAMPLE_TREE);
			expect(applied.ok).toBe(true);
			if (!applied.ok) continue;
			const expected = applyEdit(EXAMPLE_TREE, example.edit);
			expect(
				equalModuloNewIds(
					expected,
					applied.node,
					new Set(allIds(EXAMPLE_TREE)),
				),
			).toBe(true);
		}
	});

	test("examples target the failure class: one ordinal insert, one ordinal move", () => {
		expect(WORKED_EXAMPLES[0].edit.kind).toBe("insert-node");
		expect(WORKED_EXAMPLES[0].instruction).toContain("3rd child");
		expect(WORKED_EXAMPLES[1].edit.kind).toBe("move-node");
		expect(WORKED_EXAMPLES[1].instruction).toContain("2nd child");
	});

	test("example ids never collide with corpus trees (ex- prefix)", () => {
		for (const id of allIds(EXAMPLE_TREE)) {
			expect(id.startsWith("ex-")).toBe(true);
		}
	});

	test("replies are bare JSON arrays in the terse history style", () => {
		for (const example of WORKED_EXAMPLES) {
			expect(example.reply.startsWith("[")).toBe(true);
			expect(example.reply).not.toContain("```");
			expect(JSON.parse(example.reply)).toBeInstanceOf(Array);
		}
	});
});

describe("Study P policy wiring", () => {
	test("condition ids follow the brief", () => {
		expect(POLICY_CONDITION.canned).toBe("P-canned");
		expect(POLICY_CONDITION.cannedSys).toBe("P-system");
	});

	test("canned turns carry both examples with the unrelated-tree framing", () => {
		const messages = cannedMessages();
		expect(messages).toHaveLength(4);
		expect(messages.map((m) => m.role)).toEqual([
			"user",
			"assistant",
			"user",
			"assistant",
		]);
		expect(String(messages[0]?.content)).toStartWith(
			"Worked example (a different, unrelated tree):",
		);
		expect(String(messages[1]?.content)).toBe(WORKED_EXAMPLES[0].reply);
		expect(String(messages[3]?.content)).toBe(WORKED_EXAMPLES[1].reply);
	});

	test("cannedMessages returns fresh objects (the loop mutates message arrays)", () => {
		expect(cannedMessages()).not.toBe(cannedMessages());
	});

	test("system framing carries the identical example content", () => {
		expect(STATELESS_SYSTEM_EXAMPLES.endsWith(WORKED_EXAMPLES_BLOCK)).toBe(
			true,
		);
		for (const example of WORKED_EXAMPLES) {
			expect(WORKED_EXAMPLES_BLOCK).toContain(example.instruction);
			expect(WORKED_EXAMPLES_BLOCK).toContain(example.reply);
			expect(WORKED_EXAMPLES_BLOCK).toContain(example.view);
		}
		expect(STATELESS_SYSTEM_EXAMPLES).toContain("as it stands right now");
	});
});
