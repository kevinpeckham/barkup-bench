/**
 * Condition registry and the prompt-regime layer.
 *
 * parity: the mechanically parallel prompts defined in each condition.
 * best: the same conditions with best-effort system prompts — the SAME
 * three additions applied uniformly to every condition (a worked
 * micro-example in the condition's own format, an explicit
 * no-embellishment rule, and a pre-reply checklist), authored before
 * any full-matrix scored run and sanity-checked on the dev split only.
 */
import { conditionA } from "./a.js";
import { conditionB } from "./b.js";
import { BEST_EFFORT_SYSTEM } from "./best-effort.js";
import { conditionC } from "./c.js";
import { conditionD } from "./d.js";
import { conditionE } from "./e.js";
import type { Condition } from "./types.js";

export type Regime = "parity" | "best";

export const ALL_CONDITIONS: Condition[] = [
	conditionA,
	conditionB,
	conditionC,
	conditionD,
	conditionE,
];

export function conditionsForRegime(
	regime: Regime,
	ids?: readonly string[],
): Condition[] {
	const selected = ALL_CONDITIONS.filter(
		(condition) => ids === undefined || ids.includes(condition.id),
	);
	if (regime === "parity") return selected;
	return selected.map((condition) => {
		const best = BEST_EFFORT_SYSTEM[condition.id];
		if (!best) throw new Error(`No best-effort prompt for ${condition.id}`);
		return { ...condition, systemPrompt: best } as Condition;
	});
}
