/**
 * Study T callback-session corpus (docs/BRIEF-T.md): 12-step sessions
 * where four steps depend on facts or standing rules declared only in
 * earlier instructions — never in the tree. Two kinds:
 *
 * - fact: a codename declared as a rider on an earlier step's
 *   instruction; a later set-name step requires it ("set its name to
 *   the campaign codename"). Codenames carry a digit suffix, which the
 *   humanizer can never generate, so the value is structurally absent
 *   from every tree; validation asserts it anyway.
 * - rule: a standing rule declared as a rider ("every new text atom
 *   gets textStyle X"); later insert steps must apply it although
 *   their own instructions never mention it. The rule value is
 *   disjoint from the humanizer's textStyle pool.
 *
 * The declaring step itself is an ordinary self-contained edit; the
 * rider adds no edit. Everything else mirrors the Study K generator.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { BENCH_CONFIG } from "../grammar.js";
import { cloneTree, findById, walkTree } from "../tree.js";
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

/** Pre-registered codename pool — digit suffixes are impossible in
 * humanizer output (word-word slugs), so values are tree-disjoint. */
export const CODENAMES = [
	"vesper-7",
	"citadel-3",
	"falcon-9",
	"meridian-5",
	"obsidian-2",
	"paladin-8",
	"quasar-4",
	"tempest-6",
] as const;

/** Pre-registered standing-rule value — not in the humanizer's
 * textStyle pool (heading/subheading/body/caption/quote). */
export const RULE_TEXT_STYLE = "small-caps";

export const CALLBACK_STEPS = 12;

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

/** A block node that can hold a text-atom (governed-insert parent). */
function pickBlockParent(state: BarkupNode, rng: Rng): BarkupNode {
	const blocks: BarkupNode[] = [];
	walkTree(state, ({ node }) => {
		if ((BENCH_CONFIG.nodes[node.type]?.children ?? []).includes("text-atom")) {
			blocks.push(node);
		}
	});
	if (blocks.length === 0) {
		throw new Error("callback corpus: tree has no text-atom parent");
	}
	return rng.pick(blocks);
}

/**
 * Generate one callback session. Fixed schedule (kinds follow the
 * Study K cycle, so callback steps land where their kinds do):
 *
 *   step 1  set-attribute + declares campaign codename
 *   step 3  remove-node   + declares the textStyle standing rule
 *   step 4  insert-node   — governed by the rule (callback: rule)
 *   step 6  set-attribute + declares sponsor codename
 *   step 7  set-name      — uses campaign codename (callback: fact)
 *   step 9  insert-node   — governed by the rule (callback: rule)
 *   step 12 set-name      — uses sponsor codename (callback: fact)
 *
 * All other steps are ordinary self-contained edits.
 */
export function generateCallbackSession(
	tree: BarkupNode,
	rng: Rng,
	id: string,
	bucket: BucketName,
): SessionTask {
	let state = cloneTree(tree);
	const steps: SessionStep[] = [];
	const takenNames = namesIn(state);
	const [campaign, sponsor] = (() => {
		const first = rng.pick([...CODENAMES]);
		let second = rng.pick([...CODENAMES]);
		while (second === first) second = rng.pick([...CODENAMES]);
		return [first, second];
	})();

	const RULE_DECLARATION = `Standing rule: every new text atom inserted in this session must have its "textStyle" attribute set to "${RULE_TEXT_STYLE}".`;

	for (let index = 1; index <= CALLBACK_STEPS; index += 1) {
		const kind = KINDS[(index - 1) % KINDS.length] as Edit["kind"];
		let edit: Edit;
		let instruction: string;
		let callback: SessionStep["callback"];
		let declares: string | undefined;
		let created: SessionStep["created"];

		if (index === 4 || index === 9) {
			// Governed insert: expected node carries the rule attribute;
			// the instruction is written from a copy WITHOUT it.
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
		} else if (index === 7 || index === 12) {
			// Fact use: rename to a codename the instruction never states.
			const nodes: BarkupNode[] = [];
			walkTree(state, ({ node }) => {
				if (node.id !== undefined) nodes.push(node);
			});
			const target = rng.pick(nodes);
			const codename = index === 7 ? campaign : sponsor;
			const label = index === 7 ? "campaign" : "sponsor";
			edit = {
				kind: "set-name",
				nodeId: target.id as string,
				name: codename,
			};
			instruction = `Rename ${nodeRef(state, target.id as string)}: set its name to the ${label} codename.`;
			callback = "fact";
			takenNames.add(codename);
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
			if (index === 1) {
				instruction += ` For later reference: the campaign codename is "${campaign}".`;
				declares = `The campaign codename is "${campaign}".`;
			} else if (index === 3) {
				instruction += ` ${RULE_DECLARATION}`;
				declares = RULE_DECLARATION;
			} else if (index === 6) {
				instruction += ` For later reference: the sponsor codename is "${sponsor}".`;
				declares = `The sponsor codename is "${sponsor}".`;
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

	return { id, family: "session", bucket, tree, steps, expectedFinal: state };
}

/**
 * Study T corpus validation: the Study K chain checks plus the
 * no-leakage guarantees the brief pre-registers.
 */
export function validateCallbackSession(task: SessionTask): string[] {
	const problems = validateSession(task);

	const facts = task.steps.filter((s) => s.callback === "fact");
	const rules = task.steps.filter((s) => s.callback === "rule");
	if (facts.length !== 2) problems.push(`${task.id}: expected 2 fact steps`);
	if (rules.length !== 2) problems.push(`${task.id}: expected 2 rule steps`);
	if (task.steps.filter((s) => s.declares).length !== 3) {
		problems.push(`${task.id}: expected 3 declaring steps`);
	}

	// Replay the chain to inspect each pre-step state.
	let state = cloneTree(task.tree);
	for (const step of task.steps) {
		if (step.callback === "fact" && step.edit.kind === "set-name") {
			const codename = step.edit.name;
			if (step.instruction.includes(codename)) {
				problems.push(
					`${task.id} step ${step.index}: instruction leaks codename`,
				);
			}
			let leaked = false;
			walkTree(state, ({ node }) => {
				if (node.name === codename) leaked = true;
				if (JSON.stringify(node.attributes ?? {}).includes(codename)) {
					leaked = true;
				}
			});
			if (leaked) {
				problems.push(
					`${task.id} step ${step.index}: codename derivable from pre-step tree`,
				);
			}
		}
		if (step.callback === "rule" && step.edit.kind === "insert-node") {
			if (
				step.instruction.includes("textStyle") ||
				step.instruction.includes(RULE_TEXT_STYLE)
			) {
				problems.push(`${task.id} step ${step.index}: instruction leaks rule`);
			}
			if (step.edit.node.attributes?.textStyle !== RULE_TEXT_STYLE) {
				problems.push(
					`${task.id} step ${step.index}: expected node missing rule attribute`,
				);
			}
		}
		for (const placeholder of placeholdersInEdit(step.edit)) {
			if (!findById(state, placeholder)) {
				problems.push(`${task.id} step ${step.index}: dangling ${placeholder}`);
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
