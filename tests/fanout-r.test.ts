/**
 * Study R machinery (pre-registered, BRIEF-R.md). The worked fan-out
 * example IS the intervention (a broken example teaches the wrong
 * lesson), the condition prompts decide what models see, and the
 * decomposition subtask builder decides what the pipeline asks for.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyShipped } from "../src/conditions/f2.js";
import {
	COVERAGE_RULES,
	FANOUT_EXAMPLE_BLOCK_FULL,
	FANOUT_EXAMPLE_BLOCK_VIEW,
	FANOUT_EXAMPLE_INSTRUCTION,
	FANOUT_EXAMPLE_REPLY,
	FANOUT_EXAMPLE_SPEC,
	makeRCondition,
} from "../src/conditions/fanout-r.js";
import { applyFanout, type FanoutTask } from "../src/corpus/fanout.js";
import { equalExact } from "../src/grading/equal.js";
import { subtaskEdit } from "../src/harness/decomp-runner.js";
import { EXAMPLE_TREE } from "../src/harness/examples.js";

const corpus = JSON.parse(readFileSync("corpus/fanout.json", "utf8")) as {
	tasks: FanoutTask[];
};
const sampleTask = corpus.tasks[0] as FanoutTask;

describe("worked fan-out example", () => {
	test("reply applies cleanly and equals the fan-out applier's output", () => {
		const applied = applyShipped(FANOUT_EXAMPLE_REPLY, EXAMPLE_TREE);
		expect(applied.ok).toBe(true);
		if (!applied.ok) return;
		const expected = applyFanout(EXAMPLE_TREE, FANOUT_EXAMPLE_SPEC);
		expect(equalExact(expected, applied.node)).toBe(true);
	});

	test("instruction matches the committed describer and the brief", () => {
		expect(FANOUT_EXAMPLE_INSTRUCTION).toBe(
			'Set "maxLength" to 64 on every text-atom inside the block named "steps".',
		);
	});

	test("reply covers ALL three targets — the complete-set demonstration", () => {
		const ops = JSON.parse(FANOUT_EXAMPLE_REPLY) as { id: string }[];
		expect(ops.map((op) => op.id)).toEqual(["ex-t1", "ex-t2", "ex-t3"]);
	});

	test("both renderings carry the same instruction and reply", () => {
		for (const block of [
			FANOUT_EXAMPLE_BLOCK_VIEW,
			FANOUT_EXAMPLE_BLOCK_FULL,
		]) {
			expect(block).toContain(FANOUT_EXAMPLE_INSTRUCTION);
			expect(block).toContain(FANOUT_EXAMPLE_REPLY);
			expect(block).toContain("different, unrelated tree");
		}
		expect(FANOUT_EXAMPLE_BLOCK_VIEW).toContain('"collapsed": true');
		expect(FANOUT_EXAMPLE_BLOCK_FULL).not.toContain('"collapsed"');
	});
});

describe("R conditions", () => {
	test("arm wiring: ids, prompts, and serialization bases", () => {
		const exV = makeRCondition("exV", sampleTask);
		expect(exV.id).toBe("R-exV");
		expect(exV.systemPrompt).toContain("View rules:");
		expect(exV.systemPrompt).toContain(FANOUT_EXAMPLE_INSTRUCTION);
		const view = JSON.parse(exV.serialize(sampleTask.tree));
		expect(view.type).toBe("document");

		const ckF = makeRCondition("ckF", sampleTask);
		expect(ckF.id).toBe("R-ckF");
		expect(ckF.systemPrompt).toContain("Coverage rules:");
		expect(ckF.systemPrompt).not.toContain("View rules:");
		// Full base keeps F's whole-tree serialization.
		expect(ckF.serialize(sampleTask.tree)).toContain('"children"');

		const ckV = makeRCondition("ckV", sampleTask);
		expect(ckV.systemPrompt.endsWith(COVERAGE_RULES)).toBe(true);
	});
});

describe("decomposition subtasks", () => {
	test("set-attribute-all decomposes to per-target set-attribute edits", () => {
		const task = corpus.tasks.find(
			(t) => t.fanKind === "set-attribute-all",
		) as FanoutTask;
		const edit = subtaskEdit(task, task.targetIds[0] as string);
		expect(edit).toEqual({
			kind: "set-attribute",
			nodeId: task.targetIds[0] as string,
			key: task.key as string,
			value: task.value as never,
		});
	});

	test("remove-all decomposes to per-target remove-node edits", () => {
		const task = corpus.tasks.find(
			(t) => t.fanKind === "remove-all",
		) as FanoutTask;
		expect(subtaskEdit(task, task.targetIds[1] as string)).toEqual({
			kind: "remove-node",
			nodeId: task.targetIds[1] as string,
		});
	});
});
