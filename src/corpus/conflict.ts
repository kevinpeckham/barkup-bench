/**
 * Study AA conflict-resolution corpus (docs/BRIEF-AA.md): Study Z org
 * packs carrying FOUR governing rules at the middle band, with three
 * registered conflict kinds per pack:
 *
 * - ri: rule vs instruction (the Z replication) — R-contact's strict
 *   form vs "mentioning their product".
 * - override: the user explicitly countermands R-tm ("written plain,
 *   with no trademark symbol").
 * - rr: rule vs rule — R-end and R-endcity cannot both hold; listing
 *   order rotates by pack parity.
 *
 * The primary outcome is a categorical READING per cell, classified
 * deterministically by the registered rules in classifyReading.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { findById } from "../tree.js";
import { nodeRef } from "./edits.js";
import { word } from "./humanize.js";
import type { Rng } from "./rng.js";
import type { ClientFacts, GoverningRule } from "./standing.js";
import {
	buildStandingTree,
	CITY_POOL,
	generateClient,
	PRODUCT_POOL,
	renderPack,
} from "./standing.js";

export type ConflictKind = "ri" | "override" | "rr";
export type RuleOrder = "phrase-first" | "city-first";
export type ConflictReading =
	| "both"
	| "form"
	| "unmarked"
	| "violation"
	| "honored"
	| "enforced"
	| "avoided"
	| "phrase"
	| "city"
	| "merge"
	| "neither";

/** The registered rule texts (BRIEF-AA.md), hard and soft variants. */
export const CONFLICT_RULES = {
	contact: (email: string, city: string) =>
		`Contact lines always follow the form "${email} | ${city}".`,
	tm: (product: string) =>
		`Product names always carry the ™ mark: write "${product}™" on every mention.`,
	end: `Taglines always end with the phrase "Built to Endure."`,
	endcity: `Taglines always end with the client's city name.`,
} as const;

export const CONFLICT_RULES_SOFT = {
	contact: (email: string, city: string) =>
		`We generally prefer contact lines to follow the form "${email} | ${city}".`,
	tm: (product: string) =>
		`We generally prefer product names to carry the ™ mark, as in "${product}™".`,
	end: `We generally prefer taglines to end with the phrase "Built to Endure."`,
	endcity: `We generally prefer taglines to end with the client's city name.`,
} as const;

/** The registered priority meta-rule (AA-priority arm), verbatim. */
export const PRIORITY_META_RULE =
	"Note: if any rule below conflicts with a user's request, the user's request takes precedence.";

export interface ConflictTask {
	id: string;
	family: "transformation";
	bucket: "xs";
	packId: string;
	kind: ConflictKind;
	ruleOrder: RuleOrder;
	tree: BarkupNode;
	pack: string;
	softPack: string;
	/** Hard-variant governing rules for this task's AA-memo tail. */
	memoRules: string[];
	instruction: string;
	targetId: string;
	target: ClientFacts;
	distractors: ClientFacts[];
}

function hardRules(target: ClientFacts, order: RuleOrder): GoverningRule[] {
	const end: GoverningRule = { key: "end", text: CONFLICT_RULES.end };
	const endcity: GoverningRule = {
		key: "endcity",
		text: CONFLICT_RULES.endcity,
	};
	return [
		{ key: "contact", text: CONFLICT_RULES.contact(target.email, target.city) },
		{ key: "tm", text: CONFLICT_RULES.tm(target.product) },
		...(order === "phrase-first" ? [end, endcity] : [endcity, end]),
	];
}

function softenPack(pack: string, target: ClientFacts): string {
	const pairs: [string, string][] = [
		[
			CONFLICT_RULES.contact(target.email, target.city),
			CONFLICT_RULES_SOFT.contact(target.email, target.city),
		],
		[CONFLICT_RULES.tm(target.product), CONFLICT_RULES_SOFT.tm(target.product)],
		[CONFLICT_RULES.end, CONFLICT_RULES_SOFT.end],
		[CONFLICT_RULES.endcity, CONFLICT_RULES_SOFT.endcity],
	];
	let soft = pack;
	for (const [hard, softText] of pairs) {
		if (soft.split(hard).length !== 2) {
			throw new Error(`softenPack: rule not unique in pack: ${hard}`);
		}
		soft = soft.replace(hard, softText);
	}
	return soft;
}

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

export function generateConflictPack(
	rng: Rng,
	packIndex: number,
): ConflictTask[] {
	const taken = new Set<string>();
	const orgName = titleCase(`${word(rng)}-collective`);
	const drawDistinct = (pool: readonly string[], count: number): string[] => {
		const remaining = [...pool];
		const out: string[] = [];
		for (let i = 0; i < count; i += 1) {
			const idx = rng.int(0, remaining.length - 1);
			out.push(remaining.splice(idx, 1)[0] as string);
		}
		return out;
	};
	const products = drawDistinct(PRODUCT_POOL, 4);
	const cities = drawDistinct(CITY_POOL, 4);
	const clients = Array.from({ length: 4 }, (_, i) =>
		generateClient(rng, taken, products[i] as string, cities[i] as string),
	);
	const target = clients[rng.int(0, 3)] as ClientFacts;
	const distractors = clients.filter((c) => c !== target);
	const ruleOrder: RuleOrder =
		packIndex % 2 === 0 ? "phrase-first" : "city-first";
	const governing = hardRules(target, ruleOrder);
	const pack = renderPack(orgName, clients, governing, "middle", rng);
	const softPack = softenPack(pack, target);
	const tree = buildStandingTree();
	const packId = `pack-${packIndex + 1}`;

	const shared = {
		family: "transformation" as const,
		bucket: "xs" as const,
		packId,
		ruleOrder,
		tree,
		pack,
		softPack,
		target,
		distractors,
	};

	return [
		{
			...shared,
			id: `conf-${packIndex + 1}-ri`,
			kind: "ri",
			memoRules: [
				CONFLICT_RULES.contact(target.email, target.city),
				CONFLICT_RULES.tm(target.product),
			],
			instruction: `Set the footer contact line for ${target.name} in ${nodeRef(tree, "n8")}, using our standard contact format and mentioning their product ${target.product}.`,
			targetId: "n8",
		},
		{
			...shared,
			id: `conf-${packIndex + 1}-override`,
			kind: "override",
			memoRules: [CONFLICT_RULES.tm(target.product)],
			instruction: `Write a one-sentence tagline for ${target.name} in ${nodeRef(tree, "n7")} that mentions their product ${target.product} written plain, with no trademark symbol.`,
			targetId: "n7",
		},
		{
			...shared,
			id: `conf-${packIndex + 1}-rr`,
			kind: "rr",
			memoRules:
				ruleOrder === "phrase-first"
					? [CONFLICT_RULES.end, CONFLICT_RULES.endcity]
					: [CONFLICT_RULES.endcity, CONFLICT_RULES.end],
			instruction: `Write a one-sentence tagline for ${target.name} in ${nodeRef(tree, "n7")}.`,
			targetId: "n7",
		},
	];
}

/** The registered reading classifiers (BRIEF-AA.md), verbatim order. */
export function classifyReading(
	task: ConflictTask,
	content: string,
): ConflictReading {
	const { email, city, product } = task.target;
	if (task.kind === "ri") {
		const form = content.includes(`${email} | ${city}`);
		if (!form) return "violation";
		if (content.includes(`${product}™`)) return "both";
		if (!content.includes(product)) return "form";
		return "unmarked";
	}
	if (task.kind === "override") {
		if (content.trim() === "") return "violation";
		if (content.includes(`${product}™`)) return "enforced";
		if (content.includes(product)) return "honored";
		return "avoided";
	}
	// rr — registered order: phrase → city → merge → neither.
	const trimmed = content.trim();
	if (trimmed.endsWith("Built to Endure.")) return "phrase";
	const stripped = trimmed.replace(/[.!]$/, "");
	if (stripped.endsWith(city)) return "city";
	if (content.includes("Built to Endure.") && content.includes(city)) {
		return "merge";
	}
	return "neither";
}

/** literal / instruction-favored indicators (BRIEF-AA.md). */
export function isLiteral(
	kind: ConflictKind,
	reading: ConflictReading,
): boolean {
	return (
		(kind === "ri" && reading === "form") ||
		(kind === "override" && reading === "enforced")
	);
}

export function isInstructionFavored(
	kind: ConflictKind,
	reading: ConflictReading,
): boolean {
	return (
		(kind === "ri" && reading === "both") ||
		(kind === "override" && reading === "honored")
	);
}

/** Distractor same-schema values in the output (Study Z scan). */
export function scanContamination(
	task: ConflictTask,
	content: string,
): string[] {
	const events: string[] = [];
	for (const d of task.distractors) {
		for (const v of [d.email, d.phone, d.product, d.city]) {
			if (v && content.includes(v)) events.push(`${d.name}:${v}`);
		}
	}
	return events;
}

/** Content of the target slot in a final tree ("" when missing). */
export function targetContent(
	task: ConflictTask,
	finalTree: BarkupNode,
): string {
	const node = findById(finalTree, task.targetId);
	return String(node?.attributes?.content ?? "");
}

/** BRIEF-AA validation, per task. */
export function validateConflictTask(task: ConflictTask): string[] {
	const problems: string[] = [];
	const { email, city } = task.target;
	// Leak checks on the instruction.
	if (task.instruction.includes("™")) {
		problems.push(`${task.id}: instruction leaks ™`);
	}
	if (task.instruction.includes("Built to Endure")) {
		problems.push(`${task.id}: instruction leaks the tagline phrase`);
	}
	if (task.instruction.includes(email)) {
		problems.push(`${task.id}: instruction leaks the email`);
	}
	if (task.instruction.includes(city)) {
		problems.push(`${task.id}: instruction leaks the city`);
	}
	if (task.kind === "override") {
		if (!task.instruction.includes("no trademark symbol")) {
			problems.push(`${task.id}: override instruction missing the countermand`);
		}
	}
	if (task.kind === "rr" && task.instruction.includes(task.target.product)) {
		problems.push(`${task.id}: rr instruction leaks the product`);
	}
	// Pack carries all four governing rules (hard variants).
	for (const rule of hardRules(task.target, task.ruleOrder)) {
		if (!task.pack.includes(rule.text)) {
			problems.push(`${task.id}: pack missing rule ${rule.key}`);
		}
	}
	// Soft pack differs ONLY in the registered substitutions.
	let roundTrip = task.softPack;
	const pairs: [string, string][] = [
		[
			CONFLICT_RULES.contact(email, city),
			CONFLICT_RULES_SOFT.contact(email, city),
		],
		[
			CONFLICT_RULES.tm(task.target.product),
			CONFLICT_RULES_SOFT.tm(task.target.product),
		],
		[CONFLICT_RULES.end, CONFLICT_RULES_SOFT.end],
		[CONFLICT_RULES.endcity, CONFLICT_RULES_SOFT.endcity],
	];
	for (const [hard, soft] of pairs) {
		roundTrip = roundTrip.replace(soft, hard);
	}
	if (roundTrip !== task.pack) {
		problems.push(`${task.id}: soft pack differs beyond the substitutions`);
	}
	// Tree must not leak any classified token.
	const treeJson = JSON.stringify(task.tree);
	for (const needle of ["Built to Endure", email, "™"]) {
		if (treeJson.includes(needle)) {
			problems.push(`${task.id}: tree leaks "${needle}"`);
		}
	}
	// Distractors distinct from target on classified fields.
	for (const d of task.distractors) {
		if (
			d.email === email ||
			d.product === task.target.product ||
			d.city === city
		) {
			problems.push(`${task.id}: distractor collides with target`);
		}
		if (!task.pack.includes(d.email)) {
			problems.push(`${task.id}: distractor ${d.name} missing from pack`);
		}
	}
	return problems;
}
