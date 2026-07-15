import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { DependentTask } from "../src/corpus/dependent.js";
import { applyEdit } from "../src/corpus/edits.js";
import type { CalibrationTask } from "../src/corpus/ladder.js";
import { validateCalibrationTask } from "../src/corpus/ladder.js";
import { resumeAnswer } from "../src/harness/ask-runner.js";
import { classifyLadder } from "../src/harness/ladder-runner.js";

const corpus = JSON.parse(readFileSync("corpus/calibration.json", "utf8")) as {
	seed: number;
	tasks: CalibrationTask[];
};
const dependent = JSON.parse(readFileSync("corpus/dependent.json", "utf8")) as {
	tasks: DependentTask[];
};

describe("calibration corpus (Study AE)", () => {
	it("has 15 tasks per level, 5 per bucket, registered seed", () => {
		expect(corpus.seed).toBe(20260717);
		expect(corpus.tasks.length).toBe(75);
		for (const level of [0, 1, 2, 3, 4]) {
			const ofLevel = corpus.tasks.filter((t) => t.level === level);
			expect(ofLevel.length).toBe(15);
			for (const bucket of ["xl", "xxl", "xxxl"]) {
				expect(ofLevel.filter((t) => t.bucket === bucket).length).toBe(5);
			}
		}
	});

	it("every task passes its level's defining-property validator", () => {
		for (const task of corpus.tasks) {
			expect({ id: task.id, problems: validateCalibrationTask(task) }).toEqual({
				id: task.id,
				problems: [],
			});
		}
	});

	it("L0/L4 are verbatim reuses of the dependent corpus", () => {
		const byId = new Map(dependent.tasks.map((t) => [t.id, t]));
		for (const task of corpus.tasks.filter(
			(t) => t.level === 0 || t.level === 4,
		)) {
			const source = byId.get(task.sourceTaskId as string) as DependentTask;
			expect(source).toBeDefined();
			expect(task.instruction).toBe(source.instruction);
			expect(JSON.stringify(task.tree)).toBe(JSON.stringify(source.tree));
			expect(JSON.stringify(task.expected)).toBe(
				JSON.stringify(source.expected),
			);
			expect(task.needle).toBe(source.needle);
		}
	});
});

// ---- classifier unit tests over a synthetic tree ----

const tree: BarkupNode = {
	type: "document",
	name: "doc",
	id: "n1",
	children: [
		{
			type: "text-atom",
			name: "alpha",
			id: "n2",
			attributes: { content: "old-a", textStyle: "body-md" },
		},
		{
			type: "text-atom",
			name: "beta",
			id: "n3",
			attributes: { content: "old-b", textStyle: "body-md" },
		},
		{
			type: "text-atom",
			name: "gamma",
			id: "n4",
			attributes: { content: "old-c", textStyle: "heading-2" },
		},
	],
};

function set(id: string, value: string, base: BarkupNode = tree): BarkupNode {
	return applyEdit(base, {
		kind: "set-attribute",
		nodeId: id,
		key: "content",
		value,
	});
}

describe("classifyLadder", () => {
	it("grades L1 against the expected tree", () => {
		const expected = set("n2", "cal-one-1");
		const task: CalibrationTask = {
			id: "t",
			family: "transformation",
			bucket: "xl",
			level: 1,
			tree,
			instruction: "",
			focusIds: ["n2", "n3", "n4"],
			targetId: "n2",
			key: "content",
			newValue: "cal-one-1",
			expected,
		};
		expect(classifyLadder(task, expected, false)).toBe("solved");
		expect(classifyLadder(task, set("n3", "cal-one-1"), false)).toBe(
			"wrong-patch",
		);
		expect(classifyLadder(task, null, true)).toBe("asked");
		expect(classifyLadder(task, null, false)).toBe("invalid");
	});

	it("grades L2 as acted only for a clean on-target change", () => {
		const task: CalibrationTask = {
			id: "t",
			family: "transformation",
			bucket: "xl",
			level: 2,
			tree,
			instruction: "",
			focusIds: ["n2"],
			targetId: "n2",
			key: "content",
			originalValue: "old-a",
		};
		expect(classifyLadder(task, set("n2", "snappy!"), false)).toBe("acted");
		expect(classifyLadder(task, set("n3", "snappy!"), false)).toBe(
			"off-target",
		);
		// unchanged value is not acting
		expect(classifyLadder(task, set("n2", "old-a"), false)).toBe("off-target");
		// touching the target AND a bystander is not a clean edit
		expect(
			classifyLadder(task, set("n3", "x", set("n2", "snappy!")), false),
		).toBe("off-target");
	});

	it("grades L3 asks, guesses, both, and other-wrong", () => {
		const task: CalibrationTask = {
			id: "t",
			family: "transformation",
			bucket: "xl",
			level: 3,
			tree,
			instruction: "",
			focusIds: ["n2", "n3"],
			key: "content",
			newValue: "cal-three-1",
			candidateIds: ["n2", "n3"],
			descriptor: { type: "text-atom", key: "textStyle", value: "body-md" },
		};
		expect(classifyLadder(task, null, true)).toBe("asked");
		expect(classifyLadder(task, set("n2", "cal-three-1"), false)).toBe(
			"guessed",
		);
		expect(classifyLadder(task, set("n3", "cal-three-1"), false)).toBe(
			"guessed",
		);
		expect(
			classifyLadder(
				task,
				set("n3", "cal-three-1", set("n2", "cal-three-1")),
				false,
			),
		).toBe("both");
		expect(classifyLadder(task, set("n4", "cal-three-1"), false)).toBe(
			"other-wrong",
		);
		// candidate changed but with collateral damage elsewhere
		expect(
			classifyLadder(task, set("n4", "x", set("n2", "cal-three-1")), false),
		).toBe("other-wrong");
	});
});

describe("resumeAnswer (registered template)", () => {
	it("renders the value-copy and structure-read forms", () => {
		const valueTask = dependent.tasks.find((t) => t.depKind === "value");
		const structureTask = dependent.tasks.find(
			(t) => t.depKind === "structure",
		);
		expect(valueTask && structureTask).toBeTruthy();
		const v = resumeAnswer(valueTask as DependentTask);
		expect(v).toContain((valueTask as DependentTask).sourceId);
		expect(v).toContain(`"${(valueTask as DependentTask).needle}"`);
		expect(v).toContain("reply with the patch only");
		const s = resumeAnswer(structureTask as DependentTask);
		expect(s).toStartWith("The name of");
		expect(s).toContain(`"${(structureTask as DependentTask).needle}"`);
	});
});
