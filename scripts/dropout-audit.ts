/**
 * Study G, Phase A: re-run the main-study reference-family cells for
 * the two dropout-prone models × tools conditions with transcript
 * capture, then classify every phase-2 failure deterministically from
 * the transcript. See docs/BRIEF-G.md.
 *
 *   bun run scripts/dropout-audit.ts            # run + classify
 *   bun run scripts/dropout-audit.ts --classify # classify existing only
 */
import { readFileSync } from "node:fs";
import { conditionC } from "../src/conditions/c.js";
import { conditionD } from "../src/conditions/d.js";
import type { Corpus } from "../src/corpus/tasks.js";
import type { TaskRunRecord } from "../src/harness/records.js";

process.env.BENCH_LOG_TRANSCRIPTS = "1";
const { runAll } = await import("../src/harness/runner.js");

const MODELS = ["anthropic/claude-haiku-4.5", "google/gemini-3.5-flash"];
const classifyOnly = process.argv.includes("--classify");

const corpus = JSON.parse(readFileSync("corpus/main.json", "utf8")) as Corpus;
const tasks = corpus.tasks.filter((t) => t.family === "reference");

const paths: string[] = [];
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/dropout-audit-${slug}.jsonl`;
	paths.push(outPath);
	if (!classifyOnly) {
		console.log(`\n=== ${model} → ${outPath}`);
		await runAll({
			model,
			regime: "parity",
			conditions: [conditionC, conditionD],
			tasks,
			outPath,
			concurrency: 5,
		});
	}
}

// ---- classification ----

interface TranscriptPart {
	type?: string;
	tool?: string;
	input?: string;
}
interface TranscriptMessage {
	role: string;
	text?: string;
	parts?: TranscriptPart[];
}

type Mode =
	| "no-tool-call"
	| "duplicate-insert"
	| "wrong-target"
	| "other-tool"
	| "right-call-other-failure";

function classify(record: TaskRunRecord): Mode | null {
	const transcript = record.detail?.transcript as
		| TranscriptMessage[]
		| undefined;
	if (!transcript) return null;
	const referencedId = record.detail?.referencedId as string | undefined;
	// Everything after the LAST user message is the final phase-2 attempt.
	let lastUser = -1;
	transcript.forEach((m, i) => {
		if (m.role === "user") lastUser = i;
	});
	const finalCalls: TranscriptPart[] = [];
	for (const m of transcript.slice(lastUser + 1)) {
		for (const part of m.parts ?? []) {
			if (part.type === "tool-call") finalCalls.push(part);
		}
	}
	if (finalCalls.length === 0) return "no-tool-call";
	if (finalCalls.some((c) => c.tool === "insertNode")) {
		return "duplicate-insert";
	}
	const setAttrs = finalCalls.filter((c) => c.tool === "setAttribute");
	if (setAttrs.length > 0) {
		const hitsTarget = setAttrs.some(
			(c) =>
				referencedId !== undefined && c.input?.includes(`"${referencedId}"`),
		);
		return hitsTarget ? "right-call-other-failure" : "wrong-target";
	}
	return "other-tool";
}

console.log("\n# Phase A classification (phase-2 failures, phase 1 correct)");
for (const path of paths) {
	const records = readFileSync(path, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as TaskRunRecord);
	const failures = records.filter(
		(r) =>
			!r.success && r.detail?.phase1Correct === true && r.error === undefined,
	);
	const counts = new Map<string, number>();
	for (const record of failures) {
		const mode = classify(record) ?? "no-transcript";
		counts.set(mode, (counts.get(mode) ?? 0) + 1);
	}
	const ok = records.filter((r) => r.success).length;
	console.log(
		`\n${path}: ${records.length} records, ${ok} passed, ${failures.length} phase-2 failures`,
	);
	for (const [mode, count] of [...counts].sort((a, b) => b[1] - a[1])) {
		console.log(`  ${mode}: ${count}`);
	}
}
