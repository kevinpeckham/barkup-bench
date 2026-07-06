/**
 * Study G task family (docs/BRIEF-G.md): phase-1 insert of a
 * distinctively named node, six pre-generated filler edits (simple
 * set-attribute operations on distinct pre-existing nodes, never the
 * phase-1 node), and a final follow-up edit on the phase-1 node
 * referenced by the id from the model's own output. Arms use the
 * first N fillers. Fully deterministic from the seed.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { BENCH_CONFIG } from "../grammar.js";
import { walkTree } from "../tree.js";
import type { Edit } from "./edits.js";
import { buildNewNode, describeEdit } from "./edits.js";
import { generateAttributeValue, word } from "./humanize.js";
import type { Rng } from "./rng.js";
import { createRng } from "./rng.js";
import { EDIT2_ATTRIBUTE } from "./tasks.js";
import type { BucketName } from "./trees.js";
import { BUCKETS, sampleTrees } from "./trees.js";

export interface FollowupFiller {
	edit: Edit;
	instruction: string;
}

export interface FollowupTask {
	id: string;
	bucket: BucketName;
	tree: BarkupNode;
	insertEdit: Edit;
	instruction1: string;
	newNodeType: string;
	newNodeName: string;
	fillers: FollowupFiller[];
	finalKey: string;
	finalValue: AttributeValue;
	/** Contains %ID%, filled at run time with the id from the model's own output. */
	finalInstructionTemplate: string;
}

export interface FollowupCorpus {
	version: 1;
	seed: number;
	tasks: FollowupTask[];
}

export const FILLERS_PER_TASK = 6;

/** 40 tasks: 20 s-bucket + 20 m-bucket (pre-registered in BRIEF-G.md). */
export function generateFollowupCorpus(seed: number): FollowupCorpus {
	const tasks: FollowupTask[] = [];
	const plan: { bucket: BucketName; count: number; offset: number }[] = [
		{ bucket: "s", count: 20, offset: 100 },
		{ bucket: "m", count: 20, offset: 200 },
	];
	for (const { bucket, count, offset } of plan) {
		const trees = sampleTrees(BUCKETS[bucket], seed + offset, count);
		trees.forEach((tree, index) => {
			const rng = createRng(seed + offset + index * 131 + 7);
			tasks.push(
				buildFollowupTask(`follow-${bucket}-${index + 1}`, bucket, tree, rng),
			);
		});
	}
	return { version: 1, seed, tasks };
}

function buildFollowupTask(
	id: string,
	bucket: BucketName,
	tree: BarkupNode,
	rng: Rng,
): FollowupTask {
	// Phase 1: insert a distinctively named node (mirrors the reference family).
	const containers: BarkupNode[] = [];
	const allNodes: BarkupNode[] = [];
	const existingNames = new Set<string>();
	walkTree(tree, ({ node }) => {
		allNodes.push(node);
		if (node.name !== undefined) existingNames.add(node.name);
		if ((BENCH_CONFIG.nodes[node.type]?.children ?? []).length > 0) {
			containers.push(node);
		}
	});
	const parent = rng.pick(containers);
	const childType = rng.pick(
		BENCH_CONFIG.nodes[parent.type]?.children ?? [],
	) as string;
	let newNodeName = `spotlight-${word(rng)}`;
	while (existingNames.has(newNodeName)) {
		newNodeName = `spotlight-${word(rng)}-${word(rng)}`;
	}
	const node = buildNewNode(rng, childType, { named: true });
	node.name = newNodeName;
	const final = EDIT2_ATTRIBUTE[childType] as {
		key: string;
		value: AttributeValue;
	};
	if (
		node.attributes &&
		JSON.stringify(node.attributes[final.key]) === JSON.stringify(final.value)
	) {
		delete node.attributes[final.key];
		if (Object.keys(node.attributes).length === 0) delete node.attributes;
	}
	const insertEdit: Edit = {
		kind: "insert-node",
		parentId: parent.id as string,
		index: rng.int(0, (parent.children ?? []).length),
		node,
	};

	// Fillers: set-attribute on six DISTINCT pre-existing nodes, never
	// reusing a (node, key) pair, never targeting the phase-1 node
	// (which doesn't exist in `tree` anyway).
	const fillers: FollowupFiller[] = [];
	const usedTargets = new Set<string>();
	const candidates = allNodes.filter(
		(n) => Object.keys(BENCH_CONFIG.nodes[n.type]?.attributes ?? {}).length > 0,
	);
	let guard = 0;
	while (fillers.length < FILLERS_PER_TASK && guard < 500) {
		guard += 1;
		const target = rng.pick(candidates);
		const keys = Object.keys(BENCH_CONFIG.nodes[target.type]?.attributes ?? {});
		const key = rng.pick(keys);
		const pairKey = `${target.id}::${key}`;
		if (usedTargets.has(pairKey)) continue;
		let value = generateAttributeValue(rng, target.type, key);
		let attempts = 0;
		while (
			attempts < 10 &&
			JSON.stringify(value) === JSON.stringify(target.attributes?.[key])
		) {
			value = generateAttributeValue(rng, target.type, key);
			attempts += 1;
		}
		if (JSON.stringify(value) === JSON.stringify(target.attributes?.[key])) {
			continue;
		}
		usedTargets.add(pairKey);
		const edit: Edit = {
			kind: "set-attribute",
			nodeId: target.id as string,
			key,
			value,
		};
		fillers.push({ edit, instruction: describeEdit(tree, edit) });
	}
	if (fillers.length < FILLERS_PER_TASK) {
		throw new Error(
			`Task ${id}: could not generate ${FILLERS_PER_TASK} fillers`,
		);
	}

	return {
		id,
		bucket,
		tree,
		insertEdit,
		instruction1: describeEdit(tree, insertEdit),
		newNodeType: childType,
		newNodeName,
		fillers,
		finalKey: final.key,
		finalValue: final.value,
		finalInstructionTemplate: `Set the "${final.key}" attribute to ${
			typeof final.value === "string" ? `"${final.value}"` : String(final.value)
		} on the node with id "%ID%" (the ${childType} you created earlier).`,
	};
}
