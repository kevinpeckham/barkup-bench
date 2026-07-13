/**
 * Study W shipped artifacts (docs/BRIEF-W.md): VERBATIM ports from
 * slx-replicator v3.183.0 (commit 3c714f4) — the session-notes memo
 * machinery whose agent-maintained extraction W measures. Do not
 * "improve" anything here: character identity with the shipped source
 * is the point, and tests/shipped-notes.test.ts guards it.
 */

export type SessionNoteKind = "fact" | "rule" | "goal";

export interface SessionNote {
	kind: SessionNoteKind;
	text: string;
}

/** Bounds keep the block a memo, not a transcript. */
export const MAX_SESSION_NOTES = 20;
export const MAX_SESSION_NOTE_CHARS = 300;

const NOTE_KINDS: ReadonlySet<string> = new Set(["fact", "rule", "goal"]);

/**
 * Clamp arbitrary input (request body or tool args) to a valid notes list:
 * drops non-notes, trims and caps text, caps count. Never throws.
 */
export function normalizeSessionNotes(input: unknown): SessionNote[] {
	if (!Array.isArray(input)) return [];
	const notes: SessionNote[] = [];
	for (const item of input) {
		if (notes.length >= MAX_SESSION_NOTES) break;
		if (!item || typeof item !== "object") continue;
		const kind = (item as { kind?: unknown }).kind;
		const text = (item as { text?: unknown }).text;
		if (typeof kind !== "string" || !NOTE_KINDS.has(kind)) continue;
		if (typeof text !== "string") continue;
		const trimmed = text.trim().slice(0, MAX_SESSION_NOTE_CHARS);
		if (!trimmed) continue;
		notes.push({ kind: kind as SessionNoteKind, text: trimmed });
	}
	return notes;
}

const KIND_LABELS: Record<SessionNoteKind, string> = {
	fact: "Facts",
	goal: "Goals",
	rule: "Standing rules",
};

const KIND_ORDER: readonly SessionNoteKind[] = ["fact", "rule", "goal"];

/**
 * Render the notes as a system-prompt section. Empty string when there are
 * no notes, so callers can append unconditionally.
 */
export function formatSessionNotesBlock(notes: SessionNote[]): string {
	if (notes.length === 0) return "";
	const sections: string[] = [];
	for (const kind of KIND_ORDER) {
		const items = notes.filter((note) => note.kind === kind);
		if (items.length === 0) continue;
		sections.push(
			`${KIND_LABELS[kind]}:\n${items.map((note) => `- ${note.text}`).join("\n")}`,
		);
	}
	return `\n\n## Session notes (app-maintained memo)\nDeclared facts, standing rules, and goals from this session — authoritative even when the conversation that declared them is no longer visible. Apply standing rules to every edit they cover without being reminded, and anchor goal-directed rewrites on the goals below.\n${sections.join("\n")}`;
}

/**
 * Study AB shipped artifact (docs/BRIEF-AB.md): VERBATIM port of
 * slx-replicator v3.188.1's formatter (commit ce06373) — identical to
 * the v3.183.0 formatter above except the block header ends with the
 * shipped PRECEDENCE clause. The v3.183.0 export above is untouched
 * so Studies W/Y/Z/AA keep their identity guarantees.
 */
export function formatSessionNotesBlockV2(notes: SessionNote[]): string {
	if (notes.length === 0) return "";
	const sections: string[] = [];
	for (const kind of KIND_ORDER) {
		const items = notes.filter((note) => note.kind === kind);
		if (items.length === 0) continue;
		sections.push(
			`${KIND_LABELS[kind]}:\n${items.map((note) => `- ${note.text}`).join("\n")}`,
		);
	}
	return `\n\n## Session notes (app-maintained memo)\nDeclared facts, standing rules, and goals from this session — authoritative even when the conversation that declared them is no longer visible. Apply standing rules to every edit they cover without being reminded, and anchor goal-directed rewrites on the goals below. PRECEDENCE: a direct, explicit instruction in the current request overrides any note here for that request — the memo carries standing intent, not vetoes (a one-off override is not a retraction; keep the note unless the user retracts it).\n${sections.join("\n")}`;
}

/**
 * Rules-of-engagement text instructing the agent to maintain the memo.
 * Appended to each chat surface's system prompt alongside the block.
 */
export const SESSION_NOTES_PROMPT_RULE = `Session-notes rule: maintain the memo with update_session_notes. When the user declares a fact to reuse later (a name, a codename, a value), a standing rule ("every new section gets X"), or a goal that should steer later work ("keep everything focused on Y"), record it — send the COMPLETE updated list, one short sentence per note. Notes outlive the visible conversation window; restate a goal from the memo in your own words before a goal-directed rewrite (views carry values, memos carry goals). Remove notes the user retracts.`;

/** The shipped tool description, verbatim. */
export const UPDATE_SESSION_NOTES_DESCRIPTION =
	"Replace the session-notes memo: the durable list of declared facts, standing rules, and goals for THIS editing session. Call it when the user declares something later edits must honor — a fact or value to reuse (a name, a codename), a standing rule ('every new text atom gets textStyle body-md'), or a goal that should steer later work ('keep every section focused on X') — or retracts one. Send the COMPLETE updated list every time; it replaces the previous memo. The memo is shown to you at every future turn and outlives the visible conversation window, and it is the measured carrier for qualitative goals (restate a memo goal in your own words before a goal-directed rewrite).";

/** The shipped history window, verbatim semantics: keep the LAST 32. */
export const MAX_HISTORY_MESSAGES = 32;
