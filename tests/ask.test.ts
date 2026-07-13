/**
 * Study AC machinery tests (docs/BRIEF-AC.md): the registered hatch
 * texts verbatim, arm construction identity with Study U's view
 * conditions, and the corpus reuse contract.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { makeUView } from "../src/conditions/dependent.js";
import type { DependentTask } from "../src/corpus/dependent.js";
import {
	ASK_RULE,
	ASK_TOOL_DESCRIPTION,
	makeAskCondition,
} from "../src/harness/ask-runner.js";

const corpus = JSON.parse(readFileSync("corpus/dependent.json", "utf8")) as {
	tasks: DependentTask[];
};
const task = corpus.tasks[0] as DependentTask;

describe("Study AC arm constructions", () => {
	test("registered hatch texts are verbatim", () => {
		expect(
			ASK_RULE.startsWith("If the request requires a value or a node"),
		).toBe(true);
		expect(ASK_RULE).toContain('"NEED-INFO: <what is missing');
		expect(
			ASK_TOOL_DESCRIPTION.startsWith(
				"Ask the user for information you need and cannot see.",
			),
		).toBe(true);
		expect(ASK_TOOL_DESCRIPTION).toContain("Calling this ends your turn.");
	});

	test("AC-base is U-view1/U-view2 verbatim", () => {
		for (const [view, uArm] of [
			["view1", "U-view1"],
			["view2", "U-view2"],
		] as const) {
			const base = makeAskCondition(task, view, "AC-base");
			const u = makeUView(task, uArm);
			expect(base.systemPrompt).toBe(u.systemPrompt);
			expect(base.serialize(task.tree)).toBe(u.serialize(task.tree));
		}
	});

	test("AC-rule appends exactly the registered sentence", () => {
		const base = makeAskCondition(task, "view1", "AC-base");
		const rule = makeAskCondition(task, "view1", "AC-rule");
		expect(rule.systemPrompt).toBe(`${base.systemPrompt}\n\n${ASK_RULE}`);
	});

	test("AC-tool keeps the base prompt (the hatch is the tool, not text)", () => {
		const base = makeAskCondition(task, "view1", "AC-base");
		const toolArm = makeAskCondition(task, "view1", "AC-tool");
		expect(toolArm.systemPrompt).toBe(base.systemPrompt);
	});

	test("corpus contract: 45 tasks, needle absent from view1, present in view2", () => {
		expect(corpus.tasks).toHaveLength(45);
		for (const t of corpus.tasks) {
			const view1 = makeAskCondition(t, "view1", "AC-base").serialize(t.tree);
			const view2 = makeAskCondition(t, "view2", "AC-base").serialize(t.tree);
			expect(view1).not.toContain(t.needle);
			expect(view2).toContain(t.needle);
			expect(t.instruction).not.toContain(t.needle);
		}
	});
});
