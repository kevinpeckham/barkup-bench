/**
 * Study W corpus (docs/BRIEF-W.md): the Study T callback generator at
 * the Study S horizon — 36-step sessions with a FIXED declaration and
 * callback schedule designed to cross the shipped 32-message history
 * window, including a mid-session retraction. Declarables are stored
 * machine-readably on the task so memo-fidelity metrics stay
 * deterministic.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { BENCH_CONFIG } from "../grammar.js";
import { cloneTree, findById, walkTree } from "../tree.js";
import { CODENAMES, RULE_TEXT_STYLE } from "./callbacks.js";
import type { Edit } from "./edits.js";
import {
	applyEdit,
	buildNewNode,
	describeEdit,
	generateEdit,
	nodeRef,
} from "./edits.js";
import { slug } from "./humanize.js";
import type { Rng } from "./rng.js";
import type { SessionStep, SessionTask } from "./sessions.js";
import { placeholdersInEdit, validateSession } from "./sessions.js";
import type { BucketName } from "./trees.js";

export const W_STEPS = 36;

/** Machine-readable declarables for the memo-fidelity metrics. */
export interface WDeclarables {
	/** F1 as first declared (retracted at the retraction step). */
	f1Initial: string;
	/** F1's final value after the retraction — the active fact. */
	f1Final: string;
	/** F2, declared late (stays within the window at its callback). */
	f2: string;
	/** The standing-rule value (textStyle). */
	rule: string;
}

export interface WTask extends SessionTask {
	declarables: WDeclarables;
	/** Steps whose instruction carries a declaration/retraction rider. */
	declaringSteps: number[];
	/** Callback steps (subset of steps with `callback` set). */
	callbackSteps: number[];
}

const KINDS: Edit["kind"][] = [
	"set-attribute",
	"set-name",
	"remove-node",
	"insert-node",
	"move-node",
];

function namesIn(tree: BarkupNode): Set<string> {
	const names = new Set<string>();
	walkTree(tree, ({ node }) => {
		if (node.name !== undefined) names.add(node.name);
	});
	return names;
}

function uniqueName(rng: Rng, taken: Set<string>): string {
	let name = slug(rng);
	while (taken.has(name)) name = slug(rng);
	return name;
}

function pickBlockParent(state: BarkupNode, rng: Rng): BarkupNode {
	const blocks: BarkupNode[] = [];
	walkTree(state, ({ node }) => {
		if ((BENCH_CONFIG.nodes[node.type]?.children ?? []).includes("text-atom")) {
			blocks.push(node);
		}
	});
	if (blocks.length === 0) throw new Error("W corpus: no text-atom parent");
	return rng.pick(blocks);
}

const RULE_DECLARATION = `Standing rule: every new text atom inserted in this session must have its "textStyle" attribute set to "${RULE_TEXT_STYLE}".`;

/** The pre-registered schedule (BRIEF-W.md). */
export const W_SCHEDULE = {
	declareF1: 1,
	declareRule: 3,
	governedWithin: 4,
	retractF1: 6,
	factF1Within: 7,
	/** Scheduled cleanup: renames the step-7 target (the root) back to a
	 * fresh slug so the codename is absent from every pre-step tree when
	 * the post-truncation F1 callback arrives (no-leakage standard). */
	cleanupF1: 12,
	declareF2: 21,
	governedPost1: 24,
	factF2Within: 27,
	factF1Post: 32,
	governedPost2: 34,
} as const;

export function generateWTask(
	tree: BarkupNode,
	rng: Rng,
	id: string,
	bucket: BucketName,
): WTask {
	let state = cloneTree(tree);
	const steps: SessionStep[] = [];
	const takenNames = namesIn(state);

	// Three distinct codenames from the digit-suffixed (tree-disjoint) pool.
	const pool = [...CODENAMES];
	const picked: string[] = [];
	while (picked.length < 3) {
		const c = rng.pick(pool);
		if (!picked.includes(c)) picked.push(c);
	}
	const [x1, x2, y] = picked as [string, string, string];

	const S = W_SCHEDULE;
	const governedSteps = new Set<number>([
		S.governedWithin,
		S.governedPost1,
		S.governedPost2,
	]);
	const factSteps = new Map<number, { codename: string; label: string }>([
		[S.factF1Within, { codename: x2, label: "campaign" }],
		[S.factF2Within, { codename: y, label: "sponsor" }],
		[S.factF1Post, { codename: x2, label: "campaign" }],
	]);

	for (let index = 1; index <= W_STEPS; index += 1) {
		const kind = KINDS[(index - 1) % KINDS.length] as Edit["kind"];
		let edit: Edit;
		let instruction: string;
		let callback: SessionStep["callback"];
		let declares: string | undefined;
		let created: SessionStep["created"];

		if (governedSteps.has(index)) {
			if (kind !== "insert-node") throw new Error(`W schedule: step ${index}`);
			const parent = pickBlockParent(state, rng);
			const name = uniqueName(rng, takenNames);
			takenNames.add(name);
			const bare = buildNewNode(rng, "text-atom", { named: true });
			bare.name = name;
			const attrs: Record<string, AttributeValue> = {
				...(bare.attributes ?? {}),
			};
			delete attrs.textStyle;
			const instructionNode: BarkupNode = { ...bare, attributes: attrs };
			const expectedNode: BarkupNode = {
				...bare,
				attributes: { ...attrs, textStyle: RULE_TEXT_STYLE },
			};
			const insertIndex = rng.int(0, (parent.children ?? []).length);
			edit = {
				kind: "insert-node",
				parentId: parent.id as string,
				index: insertIndex,
				node: expectedNode,
			};
			instruction = describeEdit(state, {
				kind: "insert-node",
				parentId: parent.id as string,
				index: insertIndex,
				node: instructionNode,
			});
			callback = "rule";
			created = { placeholder: `sess-new-${index}`, type: "text-atom", name };
		} else if (factSteps.has(index)) {
			if (kind !== "set-name") throw new Error(`W schedule: step ${index}`);
			const use = factSteps.get(index) as { codename: string; label: string };
			// Step 7 targets the ROOT (immovable, unremovable) so the
			// scheduled cleanup at step 12 can reliably rename it back.
			let targetId: string;
			if (index === S.factF1Within) {
				targetId = state.id as string;
			} else {
				const nodes: BarkupNode[] = [];
				walkTree(state, ({ node }) => {
					if (node.id !== undefined) nodes.push(node);
				});
				targetId = rng.pick(nodes).id as string;
			}
			edit = { kind: "set-name", nodeId: targetId, name: use.codename };
			instruction = `Rename ${nodeRef(state, targetId)}: set its name to the ${use.label} codename.`;
			callback = "fact";
			takenNames.add(use.codename);
		} else if (index === S.cleanupF1) {
			if (kind !== "set-name") throw new Error(`W schedule: step ${index}`);
			const fresh = uniqueName(rng, takenNames);
			takenNames.add(fresh);
			edit = { kind: "set-name", nodeId: state.id as string, name: fresh };
			instruction = describeEdit(state, edit);
		} else {
			edit = generateEdit(state, rng, kind);
			if (edit.kind === "insert-node") {
				const name = uniqueName(rng, takenNames);
				takenNames.add(name);
				edit = { ...edit, node: { ...cloneTree(edit.node), name } };
				created = {
					placeholder: `sess-new-${index}`,
					type: edit.node.type,
					name,
				};
			}
			if (edit.kind === "set-name") takenNames.add(edit.name);
			instruction = describeEdit(state, edit);
			if (index === S.declareF1) {
				instruction += ` For later reference: the campaign codename is "${x1}".`;
				declares = `The campaign codename is "${x1}".`;
			} else if (index === S.declareRule) {
				instruction += ` ${RULE_DECLARATION}`;
				declares = RULE_DECLARATION;
			} else if (index === S.retractF1) {
				instruction += ` Correction: the campaign codename is now "${x2}", not "${x1}".`;
				declares = `Correction: the campaign codename is now "${x2}" (replaces "${x1}").`;
			} else if (index === S.declareF2) {
				instruction += ` For later reference: the sponsor codename is "${y}".`;
				declares = `The sponsor codename is "${y}".`;
			}
		}

		state = applyEdit(state, edit);
		if (edit.kind === "insert-node" && created) {
			const parent = findById(state, edit.parentId) as BarkupNode;
			const inserted = (parent.children ?? [])[edit.index] as BarkupNode;
			inserted.id = created.placeholder;
		}
		steps.push({
			index,
			kind,
			edit,
			instruction,
			...(created !== undefined ? { created } : {}),
			referenceBack: false,
			...(callback !== undefined ? { callback } : {}),
			...(declares !== undefined ? { declares } : {}),
		});
	}

	return {
		id,
		family: "session",
		bucket,
		tree,
		steps,
		expectedFinal: state,
		declarables: { f1Initial: x1, f1Final: x2, f2: y, rule: RULE_TEXT_STYLE },
		declaringSteps: [S.declareF1, S.declareRule, S.retractF1, S.declareF2],
		callbackSteps: [...governedSteps, ...factSteps.keys()].sort(
			(a, b) => a - b,
		),
	};
}

/** BRIEF-W validation: Study T's checks at the W schedule. */
export function validateWTask(task: WTask): string[] {
	const problems: string[] = [...validateSession(task)];
	const { f1Final, f2 } = task.declarables;

	if (task.steps.length !== W_STEPS) problems.push("wrong step count");
	const cb = task.steps.filter((s) => s.callback);
	if (cb.filter((s) => s.callback === "fact").length !== 3) {
		problems.push("expected 3 fact callbacks");
	}
	if (cb.filter((s) => s.callback === "rule").length !== 3) {
		problems.push("expected 3 rule callbacks");
	}

	let state = cloneTree(task.tree);
	for (const step of task.steps) {
		if (step.callback === "fact" && step.edit.kind === "set-name") {
			const codename = step.edit.name;
			const expected = step.index === W_SCHEDULE.factF2Within ? f2 : f1Final;
			if (codename !== expected) {
				problems.push(`step ${step.index}: expected codename ${expected}`);
			}
			if (step.instruction.includes(codename)) {
				problems.push(`step ${step.index}: instruction leaks codename`);
			}
			let leaked = false;
			walkTree(state, ({ node }) => {
				if (node.name === codename) leaked = true;
				if (JSON.stringify(node.attributes ?? {}).includes(codename)) {
					leaked = true;
				}
			});
			if (leaked) problems.push(`step ${step.index}: codename derivable`);
		}
		if (step.callback === "rule" && step.edit.kind === "insert-node") {
			if (
				step.instruction.includes("textStyle") ||
				step.instruction.includes(task.declarables.rule)
			) {
				problems.push(`step ${step.index}: instruction leaks rule`);
			}
			if (step.edit.node.attributes?.textStyle !== task.declarables.rule) {
				problems.push(`step ${step.index}: expected node missing rule attr`);
			}
		}
		for (const placeholder of placeholdersInEdit(step.edit)) {
			if (!findById(state, placeholder)) {
				problems.push(`step ${step.index}: dangling ${placeholder}`);
			}
		}
		state = applyEdit(state, step.edit);
		if (step.created && step.edit.kind === "insert-node") {
			const parent = findById(state, step.edit.parentId);
			const inserted = (parent?.children ?? [])[step.edit.index];
			if (inserted) inserted.id = step.created.placeholder;
		}
	}
	return problems;
}
