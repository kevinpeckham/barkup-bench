/**
 * Study Q fan-out corpus machinery (docs/BRIEF-Q.md): one instruction,
 * many targets. A fan-out edit applies to EVERY node of one type inside
 * one uniquely-describable container. Ground truth is computed by a
 * committed applier; instructions are id-free and templated; the
 * generator validates uniqueness, target count ≥ 2, and non-nesting.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { descendants, findById, findParent, walkTree } from "../tree.js";
import { formatValue } from "./edits.js";
import { refFor, refText, resolveRef } from "./grounded.js";
import type { Rng } from "./rng.js";

export type FanKind = "set-attribute-all" | "remove-all";

export interface FanoutTask {
	id: string;
	/** "transformation" so the standard runners grade it unchanged. */
	family: "transformation";
	bucket: string;
	tree: BarkupNode;
	instruction: string;
	expected: BarkupNode;
	fanKind: FanKind;
	targetType: string;
	containerId: string;
	targetIds: string[];
	key?: string;
	value?: AttributeValue;
}

/** Pre-registered type pools (BRIEF-Q.md). Removal types cannot nest in
 * the bench grammar, so removals are order-independent by construction. */
export const SET_TYPES = ["text-atom", "image-atom", "block"] as const;
export const REMOVE_TYPES = ["text-atom", "image-atom", "widget-slot"] as const;

/** Pre-registered attribute/value pools per settable type. */
export const SET_POOLS: Record<string, [string, AttributeValue][]> = {
	"text-atom": [
		["textStyle", "serif"],
		["textStyle", "display"],
		["maxLength", 96],
		["maxLength", 120],
	],
	"image-atom": [
		["aspectRatio", "16:9"],
		["aspectRatio", "1:1"],
		["src", "https://example.com/img/updated.webp"],
	],
	block: [
		["featured", true],
		["containerClasses", "highlight card"],
	],
};

/** Every strict descendant of the container with the target type (doc order). */
export function fanoutTargets(
	tree: BarkupNode,
	containerId: string,
	targetType: string,
): string[] {
	const container = findById(tree, containerId);
	if (!container) throw new Error(`fanout container "${containerId}" missing`);
	return descendants(container)
		.filter((node) => node.type === targetType && node.id !== undefined)
		.map((node) => node.id as string);
}

export interface FanoutSpec {
	fanKind: FanKind;
	targetIds: string[];
	key?: string;
	value?: AttributeValue;
}

/** Apply the fan-out. Throws on an inapplicable spec — corpus bugs must be loud. */
export function applyFanout(tree: BarkupNode, spec: FanoutSpec): BarkupNode {
	const out = structuredClone(tree);
	for (const id of spec.targetIds) {
		if (spec.fanKind === "set-attribute-all") {
			const node = findById(out, id);
			if (!node) throw new Error(`fanout target "${id}" missing`);
			if (spec.key === undefined || spec.value === undefined) {
				throw new Error("set-attribute-all requires key and value");
			}
			node.attributes = {
				...(node.attributes ?? {}),
				[spec.key]: spec.value as never,
			};
		} else {
			const located = findParent(out, id);
			if (!located) throw new Error(`fanout target "${id}" missing`);
			located.parent.children?.splice(located.index, 1);
			if (located.parent.children?.length === 0) {
				delete located.parent.children;
			}
		}
	}
	return out;
}

/** Deterministic id-free instruction text (BRIEF-Q.md template). */
export function describeFanout(
	tree: BarkupNode,
	containerId: string,
	targetType: string,
	spec: FanoutSpec,
): string {
	const container =
		containerId === tree.id
			? "the document root"
			: refText(refFor(tree, containerId));
	if (spec.fanKind === "set-attribute-all") {
		return `Set "${spec.key}" to ${formatValue(spec.value as AttributeValue)} on every ${targetType} inside ${container}.`;
	}
	return `Remove every ${targetType} inside ${container} (each with its whole subtree, if any).`;
}

function nested(tree: BarkupNode, targetIds: string[]): boolean {
	const targets = new Set(targetIds);
	for (const id of targetIds) {
		const node = findById(tree, id);
		if (!node) return true;
		if (descendants(node).some((d) => targets.has(d.id as string))) {
			return true;
		}
	}
	return false;
}

interface Candidate {
	containerId: string;
	targetType: string;
	targetIds: string[];
}

function candidates(tree: BarkupNode, types: readonly string[]): Candidate[] {
	const out: Candidate[] = [];
	walkTree(tree, ({ node }) => {
		if (node.id === undefined) return;
		const containerId = node.id;
		for (const targetType of types) {
			const targetIds = fanoutTargets(tree, containerId, targetType);
			if (targetIds.length < 2) continue;
			if (nested(tree, targetIds)) continue;
			const ref = refFor(tree, containerId);
			const matches = resolveRef(tree, ref);
			if (matches.length !== 1 || matches[0]?.id !== containerId) continue;
			out.push({ containerId, targetType, targetIds });
		}
	});
	return out;
}

/**
 * Generate one fan-out task for a tree, preferring the given kind and
 * falling back to the other when no candidate validates. Deterministic
 * for a given (tree, rng state, preferred kind).
 */
export function generateFanoutTask(
	tree: BarkupNode,
	bucket: string,
	id: string,
	rng: Rng,
	preferred: FanKind,
): FanoutTask {
	const kinds: FanKind[] =
		preferred === "set-attribute-all"
			? ["set-attribute-all", "remove-all"]
			: ["remove-all", "set-attribute-all"];
	for (const fanKind of kinds) {
		const pool = candidates(
			tree,
			fanKind === "set-attribute-all" ? SET_TYPES : REMOVE_TYPES,
		);
		if (pool.length === 0) continue;
		// Try seeded candidates until one changes the tree (set-attribute
		// on already-equal values would make expected === tree).
		for (let attempt = 0; attempt < 12; attempt += 1) {
			const candidate = rng.pick(pool);
			const spec: FanoutSpec = {
				fanKind,
				targetIds: candidate.targetIds,
				...(fanKind === "set-attribute-all"
					? (() => {
							const [key, value] = rng.pick(
								SET_POOLS[candidate.targetType] as [string, AttributeValue][],
							);
							return { key, value };
						})()
					: {}),
			};
			const expected = applyFanout(tree, spec);
			if (JSON.stringify(expected) === JSON.stringify(tree)) continue;
			return {
				id,
				family: "transformation",
				bucket,
				tree,
				instruction: describeFanout(
					tree,
					candidate.containerId,
					candidate.targetType,
					spec,
				),
				expected,
				fanKind,
				targetType: candidate.targetType,
				containerId: candidate.containerId,
				targetIds: candidate.targetIds,
				...(spec.key !== undefined ? { key: spec.key } : {}),
				...(spec.value !== undefined ? { value: spec.value } : {}),
			};
		}
	}
	throw new Error(`No valid fan-out candidate for ${id} — corpus bug`);
}
