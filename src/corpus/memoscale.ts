/**
 * Study AH memo-saturation corpus (docs/BRIEF-AH.md): the shipped
 * session-notes memo measured at scale. Three constructions:
 *
 * - recall: a memo of N notes; the instruction references one fact
 *   note's content without stating it (T's callback style). The
 *   needed note sits at a registered position within its kind list.
 * - rule: the needed note is a block-scoped standing rule ("every
 *   new text atom inserted inside the block named B gets textStyle
 *   <needle>") that exactly one governed insert must apply
 *   unprompted (W's governed-step construction, block-scoped so
 *   twenty rules can coexist without overlap).
 * - integrity: a memo of K notes plus one new declaration; the
 *   agent must full-replace via update_session_notes without losing
 *   a note. K=20 is the shipped cap edge, where the update cannot
 *   fit.
 *
 * Every note carries a unique needle token; validators assert
 * needles are absent from trees and instructions, rule coverage is
 * exactly one, and the rendered shipped block carries what it must.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import type { SessionNote } from "../shipped/session-notes.js";
import { formatSessionNotesBlockV2 } from "../shipped/session-notes.js";
import { findById, walkTree } from "../tree.js";
import type { Edit } from "./edits.js";
import { applyEdit, buildNewNode, describeEdit, nodeRef } from "./edits.js";
import type { Rng } from "./rng.js";
import type { BucketName } from "./trees.js";

export type MemoTaskKind = "recall" | "rule";
export type NotePosition = "first" | "middle" | "last";

export interface MemoScaleTask {
	id: string;
	family: "transformation";
	bucket: BucketName;
	kind: MemoTaskKind;
	nLevel: 5 | 20;
	position: NotePosition;
	tree: BarkupNode;
	notes: SessionNote[];
	/** Index of the needed note in `notes`. */
	neededIndex: number;
	neededNeedle: string;
	/** All other notes' needles (the contamination scan set). */
	otherNeedles: string[];
	instruction: string;
	focusIds: string[];
	expected: BarkupNode;
}

export interface IntegrityTask {
	id: string;
	family: "transformation";
	bucket: BucketName;
	kLevel: 10 | 19 | 20;
	tree: BarkupNode;
	notes: SessionNote[];
	oldNeedles: string[];
	newNote: SessionNote;
	newNeedle: string;
	/** The user turn: declaration + a self-contained edit request. */
	message: string;
	focusIds: string[];
	expected: BarkupNode;
}

/** Registered vocabulary for needles and fact labels. */
const WORDS = [
	"amber",
	"basalt",
	"cedar",
	"damson",
	"ember",
	"fjord",
	"garnet",
	"heron",
	"indigo",
	"juniper",
	"kestrel",
	"larch",
	"meadow",
	"nickel",
	"onyx",
	"poplar",
	"quartz",
	"rowan",
	"saffron",
	"topaz",
	"umber",
	"violet",
	"walnut",
	"yarrow",
	"zephyr",
	"cobalt",
	"dune",
	"flint",
];
const FACT_LABELS = [
	"launch",
	"sprint",
	"beta",
	"archive",
	"migration",
	"rollout",
	"staging",
	"pilot",
	"backup",
	"review",
	"handoff",
	"audit",
	"redesign",
	"retainer",
	"workshop",
	"onboarding",
	"offsite",
	"quarterly",
	"holiday",
	"anniversary",
];
const GOAL_SECTIONS = [
	"pricing",
	"careers",
	"landing",
	"support",
	"newsroom",
	"gallery",
];

function makeNeedle(rng: Rng, taken: Set<string>): string {
	for (let i = 0; i < 200; i += 1) {
		const needle = `${rng.pick(WORDS)}-${rng.pick(WORDS)}-${rng.int(10, 99)}`;
		if (!taken.has(needle)) {
			taken.add(needle);
			return needle;
		}
	}
	throw new Error("needle space exhausted");
}

function idNodes(tree: BarkupNode): BarkupNode[] {
	const out: BarkupNode[] = [];
	walkTree(tree, ({ node }) => {
		if (node.id !== undefined) out.push(node);
	});
	return out;
}

/** Named blocks whose name is unique tree-wide and that contain no
 * other uniquely-named block (so block-scoped rules cannot nest). */
function ruleSafeBlocks(tree: BarkupNode): BarkupNode[] {
	const blocks = idNodes(tree).filter(
		(n) => n.type === "block" && typeof n.name === "string",
	);
	const nameCounts = new Map<string, number>();
	for (const b of blocks) {
		nameCounts.set(
			b.name as string,
			(nameCounts.get(b.name as string) ?? 0) + 1,
		);
	}
	const unique = blocks.filter((b) => nameCounts.get(b.name as string) === 1);
	const uniqueSet = new Set(unique);
	const safe: BarkupNode[] = [];
	for (const block of unique) {
		let containsOther = false;
		walkTree(block, ({ node }) => {
			if (node !== block && uniqueSet.has(node)) containsOther = true;
		});
		if (!containsOther) safe.push(block);
	}
	return safe;
}

export interface Composition {
	facts: number;
	rules: number;
	goals: number;
}

/** Registered compositions (BRIEF-AH.md). */
export function composition(
	kind: MemoTaskKind | "integrity",
	level: number,
): Composition {
	if (kind === "recall") {
		return level === 5
			? { facts: 3, rules: 1, goals: 1 }
			: { facts: 12, rules: 5, goals: 3 };
	}
	if (kind === "rule") {
		return level === 5
			? { facts: 1, rules: 3, goals: 1 }
			: { facts: 5, rules: 12, goals: 3 };
	}
	// integrity
	if (level === 10) return { facts: 6, rules: 2, goals: 2 };
	if (level === 19) return { facts: 11, rules: 5, goals: 3 };
	return { facts: 12, rules: 5, goals: 3 };
}

function positionIndex(position: NotePosition, length: number): number {
	if (position === "first") return 0;
	if (position === "last") return length - 1;
	return Math.floor(length / 2);
}

interface NotesBuild {
	notes: SessionNote[];
	factLabels: string[];
	factNeedles: string[];
	ruleBlocks: BarkupNode[];
	ruleNeedles: string[];
	allNeedles: string[];
}

/** Build a notes list against a tree; rules are block-scoped. */
function buildNotes(
	tree: BarkupNode,
	rng: Rng,
	comp: Composition,
	taken: Set<string>,
): NotesBuild | null {
	const safeBlocks = ruleSafeBlocks(tree);
	if (safeBlocks.length < comp.rules) return null;
	const labels = [...FACT_LABELS];
	const factLabels: string[] = [];
	const factNeedles: string[] = [];
	const facts: SessionNote[] = [];
	for (let i = 0; i < comp.facts; i += 1) {
		const label = labels.splice(rng.int(0, labels.length - 1), 1)[0] as string;
		const needle = makeNeedle(rng, taken);
		factLabels.push(label);
		factNeedles.push(needle);
		facts.push({
			kind: "fact",
			text: `The ${label} codename is "${needle}".`,
		});
	}
	const blockPool = [...safeBlocks];
	const ruleBlocks: BarkupNode[] = [];
	const ruleNeedles: string[] = [];
	const rules: SessionNote[] = [];
	for (let i = 0; i < comp.rules; i += 1) {
		const block = blockPool.splice(
			rng.int(0, blockPool.length - 1),
			1,
		)[0] as BarkupNode;
		const needle = makeNeedle(rng, taken);
		ruleBlocks.push(block);
		ruleNeedles.push(needle);
		rules.push({
			kind: "rule",
			text: `Every new text atom inserted inside the block named "${block.name}" must have its "textStyle" attribute set to "${needle}".`,
		});
	}
	const goals: SessionNote[] = [];
	const goalNeedles: string[] = [];
	for (let i = 0; i < comp.goals; i += 1) {
		const needle = makeNeedle(rng, taken);
		goalNeedles.push(needle);
		goals.push({
			kind: "goal",
			text: `Keep the ${GOAL_SECTIONS[i % GOAL_SECTIONS.length]} copy anchored on the phrase "${needle}".`,
		});
	}
	return {
		notes: [...facts, ...rules, ...goals],
		factLabels,
		factNeedles,
		ruleBlocks,
		ruleNeedles,
		allNeedles: [...factNeedles, ...ruleNeedles, ...goalNeedles],
	};
}

export function tryRecallTask(
	tree: BarkupNode,
	rng: Rng,
	nLevel: 5 | 20,
	position: NotePosition,
): MemoScaleTask | null {
	const taken = new Set<string>();
	const build = buildNotes(tree, rng, composition("recall", nLevel), taken);
	if (!build) return null;
	const neededFact = positionIndex(position, build.factNeedles.length);
	const needle = build.factNeedles[neededFact] as string;
	const label = build.factLabels[neededFact] as string;
	const targets = idNodes(tree).filter(
		(n) => n.type === "text-atom" && typeof n.attributes?.content === "string",
	);
	if (targets.length === 0) return null;
	const target = rng.pick(targets);
	const edit: Edit = {
		kind: "set-attribute",
		nodeId: target.id as string,
		key: "content",
		value: needle,
	};
	return {
		id: "",
		family: "transformation",
		bucket: "xl",
		kind: "recall",
		nLevel,
		position,
		tree,
		notes: build.notes,
		neededIndex: neededFact,
		neededNeedle: needle,
		otherNeedles: build.allNeedles.filter((n) => n !== needle),
		instruction: `Set the "content" attribute of ${nodeRef(tree, target.id as string)} to exactly the ${label} codename declared in the session notes.`,
		focusIds: [target.id as string],
		expected: applyEdit(tree, edit),
	};
}

export function tryRuleTask(
	tree: BarkupNode,
	rng: Rng,
	nLevel: 5 | 20,
	position: NotePosition,
): MemoScaleTask | null {
	const taken = new Set<string>();
	const build = buildNotes(tree, rng, composition("rule", nLevel), taken);
	if (!build) return null;
	const neededRule = positionIndex(position, build.ruleNeedles.length);
	const needle = build.ruleNeedles[neededRule] as string;
	const block = build.ruleBlocks[neededRule] as BarkupNode;

	const bare = buildNewNode(rng, "text-atom", { named: true });
	const attrs: Record<string, AttributeValue> = { ...(bare.attributes ?? {}) };
	delete attrs.textStyle;
	const instructionNode: BarkupNode = { ...bare, attributes: attrs };
	const expectedNode: BarkupNode = {
		...bare,
		attributes: { ...attrs, textStyle: needle },
	};
	const insertIndex = rng.int(0, (block.children ?? []).length);
	const edit: Edit = {
		kind: "insert-node",
		parentId: block.id as string,
		index: insertIndex,
		node: expectedNode,
	};
	const factIndexOfRule = composition("rule", nLevel).facts;
	return {
		id: "",
		family: "transformation",
		bucket: "xl",
		kind: "rule",
		nLevel,
		position,
		tree,
		notes: build.notes,
		neededIndex: factIndexOfRule + neededRule,
		neededNeedle: needle,
		otherNeedles: build.allNeedles.filter((n) => n !== needle),
		instruction: describeEdit(tree, {
			kind: "insert-node",
			parentId: block.id as string,
			index: insertIndex,
			node: instructionNode,
		}),
		focusIds: [block.id as string],
		expected: applyEdit(tree, edit),
	};
}

export function tryIntegrityTask(
	tree: BarkupNode,
	rng: Rng,
	kLevel: 10 | 19 | 20,
): IntegrityTask | null {
	const taken = new Set<string>();
	const build = buildNotes(tree, rng, composition("integrity", kLevel), taken);
	if (!build) return null;
	const labels = FACT_LABELS.filter((l) => !build.factLabels.includes(l));
	const label = rng.pick(labels);
	const newNeedle = makeNeedle(rng, taken);
	const newNote: SessionNote = {
		kind: "fact",
		text: `The ${label} codename is "${newNeedle}".`,
	};
	const targets = idNodes(tree).filter(
		(n) => n.type === "text-atom" && typeof n.attributes?.content === "string",
	);
	if (targets.length === 0) return null;
	const target = rng.pick(targets);
	const editValue = `Updated ${rng.pick(WORDS)} copy`;
	const edit: Edit = {
		kind: "set-attribute",
		nodeId: target.id as string,
		key: "content",
		value: editValue,
	};
	return {
		id: "",
		family: "transformation",
		bucket: "xl",
		kLevel,
		tree,
		notes: build.notes,
		oldNeedles: build.allNeedles,
		newNote,
		newNeedle,
		message: `Please remember for the rest of this session: the ${label} codename is "${newNeedle}". Also, set the "content" attribute of ${nodeRef(tree, target.id as string)} to exactly "${editValue}".`,
		focusIds: [target.id as string],
		expected: applyEdit(tree, edit),
	};
}

function serializeForScan(tree: BarkupNode): string {
	return JSON.stringify(tree);
}

export function validateMemoScaleTask(task: MemoScaleTask): string[] {
	const problems: string[] = [];
	const comp = composition(task.kind, task.nLevel);
	if (task.notes.length !== comp.facts + comp.rules + comp.goals) {
		problems.push("composition mismatch");
	}
	if (task.notes.length !== (task.nLevel === 5 ? 5 : 20)) {
		problems.push("note count != nLevel");
	}
	const block = formatSessionNotesBlockV2(task.notes);
	if (!block.includes(task.neededNeedle)) {
		problems.push("needed needle missing from rendered block");
	}
	if (task.notes[task.neededIndex]?.text.includes(task.neededNeedle) !== true) {
		problems.push("neededIndex does not carry the needle");
	}
	const treeText = serializeForScan(task.tree);
	for (const needle of [task.neededNeedle, ...task.otherNeedles]) {
		if (treeText.includes(needle)) problems.push(`needle ${needle} in tree`);
	}
	if (task.instruction.includes(task.neededNeedle)) {
		problems.push("instruction leaks the needle");
	}
	const expectedText = serializeForScan(task.expected);
	if (!expectedText.includes(task.neededNeedle)) {
		problems.push("expected tree missing the needle");
	}
	for (const other of task.otherNeedles) {
		if (expectedText.includes(other)) {
			problems.push(`expected tree contains foreign needle ${other}`);
		}
	}
	if (task.kind === "rule") {
		// Exactly one rule note names the insert parent's block.
		const parent = findById(task.tree, task.focusIds[0] as string);
		if (!parent || typeof parent.name !== "string") {
			problems.push("rule task parent block missing");
		} else {
			const covering = task.notes.filter(
				(n) =>
					n.kind === "rule" &&
					n.text.includes(`the block named "${parent.name}"`),
			);
			if (covering.length !== 1) {
				problems.push(`${covering.length} rules cover the insert block`);
			}
			if (!covering[0]?.text.includes(task.neededNeedle)) {
				problems.push("covering rule is not the needed note");
			}
		}
		if (task.instruction.includes("textStyle")) {
			problems.push("rule-task instruction leaks textStyle");
		}
	}
	return problems;
}

export function validateIntegrityTask(task: IntegrityTask): string[] {
	const problems: string[] = [];
	if (task.notes.length !== task.kLevel) problems.push("note count != kLevel");
	if (task.oldNeedles.length !== task.kLevel) {
		problems.push("oldNeedles count != kLevel");
	}
	const unique = new Set([...task.oldNeedles, task.newNeedle]);
	if (unique.size !== task.kLevel + 1) problems.push("needle collision");
	if (!task.newNote.text.includes(task.newNeedle)) {
		problems.push("new note missing its needle");
	}
	if (!task.message.includes(task.newNeedle)) {
		problems.push("message missing the declaration");
	}
	const treeText = serializeForScan(task.tree);
	for (const needle of unique) {
		if (treeText.includes(needle)) problems.push(`needle ${needle} in tree`);
	}
	return problems;
}
