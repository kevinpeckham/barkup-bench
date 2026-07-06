/**
 * Reading tasks (H5): exact-answer structural questions, generated with
 * their answers computed programmatically from the tree.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { collectByType, walkTree } from "../tree.js";
import type { Rng } from "./rng.js";

export interface Question {
	prompt: string;
	answer: string;
}

function ordinal(n: number): string {
	const suffix =
		n % 100 >= 11 && n % 100 <= 13
			? "th"
			: n % 10 === 1
				? "st"
				: n % 10 === 2
					? "nd"
					: n % 10 === 3
						? "rd"
						: "th";
	return `${n}${suffix}`;
}

const TYPES = [
	"page",
	"block",
	"widget-slot",
	"text-atom",
	"image-atom",
] as const;

export function generateQuestion(tree: BarkupNode, rng: Rng): Question {
	const kinds = [
		countTypeGlobal,
		countDirectChildren,
		attributeValue,
		nthChildType,
		countTypeUnder,
	];
	// Seeded order; first generator that applies wins.
	for (let i = kinds.length - 1; i > 0; i -= 1) {
		const j = rng.int(0, i);
		const a = kinds[i] as (typeof kinds)[number];
		kinds[i] = kinds[j] as (typeof kinds)[number];
		kinds[j] = a;
	}
	for (const kind of kinds) {
		const question = kind(tree, rng);
		if (question) return question;
	}
	throw new Error("No applicable question for tree — corpus bug");
}

function countTypeGlobal(tree: BarkupNode, rng: Rng): Question {
	const type = rng.pick(TYPES);
	const count = collectByType(tree, type).length;
	return {
		prompt: `How many ${type} nodes does the tree contain in total, at any depth?`,
		answer: String(count),
	};
}

function countDirectChildren(tree: BarkupNode, rng: Rng): Question | null {
	const candidates: BarkupNode[] = [];
	walkTree(tree, ({ node }) => {
		if (node.id !== undefined) candidates.push(node);
	});
	if (candidates.length === 0) return null;
	const node = rng.pick(candidates);
	return {
		prompt: `How many direct children does the ${node.type} with id "${node.id}" have?`,
		answer: String((node.children ?? []).length),
	};
}

function attributeValue(tree: BarkupNode, rng: Rng): Question | null {
	const candidates: BarkupNode[] = [];
	walkTree(tree, ({ node }) => {
		if (
			node.id !== undefined &&
			Object.keys(node.attributes ?? {}).length > 0
		) {
			candidates.push(node);
		}
	});
	if (candidates.length === 0) return null;
	const node = rng.pick(candidates);
	const key = rng.pick(Object.keys(node.attributes ?? {}));
	const value = node.attributes?.[key];
	const answer =
		typeof value === "string" ? value : JSON.stringify(value ?? null);
	return {
		prompt: `What is the value of the "${key}" attribute on the ${node.type} with id "${node.id}"?`,
		answer,
	};
}

function nthChildType(tree: BarkupNode, rng: Rng): Question | null {
	const candidates: BarkupNode[] = [];
	walkTree(tree, ({ node }) => {
		if (node.id !== undefined && (node.children ?? []).length >= 2) {
			candidates.push(node);
		}
	});
	if (candidates.length === 0) return null;
	const node = rng.pick(candidates);
	const children = node.children ?? [];
	const index = rng.int(0, children.length - 1);
	return {
		prompt: `What is the node type of the ${ordinal(index + 1)} direct child of the ${node.type} with id "${node.id}"?`,
		answer: (children[index] as BarkupNode).type,
	};
}

function countTypeUnder(tree: BarkupNode, rng: Rng): Question | null {
	const candidates: BarkupNode[] = [];
	walkTree(tree, ({ node }) => {
		if (
			node.id !== undefined &&
			(node.children ?? []).length > 0 &&
			node !== tree
		) {
			candidates.push(node);
		}
	});
	if (candidates.length === 0) return null;
	const node = rng.pick(candidates);
	const type = rng.pick(TYPES);
	let count = 0;
	walkTree(node, ({ node: n }) => {
		if (n !== node && n.type === type) count += 1;
	});
	return {
		prompt: `How many ${type} nodes are inside the subtree of the ${node.type} with id "${node.id}", not counting that node itself?`,
		answer: String(count),
	};
}
