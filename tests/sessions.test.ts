/**
 * Study K session corpus + resolution helpers (pre-registered,
 * BRIEF-K.md). The generator and resolver are grader surface: they
 * decide what each step asks for and what counts as its ground truth.
 */
import { describe, expect, test } from "bun:test";
import { applyEdit } from "../src/corpus/edits.js";
import { createRng } from "../src/corpus/rng.js";
import type { SessionTask } from "../src/corpus/sessions.js";
import {
	generateSession,
	placeholdersInEdit,
	resolveStep,
	SESSION_STEPS,
	validateSession,
} from "../src/corpus/sessions.js";
import { BUCKETS, sampleTrees } from "../src/corpus/trees.js";
import { allIds, cloneTree, findById, walkTree } from "../src/tree.js";

// Tree sampling (fast-check) is the expensive part — do it once.
const [baseTree] = sampleTrees(BUCKETS.l, 20260709, 1);

function makeSession(seedOffset = 0): SessionTask {
	const rng = createRng(20260709 + seedOffset);
	return generateSession(
		cloneTree(baseTree as NonNullable<typeof baseTree>),
		rng,
		"sess-test-1",
		"l",
	);
}

describe("generateSession", () => {
	const task = makeSession();

	test("emits 12 steps cycling the five kinds", () => {
		expect(task.steps.length).toBe(SESSION_STEPS);
		expect(task.steps.map((s) => s.kind).slice(0, 5)).toEqual([
			"set-attribute",
			"set-name",
			"remove-node",
			"insert-node",
			"move-node",
		]);
	});

	test("is deterministic", () => {
		const again = makeSession();
		expect(JSON.stringify(again)).toBe(JSON.stringify(task));
	});

	test("validates: chain applies, placeholders resolve, no stray ids", () => {
		expect(validateSession(task)).toEqual([]);
	});

	test("insert steps carry unique lookup names", () => {
		let state = cloneTree(task.tree);
		for (const step of task.steps) {
			if (step.created) {
				// Unique (type, name) at the moment the runner will look it up.
				let matches = 0;
				const after = applyEdit(state, step.edit);
				walkTree(after, ({ node }) => {
					if (
						node.type === step.created?.type &&
						node.name === step.created?.name
					) {
						matches += 1;
					}
				});
				expect(matches).toBe(1);
				state = after;
				const parent = findById(
					state,
					(step.edit as { parentId: string }).parentId,
				);
				const inserted = (parent?.children ?? [])[
					(step.edit as { index: number }).index
				];
				if (inserted) inserted.id = step.created.placeholder;
			} else {
				state = applyEdit(state, step.edit);
			}
		}
	});

	test("instructions quote the exact ids their edits use", () => {
		for (const step of task.steps) {
			for (const placeholder of placeholdersInEdit(step.edit)) {
				expect(step.instruction).toContain(`"${placeholder}"`);
			}
		}
	});

	test("reference-back steps exist across the corpus seeds", () => {
		const total = [0, 1, 2, 3, 4]
			.map((i) => makeSession(i * 313 + 7))
			.flatMap((s) => s.steps)
			.filter((s) => s.referenceBack).length;
		expect(total).toBeGreaterThan(0);
	});

	test("expectedFinal carries only source and placeholder ids", () => {
		const source = new Set(allIds(task.tree));
		for (const id of allIds(task.expectedFinal)) {
			expect(source.has(id) || id.startsWith("sess-new-")).toBe(true);
		}
	});
});

describe("resolveStep", () => {
	const task = makeSession();
	const insertStep = task.steps.find((s) => s.created);
	const dependent = task.steps.find(
		(s) => placeholdersInEdit(s.edit).length > 0,
	);

	test("unresolved placeholders are reported, not silently passed", () => {
		if (!dependent) return; // corpus-dependent; covered by seeds above
		const result = resolveStep(dependent, new Map());
		expect("unresolved" in result).toBe(true);
	});

	test("substitutes ids in both edit and instruction", () => {
		if (!dependent) return;
		const placeholder = placeholdersInEdit(dependent.edit)[0] as string;
		const map = new Map([[placeholder, "n999"]]);
		// Resolve remaining placeholders too so resolution succeeds.
		for (const p of placeholdersInEdit(dependent.edit)) {
			if (!map.has(p)) map.set(p, "n998");
		}
		const result = resolveStep(dependent, map);
		expect("edit" in result).toBe(true);
		if ("edit" in result) {
			expect(JSON.stringify(result.edit)).toContain("n999");
			expect(JSON.stringify(result.edit)).not.toContain("sess-new-");
			expect(result.instruction).toContain('"n999"');
			expect(result.instruction).not.toContain(placeholder);
		}
	});

	test("steps without placeholders resolve with an empty map", () => {
		const plain = task.steps.find(
			(s) => placeholdersInEdit(s.edit).length === 0,
		);
		expect(plain).toBeDefined();
		const result = resolveStep(plain as (typeof task.steps)[number], new Map());
		expect("edit" in result).toBe(true);
	});

	test("insert steps expose their created lookup", () => {
		expect(insertStep?.created?.placeholder).toMatch(/^sess-new-\d+$/);
		expect(insertStep?.created?.name).toBeTruthy();
	});
});
