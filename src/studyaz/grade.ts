/**
 * Study AZ mechanical grader (docs/BRIEF-AZ.md): grades a single
 * apply_template_patch tool call's operations array against the
 * registered task set. No model and no analyst judges anything here.
 */

export interface AzOp {
	op?: unknown;
	id?: unknown;
	key?: unknown;
	value?: unknown;
	before?: unknown;
	after?: unknown;
	parentId?: unknown;
	[k: string]: unknown;
}

/** The three sizing-family attribute keys the D rule forbids inventing. */
export const SIZING_KEYS = [
	"data-slot-span",
	"data-slot-height-px",
	"data-required-widget-width",
];

/** The attribute v3.334.0 removed; writes to it are silent no-ops in the app. */
export const DEAD_KEY = "data-required-widget-width";

function normValue(v: unknown): string {
	return String(v).trim();
}

function opMatches(got: AzOp, want: Record<string, unknown>): boolean {
	for (const [k, v] of Object.entries(want)) {
		if (k === "value") {
			if (normValue(got.value) !== normValue(v)) return false;
		} else if (got[k] !== v) {
			return false;
		}
	}
	return true;
}

/** S bucket: the ops array must be exactly the expected set (order-free). */
export function gradeExact(
	ops: AzOp[],
	expected: Record<string, unknown>[],
): boolean {
	if (ops.length !== expected.length) return false;
	const used = new Set<number>();
	for (const want of expected) {
		let hit = -1;
		for (let i = 0; i < ops.length; i++) {
			if (!used.has(i) && opMatches(ops[i] as AzOp, want)) {
				hit = i;
				break;
			}
		}
		if (hit === -1) return false;
		used.add(hit);
	}
	return true;
}

/** D bucket: every required op present (extra non-sizing ops allowed). */
export function gradeRequired(
	ops: AzOp[],
	required: Record<string, unknown>[],
): boolean {
	return required.every((want) => ops.some((got) => opMatches(got, want)));
}

/** D bucket alternative forms: any one of the listed op sets satisfies. */
export function gradeRequiredAny(
	ops: AzOp[],
	alternatives: Record<string, unknown>[][],
): boolean {
	return alternatives.some((alt) => gradeRequired(ops, alt));
}

/** Keys written by set-attribute ops (the D rule and the T census read these). */
export function writtenKeys(ops: AzOp[]): string[] {
	const keys: string[] = [];
	for (const op of ops) {
		if (
			(op.op === "set-attribute" || op.op === "remove-attribute") &&
			typeof op.key === "string"
		) {
			keys.push(op.key);
		}
		// insert ops can also smuggle attributes in on new nodes
		if (op.op === "insert" && op.node && typeof op.node === "object") {
			const attrs = (op.node as { attributes?: Record<string, unknown> })
				.attributes;
			if (attrs) keys.push(...Object.keys(attrs));
		}
	}
	return keys;
}

/** Count of sizing-family keys among the written keys. */
export function sizingWrites(ops: AzOp[]): number {
	return writtenKeys(ops).filter((k) => SIZING_KEYS.includes(k)).length;
}

/** Count of writes to the removed attribute (silent no-ops in the app). */
export function deadWrites(ops: AzOp[]): number {
	return writtenKeys(ops).filter((k) => k === DEAD_KEY).length;
}
