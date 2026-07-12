/**
 * Study Y twin corpus (docs/BRIEF-Y.md): 12-step callback sessions
 * generated once, then dressed with declaration riders in TWO
 * registered phrasing styles — formulaic (the T/W control) and
 * casual — plus identical chatter riders in both. The twins share
 * the session id, tree, edits, and schedule; only declaring steps'
 * instruction text differs, so phrasing is the isolated variable.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { BENCH_CONFIG } from "../grammar.js";
import { cloneTree, findById, walkTree } from "../tree.js";
import { CODENAMES, RULE_TEXT_STYLE } from "./callbacks.js";
import type { WDeclarables, WTask } from "./callbacks-w.js";
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
import type { SessionStep } from "./sessions.js";
import { placeholdersInEdit, validateSession } from "./sessions.js";
import type { BucketName } from "./trees.js";

export type PhrasingStyle = "formulaic" | "casual";

export interface YPair {
	formulaic: WTask;
	casual: WTask;
}

export const Y_STEPS = 12;

/** Pre-registered schedule (BRIEF-Y.md). */
export const Y_SCHEDULE = {
	declareF1: 1,
	declareRule: 3,
	governed1: 4,
	retractF1: 5,
	declareF2: 6,
	factF1: 7,
	governed2: 9,
	factF2: 12,
	chatter: [2, 8, 10, 11],
} as const;

/** Registered casual pools (BRIEF-Y.md, verbatim). */
export const CASUAL_POOLS = {
	campaign: [
		`Oh, before I forget: we're going with "{X1}" as the campaign codename from here on.`,
		`Quick note, the campaign is codenamed "{X1}" now.`,
		`By the way, let's call the campaign "{X1}" going forward.`,
	],
	rule: [
		`Oh and going forward, any new text atom you add should use textStyle "${RULE_TEXT_STYLE}", please.`,
		`House style note: new text atoms get textStyle "${RULE_TEXT_STYLE}" from here on.`,
		`One more thing, whenever you insert a text atom, set its textStyle to "${RULE_TEXT_STYLE}".`,
	],
	retraction: [
		`Actually, scratch the old codename: the campaign is "{X2}" now, not "{X1}".`,
		`Small correction, we renamed the campaign to "{X2}" (forget "{X1}").`,
		`Change of plans: campaign codename is "{X2}" from now on, "{X1}" is dead.`,
	],
	sponsor: [
		`Also jotting this down: the sponsor codename is "{Y}".`,
		`FYI the sponsor's going by "{Y}".`,
		`We're calling the sponsor "{Y}" now, just so you know.`,
	],
} as const;

/** Registered chatter pool (both variants; BRIEF-Y.md, verbatim). */
export const CHATTER_POOL = [
	"This page is really coming together, by the way.",
	"We are showing this to the wider team on Friday.",
	"I like where the layout is heading.",
	"Busy week over here, thanks for the quick turnaround.",
	"The client saw a screenshot and seemed happy.",
	"Almost lunch time on my end, let's keep rolling.",
] as const;

const RULE_DECLARATION = `Standing rule: every new text atom inserted in this session must have its "textStyle" attribute set to "${RULE_TEXT_STYLE}".`;

function formulaicRider(
	kind: keyof typeof CASUAL_POOLS,
	d: WDeclarables,
): string {
	switch (kind) {
		case "campaign":
			return `For later reference: the campaign codename is "${d.f1Initial}".`;
		case "rule":
			return RULE_DECLARATION;
		case "retraction":
			return `Correction: the campaign codename is now "${d.f1Final}", not "${d.f1Initial}".`;
		case "sponsor":
			return `For later reference: the sponsor codename is "${d.f2}".`;
	}
}

function casualRider(
	kind: keyof typeof CASUAL_POOLS,
	d: WDeclarables,
	rng: Rng,
): string {
	const template = rng.pick([...CASUAL_POOLS[kind]]);
	return template
		.replaceAll("{X1}", d.f1Initial)
		.replaceAll("{X2}", d.f1Final)
		.replaceAll("{Y}", d.f2);
}

/** The recorded note an application would keep — used only for the
 * declares field the memo-fidelity metrics read. Same in both twins. */
function declaresText(
	kind: keyof typeof CASUAL_POOLS,
	d: WDeclarables,
): string {
	switch (kind) {
		case "campaign":
			return `The campaign codename is "${d.f1Initial}".`;
		case "rule":
			return RULE_DECLARATION;
		case "retraction":
			return `Correction: the campaign codename is now "${d.f1Final}" (replaces "${d.f1Initial}").`;
		case "sponsor":
			return `The sponsor codename is "${d.f2}".`;
	}
}

const RIDER_KIND: Record<number, keyof typeof CASUAL_POOLS> = {
	[Y_SCHEDULE.declareF1]: "campaign",
	[Y_SCHEDULE.declareRule]: "rule",
	[Y_SCHEDULE.retractF1]: "retraction",
	[Y_SCHEDULE.declareF2]: "sponsor",
};

function pickBlockParent(state: BarkupNode, rng: Rng): BarkupNode {
	const blocks: BarkupNode[] = [];
	walkTree(state, ({ node }) => {
		if ((BENCH_CONFIG.nodes[node.type]?.children ?? []).includes("text-atom")) {
			blocks.push(node);
		}
	});
	if (blocks.length === 0) throw new Error("Y corpus: no text-atom parent");
	return rng.pick(blocks);
}

const KINDS: Edit["kind"][] = [
	"set-attribute",
	"set-name",
	"remove-node",
	"insert-node",
	"move-node",
];

/** Generate the twin pair: one base session, two rider dressings. */
export function generateYPair(
	tree: BarkupNode,
	rng: Rng,
	riderRng: Rng,
	id: string,
	bucket: BucketName,
): YPair {
	let state = cloneTree(tree);
	const baseSteps: SessionStep[] = [];
	const takenNames = new Set<string>();
	walkTree(state, ({ node }) => {
		if (node.name !== undefined) takenNames.add(node.name);
	});

	const pool = [...CODENAMES];
	const picked: string[] = [];
	while (picked.length < 3) {
		const c = rng.pick(pool);
		if (!picked.includes(c)) picked.push(c);
	}
	const [x1, x2, y] = picked as [string, string, string];
	const declarables: WDeclarables = {
		f1Initial: x1,
		f1Final: x2,
		f2: y,
		rule: RULE_TEXT_STYLE,
	};

	const S = Y_SCHEDULE;
	const governed = new Set<number>([S.governed1, S.governed2]);
	const factSteps = new Map<number, { codename: string; label: string }>([
		[S.factF1, { codename: x2, label: "campaign" }],
		[S.factF2, { codename: y, label: "sponsor" }],
	]);

	for (let index = 1; index <= Y_STEPS; index += 1) {
		const kind = KINDS[(index - 1) % KINDS.length] as Edit["kind"];
		let edit: Edit;
		let instruction: string;
		let callback: SessionStep["callback"];
		let created: SessionStep["created"];

		if (governed.has(index)) {
			if (kind !== "insert-node") throw new Error(`Y schedule: step ${index}`);
			const parent = pickBlockParent(state, rng);
			let name = slug(rng);
			while (takenNames.has(name)) name = slug(rng);
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
			if (kind !== "set-name") throw new Error(`Y schedule: step ${index}`);
			const use = factSteps.get(index) as { codename: string; label: string };
			const nodes: BarkupNode[] = [];
			walkTree(state, ({ node }) => {
				if (node.id !== undefined) nodes.push(node);
			});
			const target = rng.pick(nodes);
			edit = {
				kind: "set-name",
				nodeId: target.id as string,
				name: use.codename,
			};
			instruction = `Rename ${nodeRef(state, target.id as string)}: set its name to the ${use.label} codename.`;
			callback = "fact";
			takenNames.add(use.codename);
		} else {
			edit = generateEdit(state, rng, kind);
			if (edit.kind === "insert-node") {
				let name = slug(rng);
				while (takenNames.has(name)) name = slug(rng);
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
		}

		state = applyEdit(state, edit);
		if (edit.kind === "insert-node" && created) {
			const parent = findById(state, edit.parentId) as BarkupNode;
			const inserted = (parent.children ?? [])[edit.index] as BarkupNode;
			inserted.id = created.placeholder;
		}
		baseSteps.push({
			index,
			kind: edit.kind,
			edit,
			instruction,
			...(created !== undefined ? { created } : {}),
			referenceBack: false,
			...(callback !== undefined ? { callback } : {}),
		});
	}

	// Chatter: seeded pick of 4 distinct lines, shared by both twins.
	const chatterLines: string[] = [];
	while (chatterLines.length < Y_SCHEDULE.chatter.length) {
		const line = riderRng.pick([...CHATTER_POOL]);
		if (!chatterLines.includes(line)) chatterLines.push(line);
	}
	const chatterAt = new Map<number, string>();
	Y_SCHEDULE.chatter.forEach((stepIndex, i) => {
		chatterAt.set(stepIndex, chatterLines[i] as string);
	});

	const dress = (style: PhrasingStyle): WTask => {
		const steps = baseSteps.map((base) => {
			const step: SessionStep = { ...base };
			const riderKind = RIDER_KIND[step.index];
			if (riderKind) {
				const rider =
					style === "formulaic"
						? formulaicRider(riderKind, declarables)
						: casualRider(riderKind, declarables, riderRng);
				step.instruction = `${step.instruction} ${rider}`;
				step.declares = declaresText(riderKind, declarables);
			}
			const chatter = chatterAt.get(step.index);
			if (chatter) step.instruction = `${step.instruction} ${chatter}`;
			return step;
		});
		return {
			id,
			family: "session",
			bucket,
			tree,
			steps,
			expectedFinal: state,
			declarables,
			declaringSteps: [S.declareF1, S.declareRule, S.retractF1, S.declareF2],
			callbackSteps: [S.governed1, S.factF1, S.governed2, S.factF2],
		};
	};

	// Casual riders consume riderRng picks; dress casual FIRST with a
	// dedicated pass so formulaic (no picks) can't perturb determinism.
	const casual = dress("casual");
	const formulaic = dress("formulaic");
	return { formulaic, casual };
}

/** BRIEF-Y validation over a twin pair. */
export function validateYPair(pair: YPair): string[] {
	const problems: string[] = [];
	for (const [style, task] of [
		["formulaic", pair.formulaic],
		["casual", pair.casual],
	] as const) {
		for (const p of validateSession(task)) problems.push(`${style}: ${p}`);
		const d = task.declarables;
		let state = cloneTree(task.tree);
		for (const step of task.steps) {
			if (step.callback === "fact" && step.edit.kind === "set-name") {
				const codename = step.edit.name;
				if (step.instruction.includes(codename)) {
					problems.push(`${style} step ${step.index}: leaks codename`);
				}
				let leaked = false;
				walkTree(state, ({ node }) => {
					if (node.name === codename) leaked = true;
					if (JSON.stringify(node.attributes ?? {}).includes(codename)) {
						leaked = true;
					}
				});
				if (leaked) problems.push(`${style} step ${step.index}: derivable`);
			}
			if (step.callback === "rule" && step.edit.kind === "insert-node") {
				if (
					step.instruction.includes("textStyle") ||
					step.instruction.includes(d.rule)
				) {
					problems.push(`${style} step ${step.index}: leaks rule`);
				}
			}
			// Casual riders must contain their declarable verbatim.
			if (step.declares !== undefined) {
				const needle =
					step.index === Y_SCHEDULE.declareF1
						? d.f1Initial
						: step.index === Y_SCHEDULE.retractF1
							? d.f1Final
							: step.index === Y_SCHEDULE.declareF2
								? d.f2
								: d.rule;
				if (!step.instruction.includes(needle)) {
					problems.push(`${style} step ${step.index}: rider omits declarable`);
				}
			}
			for (const placeholder of placeholdersInEdit(step.edit)) {
				if (!findById(state, placeholder)) {
					problems.push(`${style} step ${step.index}: dangling placeholder`);
				}
			}
			state = applyEdit(state, step.edit);
			if (step.created && step.edit.kind === "insert-node") {
				const parent = findById(state, step.edit.parentId);
				const inserted = (parent?.children ?? [])[step.edit.index];
				if (inserted) inserted.id = step.created.placeholder;
			}
		}
	}
	// Twins: identical except declaring-step instructions.
	const f = pair.formulaic.steps;
	const c = pair.casual.steps;
	for (let i = 0; i < f.length; i += 1) {
		const a = f[i] as SessionStep;
		const b = c[i] as SessionStep;
		if (JSON.stringify(a.edit) !== JSON.stringify(b.edit)) {
			problems.push(`twin step ${a.index}: edits differ`);
		}
		const declaring = RIDER_KIND[a.index] !== undefined;
		if (!declaring && a.instruction !== b.instruction) {
			problems.push(`twin step ${a.index}: non-declaring instructions differ`);
		}
		if (declaring && a.instruction === b.instruction) {
			problems.push(`twin step ${a.index}: declaring instructions identical`);
		}
	}
	// Chatter carries no declarable.
	const d = pair.formulaic.declarables;
	for (const line of CHATTER_POOL) {
		for (const v of [d.f1Initial, d.f1Final, d.f2, d.rule]) {
			if (line.includes(v)) problems.push(`chatter contains declarable ${v}`);
		}
	}
	return problems;
}
