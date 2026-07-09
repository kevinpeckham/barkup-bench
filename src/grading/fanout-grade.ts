/**
 * Study Q/R fan-out grading helpers (BRIEF-Q.md): per-target coverage
 * and the partial/collateral/invalid failure split, computed offline
 * from a record's final tree.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import type { FanoutTask } from "../corpus/fanout.js";
import { findById } from "../tree.js";
import { changedExistingIds } from "./misground.js";

/** Fraction of targets whose final state matches the expected edit. */
export function fanoutCoverage(
	task: FanoutTask,
	final: BarkupNode | null | undefined,
): number | null {
	if (!final) return null;
	let ok = 0;
	for (const id of task.targetIds) {
		if (task.fanKind === "remove-all") {
			if (!findById(final, id)) ok += 1;
		} else {
			const node = findById(final, id);
			if (
				node &&
				JSON.stringify(node.attributes?.[task.key as string]) ===
					JSON.stringify(task.value)
			) {
				ok += 1;
			}
		}
	}
	return ok / task.targetIds.length;
}

/** Failure class: invalid / collateral / partial / mechanics. */
export function classifyFanoutFailure(
	task: FanoutTask,
	final: BarkupNode | null | undefined,
): "invalid" | "collateral" | "partial" | "mechanics" {
	if (!final) return "invalid";
	const sanctioned = changedExistingIds(
		task.tree as BarkupNode,
		task.expected as BarkupNode,
	);
	const actual = changedExistingIds(task.tree as BarkupNode, final);
	for (const id of actual) {
		if (!sanctioned.has(id)) return "collateral";
	}
	const c = fanoutCoverage(task, final);
	if (c !== null && c < 1) return "partial";
	return "mechanics";
}
