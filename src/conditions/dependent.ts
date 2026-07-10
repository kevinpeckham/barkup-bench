/**
 * Study U arm constructions (docs/BRIEF-U.md). Nothing new is written
 * for models to read: U-full is the LG-full construction, the view
 * arms are the Studies I/J minimal-view construction with different
 * focus ids, and U-search reuses the N-search runner unchanged.
 */
import type { DependentTask } from "../corpus/dependent.js";
import { conditionF } from "./f.js";
import { applyShipped } from "./f2.js";
import type { PatchCondition } from "./types.js";
import { serializeView, VIEW_RULES } from "./views.js";

/** U-full: condition F with the shipped applier, whole tree shown. */
export function makeUFull(): PatchCondition {
	return { ...conditionF, id: "U-full", applyArtifact: applyShipped };
}

/** U-view1 / U-view2: minimal focused view of the target only, or of
 * both the target and the source node. */
export function makeUView(
	task: DependentTask,
	arm: "U-view1" | "U-view2",
): PatchCondition {
	const ids =
		arm === "U-view1" ? [task.targetId] : [task.targetId, task.sourceId];
	return {
		...conditionF,
		id: arm,
		systemPrompt: conditionF.systemPrompt + VIEW_RULES,
		serialize: (tree) => serializeView(tree, ids, "minimal"),
		applyArtifact: applyShipped,
	};
}
