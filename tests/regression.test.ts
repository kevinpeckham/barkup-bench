import { describe, expect, it } from "bun:test";
import type { TaskRunRecord } from "../src/harness/records.js";
import { GATES, gateById } from "../src/regression/gates.js";

/** Minimal synthetic record for evaluator tests. */
function record(
	overrides: Partial<TaskRunRecord> & { detail?: Record<string, unknown> },
): TaskRunRecord {
	return {
		taskId: "t",
		condition: "c",
		model: "m",
		regime: "parity",
		family: "transformation",
		bucket: "m",
		success: true,
		rounds: 1,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		calls: [],
		...overrides,
	} as unknown as TaskRunRecord;
}

function repeat(
	n: number,
	make: (i: number) => TaskRunRecord,
): TaskRunRecord[] {
	return Array.from({ length: n }, (_, i) => make(i));
}

describe("regression gate manifest", () => {
	it("has unique ids and resolves by id", () => {
		const ids = GATES.map((g) => g.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(gateById(id).id).toBe(id);
		expect(() => gateById("nope")).toThrow();
	});
});

describe("success-rate gates", () => {
	it("dialect passes at 17/20 and fails at 16/20", () => {
		const gate = gateById("dialect");
		const pass = repeat(20, (i) => record({ success: i < 17 }));
		expect(gate.evaluate(pass).pass).toBe(true);
		const fail = repeat(20, (i) => record({ success: i < 16 }));
		expect(gate.evaluate(fail).pass).toBe(false);
	});

	it("marks incomplete record sets instead of failing them", () => {
		const gate = gateById("views");
		const result = gate.evaluate(repeat(10, () => record({})));
		expect(result.incomplete).toBe(true);
		expect(result.pass).toBe(false);
	});
});

describe("focus-solve gate", () => {
	it("counts solved and silent-wrong outcomes from detail", () => {
		const gate = gateById("focus-solve");
		const good = repeat(45, () => record({ detail: { outcome: "solved" } }));
		expect(gate.evaluate(good).pass).toBe(true);
		const bad = repeat(45, (i) =>
			record({
				detail: { outcome: i < 42 ? "solved" : "wrong-patch" },
			}),
		);
		expect(gate.evaluate(bad).pass).toBe(false);
	});
});

describe("ask-hatch gate", () => {
	function askRecords(
		asked1: number,
		falseAsks: number,
		solved2: number,
	): TaskRunRecord[] {
		return [
			...repeat(45, (i) =>
				record({
					condition: "AC-rule-view1",
					detail: { outcome: i < asked1 ? "asked" : "wrong-patch" },
				}),
			),
			...repeat(45, (i) =>
				record({
					condition: "AC-rule-view2",
					detail: {
						outcome:
							i < falseAsks
								? "asked"
								: i < falseAsks + solved2
									? "solved"
									: "invalid",
					},
				}),
			),
		];
	}

	it("passes at the registered thresholds", () => {
		const gate = gateById("ask-hatch");
		expect(gate.evaluate(askRecords(45, 0, 45)).pass).toBe(true);
		expect(gate.evaluate(askRecords(43, 2, 43)).pass).toBe(true);
	});

	it("fails on under-asking and on false asks", () => {
		const gate = gateById("ask-hatch");
		expect(gate.evaluate(askRecords(40, 0, 45)).pass).toBe(false);
		expect(gate.evaluate(askRecords(45, 3, 42)).pass).toBe(false);
	});
});

describe("echo gate", () => {
	function echoRecords(anaphoraOk: number): TaskRunRecord[] {
		return [
			...repeat(48, (i) =>
				record({
					success: i < anaphoraOk,
					detail: { anaphora: "that-node" },
				}),
			),
			...repeat(96, () => record({ detail: {} })),
		];
	}

	it("gates on anaphora cells and excludes blocked steps", () => {
		const gate = gateById("echo");
		expect(gate.evaluate(echoRecords(48)).pass).toBe(true);
		expect(gate.evaluate(echoRecords(44)).pass).toBe(false);
		const blocked = [
			...echoRecords(48),
			record({
				success: false,
				detail: { anaphora: "x", blocked: "unresolved-reference:z" },
			}),
		];
		expect(gate.evaluate(blocked).pass).toBe(true);
	});
});

describe("precedence gate", () => {
	function conflictRecords(
		honored: number,
		both: number,
		violations = 0,
	): TaskRunRecord[] {
		return [
			...repeat(12, (i) =>
				record({
					detail: {
						kind: "override",
						reading:
							i < violations
								? "violation"
								: i < honored
									? "honored"
									: "enforced",
					},
				}),
			),
			...repeat(12, (i) =>
				record({
					detail: { kind: "ri", reading: i < both ? "both" : "literal" },
				}),
			),
		];
	}

	it("passes at 10/12 + 10/12 with zero violations", () => {
		const gate = gateById("precedence");
		expect(gate.evaluate(conflictRecords(12, 12)).pass).toBe(true);
		expect(gate.evaluate(conflictRecords(10, 10)).pass).toBe(true);
	});

	it("fails on trampled countermands, lost steering, or any violation", () => {
		const gate = gateById("precedence");
		expect(gate.evaluate(conflictRecords(9, 12)).pass).toBe(false);
		expect(gate.evaluate(conflictRecords(12, 9)).pass).toBe(false);
		expect(gate.evaluate(conflictRecords(12, 12, 1)).pass).toBe(false);
	});
});

describe("standing-pack gate", () => {
	it("holds a hard zero on contamination", () => {
		const gate = gateById("standing-pack");
		const clean = repeat(24, () => record({ detail: { contamination: [] } }));
		expect(gate.evaluate(clean).pass).toBe(true);
		const contaminated = [
			...repeat(23, () => record({ detail: { contamination: [] } })),
			record({ detail: { contamination: ["client-b-fact"] } }),
		];
		expect(gate.evaluate(contaminated).pass).toBe(false);
	});
});
