/** Study AR registered templates pinned (docs/BRIEF-AR.md). */
import { describe, expect, test } from "bun:test";
import {
	AR_HEADROOM_TEMPLATE,
	AR_TRUECAP_TEMPLATE,
	blockForArm,
} from "../src/harness/memoscale-runner.js";
import type { SessionNote } from "../src/shipped/session-notes.js";

const notes: SessionNote[] = [
	{ kind: "fact", text: "The codename is onyx." },
	{ kind: "rule", text: "Use sentence case in headings." },
	{ kind: "goal", text: "The article should read as a field report." },
];

describe("AR capacity line", () => {
	test("templates are the registered strings, verbatim", () => {
		expect(AR_HEADROOM_TEMPLATE).toBe(
			"Notes: {count} in use · an update may include up to 24 notes.",
		);
		expect(AR_TRUECAP_TEMPLATE).toBe(
			"Notes: {count} in use · an update may include up to 20 notes.",
		);
	});
	test("headroom arm renders the line after the PRECEDENCE header with the live count", () => {
		const block = blockForArm("AR-headroom", notes);
		expect(block).toContain(
			"keep the note unless the user retracts it).\nNotes: 3 in use · an update may include up to 24 notes.\n",
		);
	});
	test("truecap arm renders its own line", () => {
		expect(blockForArm("AR-truecap", notes)).toContain(
			"Notes: 3 in use · an update may include up to 20 notes.",
		);
	});
	test("non-AR arms render the shipped block byte-identically", () => {
		const block = blockForArm("AK-eviction", notes);
		expect(block).not.toContain("Notes: 3 in use");
		expect(block).toContain("## Session notes (app-maintained memo)");
	});
});
