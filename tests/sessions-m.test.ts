/**
 * Study M policy machinery (pre-registered, BRIEF-M.md): window
 * trimming and the stateless/window prompt wiring are grader-adjacent
 * (they decide what the model sees), so they get tests.
 */
import { describe, expect, test } from "bun:test";
import {
	POLICY_CONDITION,
	SESSION_RULES,
	STATELESS_SESSION_RULES,
	type StepExchange,
	windowMessages,
} from "../src/harness/session-runner.js";

describe("windowMessages", () => {
	const exchanges: StepExchange[] = [
		{ user: "u1", assistant: "a1" },
		{ user: "u2", assistant: "a2" },
		{ user: "u3", assistant: "a3" },
	];

	test("keeps only the last N exchanges, in order", () => {
		const messages = windowMessages(exchanges, 2);
		expect(messages.map((m) => m.content)).toEqual(["u2", "a2", "u3", "a3"]);
		expect(messages.map((m) => m.role)).toEqual([
			"user",
			"assistant",
			"user",
			"assistant",
		]);
	});

	test("handles fewer exchanges than the window", () => {
		expect(windowMessages(exchanges.slice(0, 1), 2)).toHaveLength(2);
		expect(windowMessages([], 2)).toEqual([]);
	});

	test("drops nothing inside a kept exchange", () => {
		const messages = windowMessages(exchanges, 3);
		expect(messages).toHaveLength(6);
	});
});

describe("Study M policy wiring", () => {
	test("condition ids follow the brief", () => {
		expect(POLICY_CONDITION.stateless).toBe("M-stateless");
		expect(POLICY_CONDITION.window2).toBe("M-window");
	});

	test("stateless session rules replace, not extend, the K wording", () => {
		expect(STATELESS_SESSION_RULES).toContain("as it stands right now");
		expect(STATELESS_SESSION_RULES).not.toContain("arrive one at a time");
		expect(SESSION_RULES).toContain("arrive one at a time");
	});
});
