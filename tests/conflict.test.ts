/**
 * Study AA machinery tests (docs/BRIEF-AA.md): generator determinism
 * and validation, the registered reading classifiers against
 * constructed fixtures for every reading of every kind, the soft-pack
 * byte-identity property, and the four arm constructions.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import type { ConflictTask } from "../src/corpus/conflict.js";
import {
	CONFLICT_RULES_SOFT,
	classifyReading,
	generateConflictPack,
	isInstructionFavored,
	isLiteral,
	PRIORITY_META_RULE,
	scanContamination,
	validateConflictTask,
} from "../src/corpus/conflict.js";
import { createRng } from "../src/corpus/rng.js";
import { conflictBlocks } from "../src/harness/conflict-runner.js";
import {
	formatSessionNotesBlock,
	formatSessionNotesBlockV2,
} from "../src/shipped/session-notes.js";

const CONFLICT_SEED = 20260721;

function generateAll(): ConflictTask[] {
	const tasks: ConflictTask[] = [];
	for (let packIndex = 0; packIndex < 12; packIndex += 1) {
		const rng = createRng(CONFLICT_SEED + packIndex * 977 + 5);
		tasks.push(...generateConflictPack(rng, packIndex));
	}
	return tasks;
}

describe("Study AA corpus", () => {
	const tasks = generateAll();

	test("36 tasks: 12 per kind; rr listing order balanced 6/6", () => {
		expect(tasks).toHaveLength(36);
		for (const kind of ["ri", "override", "rr"] as const) {
			expect(tasks.filter((t) => t.kind === kind)).toHaveLength(12);
		}
		const rr = tasks.filter((t) => t.kind === "rr");
		expect(rr.filter((t) => t.ruleOrder === "phrase-first")).toHaveLength(6);
		expect(rr.filter((t) => t.ruleOrder === "city-first")).toHaveLength(6);
	});

	test("generation is deterministic", () => {
		expect(JSON.stringify(generateAll())).toBe(JSON.stringify(tasks));
	});

	test("committed corpus matches the generator at the registered seed", () => {
		if (!existsSync("corpus/conflict.json")) return;
		const committed = JSON.parse(
			readFileSync("corpus/conflict.json", "utf8"),
		) as {
			seed: number;
			tasks: ConflictTask[];
		};
		expect(committed.seed).toBe(CONFLICT_SEED);
		expect(JSON.stringify(committed.tasks)).toBe(JSON.stringify(tasks));
	});

	test("every task passes the registered validation", () => {
		for (const task of tasks) {
			expect(validateConflictTask(task)).toEqual([]);
		}
	});

	test("rr listing order is real: both orders appear in the styleguide", () => {
		const first = tasks.find(
			(t) => t.kind === "rr" && t.ruleOrder === "phrase-first",
		) as ConflictTask;
		const second = tasks.find(
			(t) => t.kind === "rr" && t.ruleOrder === "city-first",
		) as ConflictTask;
		const styleA = first.pack.split("## Styleguide")[1] as string;
		const styleB = second.pack.split("## Styleguide")[1] as string;
		expect(styleA.indexOf("Built to Endure.")).toBeLessThan(
			styleA.indexOf("city name"),
		);
		expect(styleB.indexOf("city name")).toBeLessThan(
			styleB.indexOf("Built to Endure."),
		);
	});
});

describe("reading classifiers (registered fixtures)", () => {
	const tasks = generateAll();
	const ri = tasks.find((t) => t.kind === "ri") as ConflictTask;
	const ov = tasks.find((t) => t.kind === "override") as ConflictTask;
	const rr = tasks.find((t) => t.kind === "rr") as ConflictTask;

	test("ri: both / form / unmarked / violation", () => {
		const { email, city, product } = ri.target;
		const form = `${email} | ${city}`;
		expect(classifyReading(ri, `${form} — ${product}™`)).toBe("both");
		expect(classifyReading(ri, form)).toBe("form");
		expect(classifyReading(ri, `${form} — ${product}`)).toBe("unmarked");
		expect(classifyReading(ri, `${city} | ${email}`)).toBe("violation");
		expect(classifyReading(ri, "")).toBe("violation");
	});

	test("override: enforced / honored / avoided / violation", () => {
		const { product } = ov.target;
		expect(classifyReading(ov, `Meet ${product}™, built for you.`)).toBe(
			"enforced",
		);
		expect(classifyReading(ov, `Meet ${product}, built for you.`)).toBe(
			"honored",
		);
		expect(classifyReading(ov, "Built for teams that endure.")).toBe("avoided");
		expect(classifyReading(ov, "")).toBe("violation");
	});

	test("rr: phrase / city / merge / neither, in registered order", () => {
		const { city } = rr.target;
		expect(classifyReading(rr, "A tool for teams. Built to Endure.")).toBe(
			"phrase",
		);
		expect(classifyReading(rr, `A tool for teams in ${city}.`)).toBe("city");
		expect(classifyReading(rr, `A tool for teams in ${city}!`)).toBe("city");
		expect(
			classifyReading(rr, `Built to Endure. is our promise in ${city} land`),
		).toBe("merge");
		expect(classifyReading(rr, "A tool for teams.")).toBe("neither");
		// endsWith the phrase wins even when the city also appears.
		expect(
			classifyReading(rr, `A tool for ${city} teams. Built to Endure.`),
		).toBe("phrase");
	});

	test("indicators map readings as registered", () => {
		expect(isLiteral("ri", "form")).toBe(true);
		expect(isLiteral("override", "enforced")).toBe(true);
		expect(isLiteral("ri", "both")).toBe(false);
		expect(isLiteral("rr", "phrase")).toBe(false);
		expect(isInstructionFavored("ri", "both")).toBe(true);
		expect(isInstructionFavored("override", "honored")).toBe(true);
		expect(isInstructionFavored("override", "avoided")).toBe(false);
	});

	test("contamination scan flags distractor values", () => {
		const d = ri.distractors[0];
		if (!d) throw new Error("no distractor");
		expect(scanContamination(ri, `${ri.target.email} | ${d.city}`)).toContain(
			`${d.name}:${d.city}`,
		);
		expect(
			scanContamination(ri, `${ri.target.email} | ${ri.target.city}`),
		).toEqual([]);
	});
});

describe("arm constructions", () => {
	const tasks = generateAll();
	const task = tasks.find((t) => t.kind === "ri") as ConflictTask;

	test("AA-base ships the hard pack, empty tail", () => {
		const { staticBlock, dynamicBlock } = conflictBlocks(task, "AA-base");
		expect(staticBlock).toContain(task.pack);
		expect(staticBlock).not.toContain(PRIORITY_META_RULE);
		expect(dynamicBlock).toBe("");
	});

	test("AA-priority inserts the registered meta-rule exactly once, under the heading", () => {
		const { staticBlock } = conflictBlocks(task, "AA-priority");
		expect(staticBlock.split(PRIORITY_META_RULE)).toHaveLength(2);
		expect(staticBlock).toContain(`## Styleguide\n${PRIORITY_META_RULE}\n`);
	});

	test("AA-soft ships the soft pack", () => {
		const { staticBlock } = conflictBlocks(task, "AA-soft");
		expect(staticBlock).toContain(task.softPack);
		expect(staticBlock).toContain(CONFLICT_RULES_SOFT.tm(task.target.product));
		expect(staticBlock).not.toContain(`Product names always carry the ™ mark`);
	});

	test("AA-memo ships the hard pack plus the rules in the tail", () => {
		const { staticBlock, dynamicBlock } = conflictBlocks(task, "AA-memo");
		expect(staticBlock).toContain(task.pack);
		expect(dynamicBlock).toContain("Session notes");
		for (const rule of task.memoRules) {
			expect(dynamicBlock).toContain(rule);
		}
	});
});

describe("Study AB: shipped precedence clause (v3.188.1 @ ce06373)", () => {
	const tasks = generateAll();
	const ov = tasks.find((t) => t.kind === "override") as ConflictTask;

	test("v2 formatter is v1 plus exactly the shipped PRECEDENCE clause", () => {
		const notes = ov.memoRules.map((text) => ({
			kind: "rule" as const,
			text,
		}));
		const v1 = formatSessionNotesBlock(notes);
		const v2 = formatSessionNotesBlockV2(notes);
		const clause =
			" PRECEDENCE: a direct, explicit instruction in the current request overrides any note here for that request — the memo carries standing intent, not vetoes (a one-off override is not a retraction; keep the note unless the user retracts it).";
		expect(v2).toBe(
			v1.replace(
				"anchor goal-directed rewrites on the goals below.",
				`anchor goal-directed rewrites on the goals below.${clause}`,
			),
		);
		expect(formatSessionNotesBlockV2([])).toBe("");
	});

	test("character identity with the shipped source (when sibling checkout present)", () => {
		const shipped = `${process.env.HOME}/newdev/slx-replicator/src/lib/utils/sessionNotes.ts`;
		if (!existsSync(shipped)) return;
		const source = readFileSync(shipped, "utf8");
		const start = source.indexOf("## Session notes (app-maintained memo)");
		const end = source.indexOf("${sections.join", start);
		const shippedHeader = source.slice(start, end);
		const port = readFileSync("src/shipped/session-notes.ts", "utf8");
		expect(port).toContain(shippedHeader);
	});

	test("AB-memo matches AA-memo construction; AB-clause differs only by the clause", () => {
		const aa = conflictBlocks(ov, "AA-memo");
		const abMemo = conflictBlocks(ov, "AB-memo");
		const abClause = conflictBlocks(ov, "AB-clause");
		expect(abMemo).toEqual(aa);
		expect(abClause.staticBlock).toBe(abMemo.staticBlock);
		expect(abClause.dynamicBlock).toContain("PRECEDENCE:");
		expect(abMemo.dynamicBlock).not.toContain("PRECEDENCE:");
		expect(
			abClause.dynamicBlock.replace(
				" PRECEDENCE: a direct, explicit instruction in the current request overrides any note here for that request — the memo carries standing intent, not vetoes (a one-off override is not a retraction; keep the note unless the user retracts it).",
				"",
			),
		).toBe(abMemo.dynamicBlock);
	});
});
