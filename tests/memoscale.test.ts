import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { IntegrityTask, MemoScaleTask } from "../src/corpus/memoscale.js";
import {
	validateIntegrityTask,
	validateMemoScaleTask,
} from "../src/corpus/memoscale.js";
import {
	classifyIntegrity,
	contaminationScan,
} from "../src/harness/memoscale-runner.js";
import type { SessionNote } from "../src/shipped/session-notes.js";

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
