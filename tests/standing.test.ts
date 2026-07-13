/**
 * Study Z machinery tests (docs/BRIEF-Z.md): the verbatim
 * buildCachedSystem port, pack generation determinism + validation,
 * the registered obligation graders against compliant / violating /
 * near-miss fixtures, Layer-1 only-target-changed, and the three arm
 * constructions.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { createRng } from "../src/corpus/rng.js";
import {
	FILLER_RULES,
	generateStandingPack,
	gradeStanding,
	RULE_TEXTS,
	type StandingTask,
	validateStandingTask,
} from "../src/corpus/standing.js";
import {
	onlyTargetChanged,
	standingBlocks,
} from "../src/harness/standing-runner.js";
import { buildCachedSystem } from "../src/shipped/prompt-cache.js";
import { findById } from "../src/tree.js";

const STANDING_SEED = 20260720;

function generateAll(): StandingTask[] {
	const tasks: StandingTask[] = [];
	for (let packIndex = 0; packIndex < 12; packIndex += 1) {
		const rng = createRng(STANDING_SEED + packIndex * 733 + 11);
		tasks.push(...generateStandingPack(rng, packIndex));
	}
	return tasks;
}

function withContent(
	task: StandingTask,
	content: string,
	textStyle?: string,
): BarkupNode {
	const tree = structuredClone(task.tree);
	const node = findById(tree, task.targetId);
	if (!node) throw new Error("target missing");
	node.attributes = {
		...node.attributes,
		content,
		...(textStyle !== undefined ? { textStyle } : {}),
	};
	return tree;
}

describe("shipped port (verbatim, slx-replicator v3.185.0 @ 34c942f)", () => {
	test("static block carries the ephemeral breakpoint; dynamic tail is plain", () => {
		const system = buildCachedSystem("STATIC", "DYNAMIC");
		expect(system).toEqual([
			{
				content: "STATIC",
				providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
				role: "system",
			},
			{ content: "DYNAMIC", role: "system" },
		]);
	});

	test("empty dynamic tail yields a single cached block", () => {
		const system = buildCachedSystem("STATIC", "");
		expect(system).toHaveLength(1);
		expect(system[0]?.content).toBe("STATIC");
	});

	test("character identity with the shipped source (when sibling checkout present)", () => {
		const shipped = `${process.env.HOME}/newdev/slx-replicator/src/lib/utils/promptCache.ts`;
		if (!existsSync(shipped)) return;
		const source = readFileSync(shipped, "utf8");
		const port = readFileSync("src/shipped/prompt-cache.ts", "utf8");
		const extract = (text: string): string => {
			const start = text.indexOf("export function buildCachedSystem");
			const end = text.indexOf("\n}", start);
			return text.slice(start, end + 2);
		};
		expect(extract(port)).toBe(extract(source));
	});
});

describe("Study Z corpus", () => {
	const tasks = generateAll();

	test("36 tasks: 12 fact, 12 rule, 12 combined; positions balanced", () => {
		expect(tasks).toHaveLength(36);
		for (const kind of ["fact", "rule", "combined"] as const) {
			expect(tasks.filter((t) => t.kind === kind)).toHaveLength(12);
		}
		const ruleTasks = tasks.filter((t) => t.kind === "rule");
		for (const position of ["head", "middle", "tail"] as const) {
			expect(ruleTasks.filter((t) => t.rulePosition === position)).toHaveLength(
				4,
			);
		}
	});

	test("generation is deterministic", () => {
		expect(JSON.stringify(generateAll())).toBe(JSON.stringify(tasks));
	});

	test("committed corpus matches the generator at the registered seed", () => {
		if (!existsSync("corpus/standing.json")) return;
		const committed = JSON.parse(
			readFileSync("corpus/standing.json", "utf8"),
		) as { seed: number; tasks: StandingTask[] };
		expect(committed.seed).toBe(STANDING_SEED);
		expect(JSON.stringify(committed.tasks)).toBe(JSON.stringify(tasks));
	});

	test("every task passes the registered validation", () => {
		for (const task of tasks) {
			expect(validateStandingTask(task)).toEqual([]);
		}
	});

	test("packs carry 12 numbered styleguide rules with governing rules placed", () => {
		for (const task of tasks) {
			const styleguide = task.pack.split("## Styleguide\n")[1] ?? "";
			const lines = styleguide.split("\n").filter((l) => /^\d+\. /.test(l));
			expect(lines).toHaveLength(12);
			if (task.kind !== "fact") {
				for (const rule of task.memoRules) {
					expect(styleguide).toContain(rule);
				}
			}
		}
	});

	test("filler rules never collide with governing rule text", () => {
		const governing = [
			RULE_TEXTS.cta,
			RULE_TEXTS.style,
			RULE_TEXTS.end,
			RULE_TEXTS.contact,
		];
		for (const filler of FILLER_RULES) {
			expect(governing).not.toContain(filler);
		}
	});
});

describe("obligation graders (registered fixtures)", () => {
	const tasks = generateAll();
	const fact = tasks.find((t) => t.kind === "fact") as StandingTask;
	const headline = tasks.find(
		(t) => t.kind === "rule" && t.form === "headline",
	) as StandingTask;
	const tagline = tasks.find(
		(t) => t.kind === "rule" && t.form === "tagline",
	) as StandingTask;
	const cta = tasks.find(
		(t) => t.kind === "rule" && t.form === "cta",
	) as StandingTask;
	const combined = tasks.find((t) => t.kind === "combined") as StandingTask;

	test("fact: exact planted value passes; near-miss fails; distractor value is contamination", () => {
		const value = (fact.obligations[0] as string).split(":").slice(2).join(":");
		expect(gradeStanding(fact, withContent(fact, value)).success).toBe(true);
		const wrong = gradeStanding(fact, withContent(fact, "hello@wrong.example"));
		expect(wrong.success).toBe(false);
		const distractor = fact.distractors[0];
		if (!distractor) throw new Error("no distractor");
		const sameField = (fact.obligations[0] as string).split(":")[1] as
			| "email"
			| "phone"
			| "product";
		const bait = gradeStanding(fact, withContent(fact, distractor[sameField]));
		expect(bait.success).toBe(false);
		expect(bait.contamination.length).toBeGreaterThan(0);
	});

	test("headline: ™ + display-serif required together", () => {
		const good = withContent(
			headline,
			`Introducing ${headline.target.product}™`,
			"display-serif",
		);
		expect(gradeStanding(headline, good).success).toBe(true);
		const noTm = withContent(
			headline,
			`Introducing ${headline.target.product}`,
			"display-serif",
		);
		expect(gradeStanding(headline, noTm).success).toBe(false);
		const noStyle = withContent(
			headline,
			`Introducing ${headline.target.product}™`,
		);
		expect(gradeStanding(headline, noStyle).success).toBe(false);
	});

	test("tagline: ™ + terminal phrase", () => {
		const good = withContent(
			tagline,
			`${tagline.target.product}™ for every team. Built to Endure.`,
		);
		expect(gradeStanding(tagline, good).success).toBe(true);
		const misplaced = withContent(
			tagline,
			`Built to Endure. ${tagline.target.product}™ for every team.`,
		);
		expect(gradeStanding(tagline, misplaced).success).toBe(false);
	});

	test("cta: exact string only", () => {
		expect(gradeStanding(cta, withContent(cta, "Get Started")).success).toBe(
			true,
		);
		expect(
			gradeStanding(cta, withContent(cta, "Get Started Today")).success,
		).toBe(false);
		expect(gradeStanding(cta, withContent(cta, "Learn More")).success).toBe(
			false,
		);
	});

	test("combined: contact format + ™; distractor city is contamination", () => {
		const good = withContent(
			combined,
			`${combined.target.email} | ${combined.target.city} — home of ${combined.target.product}™`,
		);
		expect(gradeStanding(combined, good).success).toBe(true);
		const wrongOrder = withContent(
			combined,
			`${combined.target.city} | ${combined.target.email} (${combined.target.product}™)`,
		);
		expect(gradeStanding(combined, wrongOrder).success).toBe(false);
		const otherCity = combined.distractors.find(
			(d) => d.city !== combined.target.city,
		);
		if (!otherCity) throw new Error("no distinct-city distractor");
		const bleed = gradeStanding(
			combined,
			withContent(
				combined,
				`${combined.target.email} | ${otherCity.city} — ${combined.target.product}™`,
			),
		);
		expect(bleed.contamination.length).toBeGreaterThan(0);
	});
});

describe("Layer 1: only the target slot changed", () => {
	const tasks = generateAll();
	const task = tasks[0] as StandingTask;

	test("target-only edit passes; off-target edit fails; structural change fails", () => {
		const good = withContent(task, "new content");
		expect(onlyTargetChanged(task.tree, good, task.targetId)).toBe(true);

		const offTarget = structuredClone(good);
		const other = findById(offTarget, "n4");
		if (!other) throw new Error("n4 missing");
		other.attributes = { ...other.attributes, content: "drive-by edit" };
		expect(onlyTargetChanged(task.tree, offTarget, task.targetId)).toBe(false);

		const structural = structuredClone(good);
		const hero = findById(structural, "n3");
		if (!hero?.children) throw new Error("hero missing");
		hero.children.push({
			type: "text-atom",
			id: "n99",
			attributes: { maxLength: 10 },
		});
		expect(onlyTargetChanged(task.tree, structural, task.targetId)).toBe(false);
	});
});

describe("arm constructions", () => {
	const tasks = generateAll();
	const ruleTask = tasks.find((t) => t.kind === "rule") as StandingTask;
	const factTask = tasks.find((t) => t.kind === "fact") as StandingTask;

	test("Z-full ships the whole pack statically with an empty tail", () => {
		const { staticBlock, dynamicBlock } = standingBlocks(ruleTask, "Z-full");
		expect(staticBlock).toContain(ruleTask.pack);
		expect(staticBlock).toContain("anchored patch");
		expect(dynamicBlock).toBe("");
	});

	test("Z-slice ships the excerpt, not the full pack", () => {
		const { staticBlock } = standingBlocks(ruleTask, "Z-slice");
		expect(staticBlock).toContain(ruleTask.slicePack);
		expect(staticBlock).not.toContain(ruleTask.pack);
		for (const d of ruleTask.distractors) {
			expect(staticBlock).not.toContain(d.email);
		}
	});

	test("Z-memo adds the governing rules as a session-notes tail over the full pack", () => {
		const { staticBlock, dynamicBlock } = standingBlocks(ruleTask, "Z-memo");
		expect(staticBlock).toContain(ruleTask.pack);
		expect(dynamicBlock).toContain("Session notes");
		for (const rule of ruleTask.memoRules) {
			expect(dynamicBlock).toContain(rule);
		}
	});

	test("fact tasks have no rules to distill: Z-memo tail is empty (registered)", () => {
		const { dynamicBlock } = standingBlocks(factTask, "Z-memo");
		expect(dynamicBlock).toBe("");
	});
});
