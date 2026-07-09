/**
 * Study R prompt-intervention conditions (docs/BRIEF-R.md): a worked
 * fan-out example and a checklist block, each applied to Study Q's two
 * context bases. The example lives on Study P's example tree (whose
 * "steps" block has exactly three text-atoms), its instruction comes
 * from the committed fan-out describer, and its reply covers ALL three
 * targets — unit-tested against the fan-out applier.
 */
import type { FanoutSpec, FanoutTask } from "../corpus/fanout.js";
import { describeFanout } from "../corpus/fanout.js";
import { EXAMPLE_TREE } from "../harness/examples.js";
import { conditionF } from "./f.js";
import { applyShipped } from "./f2.js";
import { serializeJsonTree } from "./shared.js";
import type { PatchCondition } from "./types.js";
import { serializeView, VIEW_RULES } from "./views.js";

/** Pre-registered example spec (BRIEF-R.md): all three text-atoms in "steps". */
export const FANOUT_EXAMPLE_SPEC: FanoutSpec = {
	fanKind: "set-attribute-all",
	targetIds: ["ex-t1", "ex-t2", "ex-t3"],
	key: "maxLength",
	value: 64,
};

export const FANOUT_EXAMPLE_INSTRUCTION = describeFanout(
	EXAMPLE_TREE,
	"ex-block",
	"text-atom",
	FANOUT_EXAMPLE_SPEC,
);

/** Pre-registered reply (BRIEF-R.md): one op per target, complete set. */
export const FANOUT_EXAMPLE_REPLY =
	'[{"op": "set-attribute", "id": "ex-t1", "key": "maxLength", "value": 64}, {"op": "set-attribute", "id": "ex-t2", "key": "maxLength", "value": 64}, {"op": "set-attribute", "id": "ex-t3", "key": "maxLength", "value": 64}]';

function exampleBlock(rendering: string): string {
	return `

Worked example (from a different, unrelated tree):

Here is the tree:

${rendering}
Edit request: ${FANOUT_EXAMPLE_INSTRUCTION}

Reply:
${FANOUT_EXAMPLE_REPLY}`;
}

/** The example in each arm's own rendering (BRIEF-R.md). */
export const FANOUT_EXAMPLE_BLOCK_VIEW = exampleBlock(
	serializeView(EXAMPLE_TREE, ["ex-block"], "minimal"),
);
export const FANOUT_EXAMPLE_BLOCK_FULL = exampleBlock(
	serializeJsonTree(EXAMPLE_TREE),
);

/** Pre-registered checklist block (BRIEF-R.md). */
export const COVERAGE_RULES = `

Coverage rules:
- When an edit request applies to every node matching a description, first enumerate the ids of ALL matching nodes you can see, then emit one operation per id. A patch that covers only some of the matching nodes is wrong.`;

export type RArm = "exV" | "exF" | "ckV" | "ckF";

const ARM_ID: Record<RArm, string> = {
	exV: "R-exV",
	exF: "R-exF",
	ckV: "R-ckV",
	ckF: "R-ckF",
};

/** The four intervention conditions on Study Q's two bases. */
export function makeRCondition(arm: RArm, task: FanoutTask): PatchCondition {
	const view = arm === "exV" || arm === "ckV";
	const block =
		arm === "exV"
			? FANOUT_EXAMPLE_BLOCK_VIEW
			: arm === "exF"
				? FANOUT_EXAMPLE_BLOCK_FULL
				: COVERAGE_RULES;
	const focus = [task.containerId, ...task.targetIds];
	return {
		...conditionF,
		id: ARM_ID[arm],
		systemPrompt: view
			? conditionF.systemPrompt + VIEW_RULES + block
			: conditionF.systemPrompt + block,
		...(view
			? { serialize: (tree) => serializeView(tree, focus, "minimal") }
			: {}),
		applyArtifact: applyShipped,
	};
}
