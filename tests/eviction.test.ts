import { describe, expect, it } from "bun:test";
import type { SessionNote } from "../src/shipped/session-notes.js";
import {
	applySessionNotesUpdate,
	evictSessionNotesToFit,
	MAX_SESSION_NOTES,
} from "../src/shipped/session-notes.js";

function note(kind: SessionNote["kind"], i: number): SessionNote {
	return { kind, text: `${kind} note ${i}` };
}
function memo(facts: number, rules: number, goals: number): SessionNote[] {
	return [
		...Array.from({ length: facts }, (_, i) => note("fact", i)),
		...Array.from({ length: rules }, (_, i) => note("rule", i)),
		...Array.from({ length: goals }, (_, i) => note("goal", i)),
	];
}

describe("evictSessionNotesToFit (v3.213.0 port)", () => {
	it("passes under-cap lists through untouched", () => {
		const input = memo(6, 2, 2);
		const { evicted, notes } = evictSessionNotesToFit(input);
		expect(evicted).toEqual([]);
		expect(notes).toEqual(input);
	});

	it("evicts the oldest FACT first at the cap", () => {
		const input = memo(13, 5, 3); // 21 notes
		const { evicted, notes } = evictSessionNotesToFit(input);
		expect(notes.length).toBe(MAX_SESSION_NOTES);
		expect(evicted).toEqual([note("fact", 0)]);
		expect(notes.filter((n) => n.kind === "goal").length).toBe(3);
	});

	it("falls back to the oldest RULE when no facts remain, never a goal", () => {
		const input = memo(0, 18, 3); // 21 notes, no facts
		const { evicted, notes } = evictSessionNotesToFit(input);
		expect(evicted).toEqual([note("rule", 0)]);
		expect(notes.filter((n) => n.kind === "goal").length).toBe(3);
	});

	it("evicts the oldest goal only when the memo is all goals", () => {
		const input = memo(0, 0, 22);
		const { evicted, notes } = evictSessionNotesToFit(input);
		expect(evicted).toEqual([note("goal", 0), note("goal", 1)]);
		expect(notes.length).toBe(MAX_SESSION_NOTES);
	});

	it("evicts repeatedly until the list fits", () => {
		const input = memo(15, 5, 3); // 23 notes
		const { evicted, notes } = evictSessionNotesToFit(input);
		expect(evicted).toEqual([note("fact", 0), note("fact", 1), note("fact", 2)]);
		expect(notes.length).toBe(MAX_SESSION_NOTES);
	});

	it("drops malformed items without counting them", () => {
		const input = [...memo(5, 0, 0), { kind: "nope" }, null, { text: "" }];
		const { evicted, notes } = evictSessionNotesToFit(input);
		expect(evicted).toEqual([]);
		expect(notes.length).toBe(5);
	});
});

describe("applySessionNotesUpdate (v3.213.0 port)", () => {
	it("clean updates echo no eviction fields", () => {
		const out = applySessionNotesUpdate(memo(10, 5, 3));
		expect(out.evictedGoal).toBe(false);
		expect(out.notes.length).toBe(18);
		expect(out.result).toEqual({ applied: true, notes: out.notes });
	});

	it("over-cap updates echo the eviction and a goal-preserving notice", () => {
		const out = applySessionNotesUpdate(memo(13, 5, 3));
		expect(out.evictedGoal).toBe(false);
		expect(out.notes.length).toBe(MAX_SESSION_NOTES);
		expect(out.result.evicted).toEqual([note("fact", 0)]);
		expect(out.result.notice).toContain("goals are preserved");
	});

	it("flags the all-goals eviction for caller logging", () => {
		const out = applySessionNotesUpdate(memo(0, 0, 21));
		expect(out.evictedGoal).toBe(true);
		expect(out.result.notice).toContain("all notes are goals");
	});

	it("composes with the registered clamp (never exceeds the cap)", () => {
		const out = applySessionNotesUpdate(memo(30, 10, 5));
		expect(out.notes.length).toBe(MAX_SESSION_NOTES);
		expect(out.notes.filter((n) => n.kind === "goal").length).toBe(5);
	});
});
