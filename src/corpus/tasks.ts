/**
 * Pilot task assembly. Everything here is deterministic from the corpus
 * seed, EXCEPT construction specs, which are written by a held-out
 * describer model (scripts/describe-construction.ts) and then committed —
 * so the corpus file in git remains the single reproducible source.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { BENCH_CONFIG } from "../grammar.js";
import { walkTree } from "../tree.js";
import type { Edit } from "./edits.js";
import {
	applyEdit,
	buildNewNode,
	describeEdit,
	generateEdit,
} from "./edits.js";
import { word } from "./humanize.js";
import type { Question, QuestionKind } from "./questions.js";
import { generateQuestion } from "./questions.js";
import type { Rng } from "./rng.js";
import { createRng } from "./rng.js";
import type { BucketName } from "./trees.js";
import { BUCKETS, sampleTrees } from "./trees.js";

export type Family =
	| "construction"
	| "transformation"
	| "reference"
	| "reading";

interface TaskBase {
	id: string;
	family: Family;
	bucket: BucketName;
}

export interface TransformationTask extends TaskBase {
	family: "transformation";
	tree: BarkupNode;
	edit: Edit;
	instruction: string;
	expected: BarkupNode;
}

export interface ConstructionTask extends TaskBase {
	family: "construction";
	target: BarkupNode;
	/** Held-out describer output; null until scripts/describe-construction.ts runs. */
	spec: string | null;
	/** True once the spec passed the mechanical + rebuild audits; unverified tasks are excluded from scored runs. */
	specVerified?: boolean;
}

export interface ReferenceTask extends TaskBase {
	family: "reference";
	tree: BarkupNode;
	edit1: Edit;
	instruction1: string;
	expected1: BarkupNode;
	/** How to find the node created in step 1 inside the model's own output. */
	newNodeType: string;
	newNodeName: string;
	/** Step 2: set this attribute on the created node, referenced by the id from the model's own step-1 output. */
	edit2Key: string;
	edit2Value: AttributeValue;
	/** Contains %ID%, filled at run time with the id from the model's step-1 output. */
	instruction2Template: string;
}

export interface ReadingTask extends TaskBase {
	family: "reading";
	tree: BarkupNode;
	question: Question;
}

export type PilotTask =
	| TransformationTask
	| ConstructionTask
	| ReferenceTask
	| ReadingTask;

export interface Corpus {
	version: 1;
	seed: number;
	tasks: PilotTask[];
}

export interface CorpusPlanEntry {
	family: Family;
	buckets: BucketName[];
	/**
	 * Kind cycles (pre-registered): kinds are assigned round-robin per
	 * task index so every edit/question kind is exercised evenly, instead
	 * of left entirely to the seeded draw. A kind inapplicable to its
	 * tree falls back to the seeded order.
	 */
	editKinds?: Edit["kind"][];
	questionKinds?: QuestionKind[];
}

const EDIT_KINDS: Edit["kind"][] = [
	"set-attribute",
	"set-name",
	"remove-node",
	"insert-node",
	"move-node",
];
const QUESTION_KINDS: QuestionKind[] = [
	"count-type-global",
	"count-direct-children",
	"attribute-value",
	"nth-child-type",
	"count-type-under",
];

function repeat(buckets: BucketName[], times: number): BucketName[] {
	const out: BucketName[] = [];
	for (const bucket of buckets) {
		for (let i = 0; i < times; i += 1) out.push(bucket);
	}
	return out;
}

/** Pre-registered pilot distribution: 20 tasks (kept verbatim so corpus/pilot.json stays reproducible). */
export const PILOT_PLAN: CorpusPlanEntry[] = [
	{
		family: "transformation",
		buckets: ["xs", "xs", "s", "s", "m", "m", "l", "l"],
		editKinds: [
			"set-attribute",
			"set-name",
			"remove-node",
			"insert-node",
			"move-node",
			"set-attribute",
			"insert-node",
			"move-node",
		],
	},
	{ family: "construction", buckets: ["xs", "xs", "s", "s"] },
	{ family: "reference", buckets: ["s", "s", "m", "m"] },
	{
		family: "reading",
		buckets: ["xs", "s", "m", "l"],
		questionKinds: [
			"count-type-global",
			"count-direct-children",
			"attribute-value",
			"nth-child-type",
		],
	},
];

/**
 * Pre-registered main-corpus distribution: 200 tasks.
 * transformation 80 (20/bucket, all 5 edit kinds), construction 24
 * (xs/s only — the describer-fidelity limit found in the pilot),
 * reference 40, reading 56 (all 5 question kinds).
 */
export const MAIN_PLAN: CorpusPlanEntry[] = [
	{
		family: "transformation",
		buckets: repeat(["xs", "s", "m", "l"], 20),
		editKinds: EDIT_KINDS,
	},
	{ family: "construction", buckets: repeat(["xs", "s"], 12) },
	{
		family: "reference",
		buckets: [
			...repeat(["xs"], 8),
			...repeat(["s"], 12),
			...repeat(["m"], 12),
			...repeat(["l"], 8),
		],
	},
	{
		family: "reading",
		buckets: repeat(["xs", "s", "m", "l"], 14),
		questionKinds: QUESTION_KINDS,
	},
];

/** Dev split (separate seed; used ONLY for best-effort prompt checks, never scored). */
export const DEV_PLAN: CorpusPlanEntry[] = [
	{
		family: "transformation",
		buckets: ["xs", "xs", "s", "s", "m", "m", "l", "l"],
		editKinds: EDIT_KINDS,
	},
	{ family: "construction", buckets: ["xs", "xs", "s", "s"] },
	{ family: "reference", buckets: ["s", "s", "m", "m"] },
	{
		family: "reading",
		buckets: ["xs", "s", "m", "l"],
		questionKinds: QUESTION_KINDS,
	},
];

const FAMILY_SEED_OFFSET: Record<Family, number> = {
	transformation: 1_000,
	construction: 2_000,
	reference: 3_000,
	reading: 4_000,
};

function formatValue(value: AttributeValue): string {
	if (typeof value === "string") return `"${value}"`;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return JSON.stringify(value);
}

export function generatePilotCorpus(seed: number): Corpus {
	return generateCorpus(PILOT_PLAN, seed);
}

export function generateCorpus(plan: CorpusPlanEntry[], seed: number): Corpus {
	const tasks: PilotTask[] = [];
	for (const { family, buckets, editKinds, questionKinds } of plan) {
		// One tree per task; per-bucket sampling seeds are decorrelated.
		const byBucket = new Map<BucketName, BarkupNode[]>();
		for (const bucket of new Set(buckets)) {
			const need = buckets.filter((b) => b === bucket).length;
			byBucket.set(
				bucket,
				sampleTrees(
					BUCKETS[bucket],
					seed + FAMILY_SEED_OFFSET[family] + bucketOffset(bucket),
					need,
				),
			);
		}
		buckets.forEach((bucket, index) => {
			const pool = byBucket.get(bucket) as BarkupNode[];
			const tree = pool.shift() as BarkupNode;
			const taskSeed =
				seed + FAMILY_SEED_OFFSET[family] + bucketOffset(bucket) + index * 97;
			const id = `${family.slice(0, 5)}-${bucket}-${index + 1}`;
			tasks.push(
				buildTask(family, id, bucket, tree, createRng(taskSeed), index, {
					...(editKinds !== undefined ? { editKinds } : {}),
					...(questionKinds !== undefined ? { questionKinds } : {}),
				}),
			);
		});
	}
	return { version: 1, seed, tasks };
}

function bucketOffset(bucket: BucketName): number {
	return { xs: 10, s: 20, m: 30, l: 40 }[bucket];
}

function buildTask(
	family: Family,
	id: string,
	bucket: BucketName,
	tree: BarkupNode,
	rng: Rng,
	index: number,
	kinds: { editKinds?: Edit["kind"][]; questionKinds?: QuestionKind[] },
): PilotTask {
	switch (family) {
		case "transformation": {
			const cycle = kinds.editKinds;
			const edit = generateEdit(tree, rng, cycle?.[index % cycle.length]);
			return {
				id,
				family,
				bucket,
				tree,
				edit,
				instruction: describeEdit(tree, edit),
				expected: applyEdit(tree, edit),
			};
		}
		case "construction":
			return { id, family, bucket, target: tree, spec: null };
		case "reference":
			return buildReferenceTask(id, bucket, tree, rng);
		case "reading": {
			const cycle = kinds.questionKinds;
			return {
				id,
				family,
				bucket,
				tree,
				question: generateQuestion(tree, rng, cycle?.[index % cycle.length]),
			};
		}
	}
}

/** Attribute used for the step-2 edit, per created-node type. */
const EDIT2_ATTRIBUTE: Record<string, { key: string; value: AttributeValue }> =
	{
		page: { key: "layoutSize", value: "wide" },
		block: { key: "featured", value: true },
		"widget-slot": { key: "requireBleed", value: true },
		"text-atom": { key: "textStyle", value: "caption" },
		"image-atom": { key: "aspectRatio", value: "1:1" },
	};

function buildReferenceTask(
	id: string,
	bucket: BucketName,
	tree: BarkupNode,
	rng: Rng,
): ReferenceTask {
	const containers: BarkupNode[] = [];
	walkTree(tree, ({ node }) => {
		if ((BENCH_CONFIG.nodes[node.type]?.children ?? []).length > 0) {
			containers.push(node);
		}
	});
	const parent = rng.pick(containers);
	const childType = rng.pick(
		BENCH_CONFIG.nodes[parent.type]?.children ?? [],
	) as string;

	const existingNames = new Set<string>();
	walkTree(tree, ({ node }) => {
		if (node.name !== undefined) existingNames.add(node.name);
	});
	let newNodeName = `spotlight-${word(rng)}`;
	while (existingNames.has(newNodeName)) {
		newNodeName = `spotlight-${word(rng)}-${word(rng)}`;
	}

	const node = buildNewNode(rng, childType, { named: true });
	node.name = newNodeName;
	const edit2 = EDIT2_ATTRIBUTE[childType] as {
		key: string;
		value: AttributeValue;
	};
	// The step-2 edit must actually change the node.
	if (
		node.attributes &&
		JSON.stringify(node.attributes[edit2.key]) === JSON.stringify(edit2.value)
	) {
		delete node.attributes[edit2.key];
		if (Object.keys(node.attributes).length === 0) {
			delete node.attributes;
		}
	}

	const index = rng.int(0, (parent.children ?? []).length);
	const edit1: Edit = {
		kind: "insert-node",
		parentId: parent.id as string,
		index,
		node,
	};
	return {
		id,
		family: "reference",
		bucket,
		tree,
		edit1,
		instruction1: describeEdit(tree, edit1),
		expected1: applyEdit(tree, edit1),
		newNodeType: childType,
		newNodeName,
		edit2Key: edit2.key,
		edit2Value: edit2.value,
		instruction2Template: `Set the "${edit2.key}" attribute to ${formatValue(
			edit2.value,
		)} on the node with id "%ID%" (the ${childType} you created in the previous step).`,
	};
}
