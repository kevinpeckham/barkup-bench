import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { RewriteTask } from "../src/corpus/rewrite.js";
import {
	AF_ARMS,
	armInstruction,
	armView,
	goalCompliance,
	RESTATE_CLAUSE,
} from "../src/harness/rewrite-runner.js";

const corpus = JSON.parse(readFileSync("corpus/rewrite.json", "utf8")) as {
	tasks: RewriteTask[];
};
const task = corpus.tasks[0] as RewriteTask;

describe("Study AF arm construction", () => {
	it("registers exactly three AF arms", () => {
		expect(AF_ARMS).toEqual([
			"AF-control",
			"AF-memo-restate",
			"AF-view-restate",
		]);
	});

	it("AF-control is V-instr verbatim (no clause)", () => {
		expect(armInstruction(task, "AF-control")).toBe(
			armInstruction(task, "V-instr"),
		);
		expect(armInstruction(task, "AF-control")).not.toContain("GOAL:");
	});

	it("restate arms are their V bases plus the registered clause", () => {
		expect(armInstruction(task, "AF-memo-restate")).toBe(
			`${armInstruction(task, "V-conv-memo")} ${RESTATE_CLAUSE}`,
		);
		expect(armInstruction(task, "AF-view-restate")).toBe(
			`${armInstruction(task, "V-doc-view2")} ${RESTATE_CLAUSE}`,
		);
	});

	it("AF-view-restate shows the mission node; AF-memo-restate does not", () => {
		const viewArm = armView(task, "AF-view-restate");
		const memoArm = armView(task, "AF-memo-restate");
		expect(viewArm).toContain(`"${task.missionId}"`);
		expect(memoArm).not.toContain(`"${task.missionId}"`);
		expect(viewArm).toBe(armView(task, "V-doc-view2"));
		expect(memoArm).toBe(armView(task, "V-conv-memo"));
	});
});

describe("goalCompliance (registered regex)", () => {
	it("detects a GOAL line at reply start or mid-reply line start", () => {
		expect(
			goalCompliance("GOAL: focus on the thesis\n```json\n[]\n```"),
		).toEqual({
			compliant: true,
			line: "GOAL: focus on the thesis",
		});
		const mid = goalCompliance(
			"Sure.\nGOAL: anchor the mission\n```json\n[]\n```",
		);
		expect(mid.compliant).toBe(true);
		expect(mid.line).toBe("GOAL: anchor the mission");
	});

	it("rejects replies without a line-initial GOAL:", () => {
		expect(goalCompliance("The goal: focus.\n```json\n[]\n```").compliant).toBe(
			false,
		);
		expect(goalCompliance("my GOAL: is x").compliant).toBe(false);
		expect(goalCompliance("```json\n[]\n```").compliant).toBe(false);
	});
});
