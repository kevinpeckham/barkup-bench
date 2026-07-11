/**
 * Study V judging runs (docs/BRIEF-V.md): each non-control arm vs the
 * V-instr control, same task, same editor model, both orders, both
 * judges. Pairs with a mechanical failure on either side are settled
 * without a judge call (BRIEF-V rule). Resumable per judge.
 *
 *   bun run scripts/run-study-v-judge.ts [--concurrency 4]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RewriteTask } from "../src/corpus/rewrite.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import {
	judgeBothOrders,
	PRIMARY_JUDGE,
	SENSITIVITY_JUDGE,
} from "../src/judging/judge.js";

const EDITORS = ["anthropic/claude-sonnet-4.5", "google/gemini-3.5-flash"];
const ARMS = ["V-doc-view1", "V-doc-view2", "V-conv-memo", "V-conv-nomemo"];

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}
const concurrency = Number(arg("concurrency", "4"));

const corpus = JSON.parse(readFileSync("corpus/rewrite.json", "utf8")) as {
	tasks: RewriteTask[];
};
const taskById = new Map(corpus.tasks.map((t) => [t.id, t]));

const edits: TaskRunRecord[] = [];
for (const model of EDITORS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const path = `results/raw/studyv-edits-${slug}.jsonl`;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (line.trim()) edits.push(JSON.parse(line) as TaskRunRecord);
	}
}
const editByKey = new Map(
	edits.map((r) => [`${r.taskId}::${r.condition}::${r.model}`, r]),
);

interface Comparison {
	taskId: string;
	editorModel: string;
	arm: string;
	kind: "judged" | "auto-arm-loses" | "auto-arm-wins" | "excluded-both-failed";
}

const comparisons: Comparison[] = [];
for (const task of corpus.tasks) {
	for (const editorModel of EDITORS) {
		const control = editByKey.get(`${task.id}::V-instr::${editorModel}`);
		for (const arm of ARMS) {
			const record = editByKey.get(`${task.id}::${arm}::${editorModel}`);
			if (!control || !record) continue;
			let kind: Comparison["kind"];
			if (control.success && record.success) kind = "judged";
			else if (control.success && !record.success) kind = "auto-arm-loses";
			else if (!control.success && record.success) kind = "auto-arm-wins";
			else kind = "excluded-both-failed";
			comparisons.push({ taskId: task.id, editorModel, arm, kind });
		}
	}
}

for (const judge of [PRIMARY_JUDGE, SENSITIVITY_JUDGE]) {
	const slug = judge.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyv-judge-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = new Set<string>();
	if (existsSync(outPath)) {
		for (const line of readFileSync(outPath, "utf8").split("\n")) {
			if (!line.trim()) continue;
			const r = JSON.parse(line) as {
				taskId: string;
				editorModel: string;
				arm: string;
			};
			done.add(`${r.taskId}::${r.editorModel}::${r.arm}`);
		}
	}
	const queue = comparisons.filter(
		(c) => !done.has(`${c.taskId}::${c.editorModel}::${c.arm}`),
	);
	console.log(`\n=== ${judge} → ${outPath} (${queue.length} comparisons)`);

	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const c = queue[cursor] as Comparison;
			cursor += 1;
			try {
				let out: Record<string, unknown>;
				if (c.kind !== "judged") {
					out = { ...c, verdict: c.kind };
				} else {
					const task = taskById.get(c.taskId) as RewriteTask;
					const armRewrite = String(
						editByKey.get(`${c.taskId}::${c.arm}::${c.editorModel}`)?.detail
							?.rewrite,
					);
					const controlRewrite = String(
						editByKey.get(`${c.taskId}::V-instr::${c.editorModel}`)?.detail
							?.rewrite,
					);
					// A = the arm under test, B = the control.
					const result = await judgeBothOrders(
						judge,
						task.thesis,
						task.original,
						armRewrite,
						controlRewrite,
					);
					out = { ...c, ...result };
				}
				appendFileSync(outPath, `${JSON.stringify(out)}\n`);
				console.log(
					`  ${c.taskId} ${c.editorModel.split("/")[1]} ${c.arm}: ${String(out.verdict)}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(`  ${c.taskId} × ${c.arm}: ERROR ${message}`);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, worker),
	);
}
console.log("\nStudy V judging complete.");
