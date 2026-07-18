import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { IntegrityTask, MemoScaleTask } from "../src/corpus/memoscale.js";
import {
	validateIntegrityTask,
	validateMemoScaleTask,
} from "../src/corpus/memoscale.js";
import {
	AL_FENCE_SENTENCE,
	AM_INVITE_SENTENCE,
	classifyIntegrity,
	contaminationScan,
	evaluateConsolidation,
	evaluatePipeline,
	goalNeedlesOf,
	noticeForArm,
	promptRuleForArm,
} from "../src/harness/memoscale-runner.js";
import type { SessionNote } from "../src/shipped/session-notes.js";
import { SESSION_NOTES_PROMPT_RULE } from "../src/shipped/session-notes.js";

const corpus = JSON.parse(readFileSync("corpus/memo-scale.json", "utf8")) as {
	seed: number;
	tasks: MemoScaleTask[];
	integrity: IntegrityTask[];
};

describe("memo-scale corpus (Study AH)", () => {
	it("has the registered shape and seed", () => {
		expect(corpus.seed).toBe(20260718);
		expect(corpus.tasks.length).toBe(60);
		expect(corpus.integrity.length).toBe(30);
		for (const kind of ["recall", "rule"] as const) {
			for (const n of [5, 20] as const) {
				for (const position of ["first", "middle", "last"] as const) {
					const cells = corpus.tasks.filter(
						(t) => t.kind === kind && t.nLevel === n && t.position === position,
					);
					expect(cells.length).toBe(5);
				}
			}
		}
		for (const k of [10, 19, 20] as const) {
			expect(corpus.integrity.filter((t) => t.kLevel === k).length).toBe(10);
		}
	});

	it("every read task passes its validator", () => {
		for (const task of corpus.tasks) {
			expect({ id: task.id, problems: validateMemoScaleTask(task) }).toEqual({
				id: task.id,
				problems: [],
			});
		}
	});

	it("every integrity task passes its validator", () => {
		for (const task of corpus.integrity) {
			expect({ id: task.id, problems: validateIntegrityTask(task) }).toEqual({
				id: task.id,
				problems: [],
			});
		}
	});
});

describe("contaminationScan", () => {
	it("finds foreign needles and ignores absent ones", () => {
		const tree = {
			type: "document",
			id: "n1",
			attributes: { title: "has amber-dune-42 inside" },
		};
		expect(contaminationScan(tree, ["amber-dune-42", "onyx-larch-77"])).toEqual(
			["amber-dune-42"],
		);
	});
});

describe("classifyIntegrity", () => {
	const base = corpus.integrity.find((t) => t.kLevel === 10) as IntegrityTask;
	const cap = corpus.integrity.find((t) => t.kLevel === 20) as IntegrityTask;

	function notesFor(_task: IntegrityTask, needles: string[]): SessionNote[] {
		return needles.map((n) => ({ kind: "fact", text: `codename "${n}".` }));
	}

	it("classifies a clean full-replace", () => {
		const raw = notesFor(base, [...base.oldNeedles, base.newNeedle]);
		const v = classifyIntegrity(base, true, raw);
		expect(v.outcome).toBe("clean-update");
		expect(v.oldPreserved).toBe(10);
		expect(v.lost).toEqual([]);
	});

	it("classifies a skipped tool and a dropped declaration", () => {
		expect(classifyIntegrity(base, false, null).outcome).toBe("skipped-tool");
		const raw = notesFor(base, base.oldNeedles);
		expect(classifyIntegrity(base, true, raw).outcome).toBe("dropped-new");
	});

	it("classifies losing an old note below the cap", () => {
		const raw = notesFor(base, [...base.oldNeedles.slice(1), base.newNeedle]);
		const v = classifyIntegrity(base, true, raw);
		expect(v.outcome).toBe("lost-old");
		expect(v.lost).toEqual([base.oldNeedles[0] as string]);
	});

	it("classifies a deliberate prune at the cap", () => {
		const raw = notesFor(cap, [...cap.oldNeedles.slice(1), cap.newNeedle]);
		const v = classifyIntegrity(cap, true, raw);
		expect(v.outcome).toBe("pruned-old");
		expect(v.oldPreserved).toBe(19);
	});

	it("classifies an over-cap send: the shipped clamp eats the newest", () => {
		// 20 old + new appended LAST → clamp keeps the first 20 → new lost.
		const raw = notesFor(cap, [...cap.oldNeedles, cap.newNeedle]);
		const v = classifyIntegrity(cap, true, raw);
		expect(raw.length).toBe(21);
		expect(v.outcome).toBe("over-cap-lost-newest");
		expect(v.lost).toEqual([cap.newNeedle]);
	});

	it("classifies an over-cap send with the new note first: an old note dies", () => {
		const raw = notesFor(cap, [cap.newNeedle, ...cap.oldNeedles]);
		const v = classifyIntegrity(cap, true, raw);
		expect(v.outcome).toBe("over-cap-lost-old");
		expect(v.lost).toEqual([
			cap.oldNeedles[cap.oldNeedles.length - 1] as string,
		]);
	});
});

describe("evaluatePipeline (Study AK)", () => {
	const cap = corpus.integrity.find((t) => t.kLevel === 20) as IntegrityTask;
	const base = corpus.integrity.find((t) => t.kLevel === 10) as IntegrityTask;

	it("needle↔note alignment holds for every integrity task", () => {
		for (const task of corpus.integrity) {
			task.notes.forEach((note, i) => {
				expect(note.text).toContain(task.oldNeedles[i] as string);
			});
		}
	});

	it("k=20 memos are 12 facts + 5 rules + 3 goals with a fact declaration", () => {
		for (const task of corpus.integrity.filter((t) => t.kLevel === 20)) {
			const kinds = task.notes.map((n) => n.kind);
			expect(kinds.filter((k) => k === "fact").length).toBe(12);
			expect(kinds.filter((k) => k === "rule").length).toBe(5);
			expect(kinds.filter((k) => k === "goal").length).toBe(3);
			expect(task.newNote.kind).toBe("fact");
			expect(goalNeedlesOf(task).length).toBe(3);
		}
	});

	it("over-send: eviction arm evicts the oldest fact and keeps every goal", () => {
		// The AH-observed shape: new fact grouped with the facts, goals at the tail.
		const raw: SessionNote[] = [
			...cap.notes.slice(0, 12),
			{ kind: "fact", text: `declared codename "${cap.newNeedle}".` },
			...cap.notes.slice(12),
		];
		expect(raw.length).toBe(21);
		const v = evaluatePipeline(cap, "AK-eviction", raw);
		expect(v.overCap).toBe(true);
		expect(v.goalSafe).toBe(true);
		expect(v.designedEviction).toBe(true);
		expect(v.evictedKinds).toEqual(["fact"]);
		expect(v.lostPost).toEqual([cap.oldNeedles[0] as string]);
		expect(v.prunedKinds).toEqual([]);
	});

	it("over-send: control arm clamps the tail goal instead", () => {
		const raw: SessionNote[] = [
			...cap.notes.slice(0, 12),
			{ kind: "fact", text: `declared codename "${cap.newNeedle}".` },
			...cap.notes.slice(12),
		];
		const v = evaluatePipeline(cap, "AK-control", raw);
		expect(v.overCap).toBe(true);
		expect(v.goalSafe).toBe(false);
		expect(v.designedEviction).toBe(null);
		expect(v.lostPost).toEqual([
			cap.oldNeedles[cap.oldNeedles.length - 1] as string,
		]);
	});

	it("client prune of a goal is out of the eviction's reach", () => {
		const raw: SessionNote[] = [
			...cap.notes.slice(0, 19),
			{ kind: "fact", text: `declared codename "${cap.newNeedle}".` },
		];
		expect(raw.length).toBe(20);
		const v = evaluatePipeline(cap, "AK-eviction", raw);
		expect(v.overCap).toBe(false);
		expect(v.goalSafe).toBe(false);
		expect(v.prunedKinds).toEqual(["goal"]);
		expect(v.evictedKinds).toEqual([]);
	});

	it("under-cap update is a strict no-op for the eviction pipeline", () => {
		const raw: SessionNote[] = [
			...base.notes,
			{ kind: "fact", text: `declared codename "${base.newNeedle}".` },
		];
		const v = evaluatePipeline(base, "AK-eviction", raw);
		expect(v.overCap).toBe(false);
		expect(v.goalSafe).toBe(true);
		expect(v.evictedKinds).toEqual([]);
		expect(v.lostPost).toEqual([]);
		const ctl = evaluatePipeline(base, "AK-control", raw);
		expect(ctl.goalSafe).toBe(true);
		expect(ctl.lostPost).toEqual([]);
	});

	it("skipped tool loses everything", () => {
		const v = evaluatePipeline(cap, "AK-eviction", null);
		expect(v.goalSafe).toBe(false);
		expect(v.lostPost.length).toBe(21);
	});
});

describe("Study AL fence arm (BRIEF-AL)", () => {
	const cap = corpus.integrity.find((t) => t.kLevel === 20) as IntegrityTask;
	const base = corpus.integrity.find((t) => t.kLevel === 10) as IntegrityTask;

	it("the fence sentence is the brief's wording, verbatim", () => {
		expect(AL_FENCE_SENTENCE).toBe(
			"Never drop or trim an existing note to make room — even if the memo looks full, send every existing note plus your change; the app decides evictions and will notify you if one occurs.",
		);
	});

	it("AL-fence appends exactly the fence sentence; every other arm runs the shipped rule unchanged", () => {
		expect(promptRuleForArm("AL-fence")).toBe(
			`${SESSION_NOTES_PROMPT_RULE} ${AL_FENCE_SENTENCE}`,
		);
		for (const arm of ["AH", "AK-control", "AK-eviction"] as const) {
			expect(promptRuleForArm(arm)).toBe(SESSION_NOTES_PROMPT_RULE);
		}
	});

	it("AL-fence grades under the eviction pipeline, identical to AK-eviction", () => {
		const overSend: SessionNote[] = [
			...cap.notes.slice(0, 12),
			{ kind: "fact", text: `declared codename "${cap.newNeedle}".` },
			...cap.notes.slice(12),
		];
		const prune: SessionNote[] = [
			...cap.notes.slice(0, 19),
			{ kind: "fact", text: `declared codename "${cap.newNeedle}".` },
		];
		const underCap: SessionNote[] = [
			...base.notes,
			{ kind: "fact", text: `declared codename "${base.newNeedle}".` },
		];
		for (const [task, raw] of [
			[cap, overSend],
			[cap, prune],
			[cap, null],
			[base, underCap],
		] as const) {
			expect(
				evaluatePipeline(task, "AL-fence", raw as SessionNote[] | null),
			).toEqual(
				evaluatePipeline(task, "AK-eviction", raw as SessionNote[] | null),
			);
		}
	});

	it("over-send under the fence arm is a designed eviction (goals intact)", () => {
		const raw: SessionNote[] = [
			...cap.notes.slice(0, 12),
			{ kind: "fact", text: `declared codename "${cap.newNeedle}".` },
			...cap.notes.slice(12),
		];
		const v = evaluatePipeline(cap, "AL-fence", raw);
		expect(v.overCap).toBe(true);
		expect(v.goalSafe).toBe(true);
		expect(v.designedEviction).toBe(true);
		expect(v.evictedKinds).toEqual(["fact"]);
	});
});

describe("Study AM consolidation-on-notice (BRIEF-AM)", () => {
	const amCorpus = JSON.parse(
		readFileSync("corpus/memo-consolidation.json", "utf8"),
	) as { seed: number; integrity: IntegrityTask[] };
	const task = amCorpus.integrity[0] as IntegrityTask;

	it("corpus: 40 cap-edge tasks, aligned, 12+5+3 composition, seed 20260719", () => {
		expect(amCorpus.seed).toBe(20260719);
		expect(amCorpus.integrity.length).toBe(40);
		for (const t of amCorpus.integrity) {
			expect(t.kLevel).toBe(20);
			t.notes.forEach((note, i) => {
				expect(note.text).toContain(t.oldNeedles[i] as string);
			});
			const kinds = t.notes.map((n) => n.kind);
			expect(kinds.filter((k) => k === "fact").length).toBe(12);
			expect(kinds.filter((k) => k === "rule").length).toBe(5);
			expect(kinds.filter((k) => k === "goal").length).toBe(3);
		}
	});

	it("the invite sentence is the brief's wording, verbatim", () => {
		expect(AM_INVITE_SENTENCE).toBe(
			"You may call update_session_notes again with the memo consolidated — the same facts, rules, and goals rewritten into fewer, denser notes so everything fits. Nothing needs to be lost.",
		);
	});

	it("only AM-invite appends the sentence; no arm invents a notice", () => {
		const base = "Memo full: evicted 1 oldest non-goal note(s).";
		expect(noticeForArm("AM-invite", base)).toBe(
			`${base} ${AM_INVITE_SENTENCE}`,
		);
		for (const arm of [
			"AM-control",
			"AK-eviction",
			"AK-control",
			"AL-fence",
			"AH",
		] as const) {
			expect(noticeForArm(arm, base)).toBe(base);
		}
		expect(noticeForArm("AM-invite", undefined)).toBeUndefined();
	});

	const overSend = (): SessionNote[] => [
		...task.notes.slice(0, 12),
		{ kind: "fact", text: `declared codename "${task.newNeedle}".` },
		...task.notes.slice(12),
	];

	it("over-send with no reaction is eviction-accepted", () => {
		const v = evaluateConsolidation(task, [overSend()]);
		expect(v.noticeDelivered).toBe(true);
		expect(v.outcome).toBe("eviction-accepted");
		expect(v.needlesPresent).toBe(20);
		expect(v.extraEvictions).toBe(0);
	});

	it("lossless consolidation carries all 21 needles with goals in goal notes", () => {
		// Merge the 12 facts + new fact into 6 dense fact notes, keep rules
		// and goals as-is: 6 + 5 + 3 = 14 notes, all 21 needles.
		const factNeedles = task.notes
			.map((note, i) => ({ note, needle: task.oldNeedles[i] as string }))
			.filter((x) => x.note.kind === "fact")
			.map((x) => x.needle);
		const merged: SessionNote[] = [];
		const withNew = [...factNeedles, task.newNeedle];
		for (let i = 0; i < withNew.length; i += 3) {
			merged.push({
				kind: "fact",
				text: `codenames ${withNew.slice(i, i + 3).join(", ")}.`,
			});
		}
		const consolidated: SessionNote[] = [
			...merged,
			...task.notes.filter((n) => n.kind !== "fact"),
		];
		expect(consolidated.length).toBeLessThanOrEqual(20);
		const v = evaluateConsolidation(task, [overSend(), consolidated]);
		expect(v.outcome).toBe("lossless-recovery");
		expect(v.needlesPresent).toBe(21);
		expect(v.goalsInGoalNotes).toBe(true);
		expect(v.finalNoteCount).toBe(consolidated.length);
	});

	it("a consolidation that drops a goal needle is degraded", () => {
		const consolidated: SessionNote[] = [
			{ kind: "fact", text: `all the codenames incl "${task.newNeedle}".` },
			...task.notes.filter((n) => n.kind === "goal").slice(0, 2),
		];
		const v = evaluateConsolidation(task, [overSend(), consolidated]);
		expect(v.outcome).toBe("degraded");
	});

	it("a goal needle moved into a fact note is degraded", () => {
		const goalIdx = task.notes.findIndex((n) => n.kind === "goal");
		const goalNeedle = task.oldNeedles[goalIdx] as string;
		const consolidated: SessionNote[] = task.notes.map((note, i) =>
			i === goalIdx ? { kind: "fact", text: note.text } : note,
		);
		consolidated.push({
			kind: "fact",
			text: `declared codename "${task.newNeedle}".`,
		});
		// 21 notes → still over cap; trim one old fact to fit and keep needles
		// countable: drop the first fact note instead.
		const factIdx = consolidated.findIndex(
			(n, i) => n.kind === "fact" && i !== goalIdx,
		);
		consolidated.splice(factIdx, 1);
		const v = evaluateConsolidation(task, [overSend(), consolidated]);
		expect(v.outcome).toBe("degraded");
		expect(v.goalsInGoalNotes).toBe(false);
		expect(goalNeedle.length).toBeGreaterThan(0);
	});

	it("client prune never sees a notice", () => {
		const pruned: SessionNote[] = [
			...task.notes.slice(0, 19),
			{ kind: "fact", text: `declared codename "${task.newNeedle}".` },
		];
		const v = evaluateConsolidation(task, [pruned]);
		expect(v.noticeDelivered).toBe(false);
		expect(v.outcome).toBe("no-notice");
	});

	it("re-sending over cap after the notice counts as churn", () => {
		const v = evaluateConsolidation(task, [overSend(), overSend()]);
		expect(v.extraEvictions).toBe(1);
		expect(v.outcome).toBe("eviction-accepted");
	});
});
