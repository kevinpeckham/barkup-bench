/**
 * Seeded tree sampling. treeArbitrary (from @kevinpeckham/barkup/testing,
 * per BRIEF) supplies grammar-valid random trees; we stratify by node
 * count into the four pre-registered size buckets, then assign every node
 * an id (edits reference nodes by id) and humanize the content.
 *
 * Determinism: fc.sample with an explicit seed is reproducible, and the
 * humanize pass uses our own seeded Rng — the same (bucket, seed, count)
 * always yields byte-identical trees.
 */
import type { BarkupNode, GrammarConfig } from "@kevinpeckham/barkup";
import { treeArbitrary } from "@kevinpeckham/barkup/testing";
import fc from "fast-check";
import { BENCH_CONFIG } from "../grammar.js";
import { assignSequentialIds, countNodes } from "../tree.js";
import { humanizeTree } from "./humanize.js";
import { createRng } from "./rng.js";

/**
 * Shape-only view of the grammar for sampling: same node types,
 * containment, attribute keys and required flags — but every attribute
 * typed "boolean" so fast-check's value generation is O(1) per
 * attribute. The generated values are discarded by humanizeTree (which
 * assigns realistic values per the REAL grammar); only the tree shape
 * and attribute-presence pattern survive sampling. Without this, a
 * large global fast-check size (needed so children arrays reach their
 * max lengths and big trees are reachable) would also inflate string
 * and json value generators pathologically.
 */
const SHAPE_CONFIG: GrammarConfig = {
	...BENCH_CONFIG,
	nodes: Object.fromEntries(
		Object.entries(BENCH_CONFIG.nodes).map(([type, spec]) => [
			type,
			{
				...spec,
				attributes: Object.fromEntries(
					Object.entries(spec.attributes ?? {}).map(([key, attr]) => [
						key,
						{
							type: "boolean" as const,
							...(attr.required ? { required: true } : {}),
						},
					]),
				),
			},
		]),
	),
};

export type BucketName =
	| "xs"
	| "s"
	| "m"
	| "l"
	| "xl"
	| "xxl"
	| "xxxl";

export interface BucketSpec {
	name: BucketName;
	/** Nominal size used in reporting. */
	target: number;
	min: number;
	max: number;
	maxDepth: number;
	maxChildren: number;
	/** How many raw samples to draw before stratifying. */
	sampleSize: number;
}

export const BUCKETS: Record<BucketName, BucketSpec> = {
	xs: {
		name: "xs",
		target: 5,
		min: 3,
		max: 8,
		maxDepth: 3,
		maxChildren: 3,
		sampleSize: 500,
	},
	s: {
		name: "s",
		target: 20,
		min: 15,
		max: 28,
		maxDepth: 4,
		maxChildren: 4,
		sampleSize: 500,
	},
	m: {
		name: "m",
		target: 60,
		min: 45,
		max: 80,
		maxDepth: 5,
		maxChildren: 5,
		sampleSize: 2000,
	},
	l: {
		name: "l",
		target: 150,
		min: 115,
		max: 190,
		maxDepth: 6,
		maxChildren: 6,
		sampleSize: 4000,
	},
	// Study H size-extension buckets (docs/BRIEF-H.md).
	xl: {
		name: "xl",
		target: 300,
		min: 240,
		max: 380,
		maxDepth: 7,
		maxChildren: 7,
		sampleSize: 3000,
	},
	xxl: {
		name: "xxl",
		target: 600,
		min: 480,
		max: 750,
		maxDepth: 8,
		maxChildren: 8,
		sampleSize: 3000,
	},
	xxxl: {
		name: "xxxl",
		target: 1000,
		min: 800,
		max: 1250,
		maxDepth: 9,
		maxChildren: 9,
		sampleSize: 3000,
	},
};

/**
 * Draw `count` trees in the bucket's node-count band. Throws if the
 * sample pool cannot supply enough — that is a corpus-configuration bug,
 * not something to paper over.
 */
export function sampleTrees(
	bucket: BucketSpec,
	seed: number,
	count: number,
): BarkupNode[] {
	// Bias fast-check toward its maxima so children arrays fill up and
	// large buckets are reachable (values are shape-only — see SHAPE_CONFIG).
	const previous = fc.readConfigureGlobal();
	fc.configureGlobal({ ...previous, baseSize: "xlarge" });
	let samples: BarkupNode[];
	try {
		samples = fc.sample(
			treeArbitrary(SHAPE_CONFIG, {
				maxDepth: bucket.maxDepth,
				maxChildren: bucket.maxChildren,
			}),
			{ seed, numRuns: bucket.sampleSize },
		);
	} finally {
		fc.configureGlobal(previous);
	}

	const inBand = samples.filter((tree) => {
		const n = countNodes(tree);
		return n >= bucket.min && n <= bucket.max;
	});
	if (inBand.length < count) {
		throw new Error(
			`Bucket "${bucket.name}": only ${inBand.length}/${count} trees in ` +
				`[${bucket.min}, ${bucket.max}] from ${bucket.sampleSize} samples — ` +
				`tune maxDepth/maxChildren/sampleSize.`,
		);
	}

	return inBand.slice(0, count).map((tree, index) => {
		const rng = createRng(seed * 31 + index * 7919 + 1);
		return humanizeTree(assignSequentialIds(tree), rng);
	});
}
