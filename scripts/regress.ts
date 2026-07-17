/**
 * The regression-gate suite (docs/REGRESSION.md): re-runs the
 * benchmark's shipped-guardrail gates against any gateway model id.
 * Run it before a tier swap, after a provider snapshot change, or on
 * a low cadence. Slices, constructions, and thresholds are registered
 * in docs/REGRESSION.md and encoded in src/regression/gates.ts.
 *
 *   bun run scripts/regress.ts --model anthropic/claude-opus-4.8
 *     [--gates dialect,views,...] [--concurrency 3] [--run 20260715]
 *
 * Raw records land in results/regression/raw/<slug>-<run>-<gate>.jsonl
 * (gitignored, resumable within a run label; a new run label re-tests
 * from scratch — the default label is today's date, so re-running on a
 * later day measures the model fresh instead of resuming old records).
 * The committed artifact is the summary: results/regression/<slug>-<run>.txt
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { conditionF } from "../src/conditions/f.js";
import { makeHtmlViewCondition } from "../src/conditions/views-html.js";
import type { XTask } from "../src/corpus/anaphora.js";
import type { WTask } from "../src/corpus/callbacks-w.js";
import type { ConflictTask } from "../src/corpus/conflict.js";
import type { DependentTask } from "../src/corpus/dependent.js";
import type { CalibrationTask } from "../src/corpus/ladder.js";
import type { IntegrityTask, MemoScaleTask } from "../src/corpus/memoscale.js";
import type { SessionCorpus, SessionTask } from "../src/corpus/sessions.js";
import type { StandingTask } from "../src/corpus/standing.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import { runXSession } from "../src/harness/anaphora-runner.js";
import { runAskTask } from "../src/harness/ask-runner.js";
import { runConflictTask } from "../src/harness/conflict-runner.js";
import { runLadderTask } from "../src/harness/ladder-runner.js";
import { runWSession } from "../src/harness/memo-runner.js";
import {
	runMemoIntegrityTask,
	runMemoReadTask,
} from "../src/harness/memoscale-runner.js";
import type { TaskRunRecord } from "../src/harness/records.js";
import { loadExistingKeys, runTask } from "../src/harness/runner.js";
import { runSearchTask } from "../src/harness/search-runner.js";
import { runSession } from "../src/harness/session-runner.js";
import { runStandingTask } from "../src/harness/standing-runner.js";
import type { GateResult } from "../src/regression/gates.js";
import { GATES, gateById } from "../src/regression/gates.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "60000";

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const model = arg("model", "");
if (model === "") {
	console.error("usage: bun run scripts/regress.ts --model <gateway-model-id>");
	process.exit(1);
}
const concurrency = Number(arg("concurrency", "3"));
const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const runLabel = arg("run", today);
const gateIds = arg("gates", GATES.map((g) => g.id).join(",")).split(",");
for (const id of gateIds) gateById(id); // validate early

const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
const rawDir = "results/regression/raw";
mkdirSync(rawDir, { recursive: true });
mkdirSync("results/regression", { recursive: true });

function rawPath(gate: string): string {
	return `${rawDir}/${slug}-${runLabel}-${gate}.jsonl`;
}

function loadRecords(path: string): TaskRunRecord[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as TaskRunRecord);
}

/** First n tasks per bucket, in corpus order (the registered slices). */
function firstPerBucket<T extends { bucket: string }>(
	tasks: T[],
	n: number,
): T[] {
	const taken = new Map<string, number>();
	const out: T[] = [];
	for (const task of tasks) {
		const count = taken.get(task.bucket) ?? 0;
		if (count < n) {
			taken.set(task.bucket, count + 1);
			out.push(task);
		}
	}
	return out;
}

interface Cell {
	key: string;
	label: string;
	run: () => Promise<TaskRunRecord[]>;
}

/** Run cells through a worker pool, appending records as they land. */
async function runCells(
	gate: string,
	cells: Cell[],
	pool: number,
): Promise<void> {
	const outPath = rawPath(gate);
	const pending = cells;
	console.log(`\n== gate ${gate}: ${pending.length} cells to run → ${outPath}`);
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < pending.length) {
			const cell = pending[cursor] as Cell;
			cursor += 1;
			try {
				const records = await cell.run();
				for (const record of records) {
					appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				}
				const ok = records.filter((r) => r.success).length;
				console.log(`  ${cell.label}: ${ok}/${records.length}`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(`  ${cell.label}: ERROR ${message} (retryable)`);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(pool, pending.length) }, worker),
	);
}

function sessionDone(
	outPath: string,
	sessionId: string,
	condition: string,
	steps: number,
): boolean {
	const records = loadRecords(outPath).filter(
		(r) =>
			r.taskId.startsWith(`${sessionId}:`) &&
			r.condition === condition &&
			r.model === model,
	);
	if (records.length === steps) return true;
	if (records.length > 0) {
		throw new Error(
			`Partial session ${sessionId} × ${condition} (${records.length}/${steps} steps) in ${outPath} — strip its records before resuming.`,
		);
	}
	return false;
}

// ---- cell builders per gate ----

function buildDialectCells(): Cell[] {
	const corpus = JSON.parse(readFileSync("corpus/main.json", "utf8")) as Corpus;
	const tasks = firstPerBucket(corpus.tasks as TransformationTask[], 5);
	const done = loadExistingKeys(rawPath("dialect"));
	return tasks
		.filter((t) => !done.has(`${t.id}::F::${model}::parity`))
		.map((task) => ({
			key: task.id,
			label: `${task.id} × F`,
			run: async () => [await runTask(task, conditionF, model, "parity")],
		}));
}

function buildViewsCells(): Cell[] {
	const corpus = JSON.parse(
		readFileSync("corpus/size-extension.json", "utf8"),
	) as Corpus;
	const tasks = (corpus.tasks as TransformationTask[]).filter(
		(t) => t.bucket === "xxxl",
	);
	const done = loadExistingKeys(rawPath("views"));
	return tasks
		.filter((t) => !done.has(`${t.id}::FVH::${model}::parity`))
		.map((task) => ({
			key: task.id,
			label: `${task.id} × FVH`,
			run: async () => [
				await runTask(
					task,
					makeHtmlViewCondition("focused", task.edit),
					model,
					"parity",
				),
			],
		}));
}

function buildSearchCells(): Cell[] {
	const corpus = JSON.parse(
		readFileSync("corpus/grounded.json", "utf8"),
	) as Corpus;
	const tasks = firstPerBucket(corpus.tasks as TransformationTask[], 5);
	const done = loadExistingKeys(rawPath("search"));
	return tasks
		.filter((t) => !done.has(`${t.id}::N-search::${model}::parity`))
		.map((task) => ({
			key: task.id,
			label: `${task.id} × N-search`,
			run: async () => [await runSearchTask(task, model)],
		}));
}

function buildAskCells(gate: "focus-solve" | "ask-hatch"): Cell[] {
	const corpus = JSON.parse(readFileSync("corpus/dependent.json", "utf8")) as {
		tasks: DependentTask[];
	};
	const combos: { view: "view1" | "view2"; arm: "AC-base" | "AC-rule" }[] =
		gate === "focus-solve"
			? [{ view: "view2", arm: "AC-base" }]
			: [
					{ view: "view1", arm: "AC-rule" },
					{ view: "view2", arm: "AC-rule" },
				];
	const done = loadExistingKeys(rawPath(gate));
	const cells: Cell[] = [];
	for (const task of corpus.tasks) {
		for (const combo of combos) {
			const conditionId = `${combo.arm}-${combo.view}`;
			if (done.has(`${task.id}::${conditionId}::${model}::parity`)) continue;
			cells.push({
				key: `${task.id}-${conditionId}`,
				label: `${task.id} × ${conditionId}`,
				run: async () => [await runAskTask(task, combo.view, combo.arm, model)],
			});
		}
	}
	return cells;
}

function buildEchoCells(): Cell[] {
	const corpus = JSON.parse(
		readFileSync("corpus/sessions-anaphora.json", "utf8"),
	) as { sessions: XTask[] };
	const outPath = rawPath("echo");
	return corpus.sessions
		.filter((s) => !sessionDone(outPath, s.id, "X-lastedit", s.steps.length))
		.map((task) => ({
			key: task.id,
			label: `${task.id} × X-lastedit`,
			run: () => runXSession(task, "X-lastedit", model),
		}));
}

function buildMemoBlockCells(): Cell[] {
	const corpus = JSON.parse(
		readFileSync("corpus/sessions-callback.json", "utf8"),
	) as SessionCorpus;
	const sessions = corpus.sessions.slice(0, 10);
	const outPath = rawPath("memo-block");
	return sessions
		.filter(
			(s: SessionTask) =>
				!sessionDone(outPath, s.id, "T-notes", s.steps.length),
		)
		.map((task: SessionTask) => ({
			key: task.id,
			label: `${task.id} × T-notes`,
			run: () => runSession(task, "notes", model),
		}));
}

function buildMemoAgentCells(): Cell[] {
	const corpus = JSON.parse(
		readFileSync("corpus/sessions-callback-long.json", "utf8"),
	) as { sessions: WTask[] };
	const sessions = corpus.sessions.slice(0, 6);
	const outPath = rawPath("memo-agent");
	return sessions
		.filter((s) => !sessionDone(outPath, s.id, "W-agent", s.steps.length))
		.map((task) => ({
			key: task.id,
			label: `${task.id} × W-agent`,
			run: () => runWSession(task, "W-agent", model),
		}));
}

function buildPrecedenceCells(): Cell[] {
	const corpus = JSON.parse(readFileSync("corpus/conflict.json", "utf8")) as {
		tasks: ConflictTask[];
	};
	const tasks = corpus.tasks.filter((t) => t.kind !== "rr");
	const done = loadExistingKeys(rawPath("precedence"));
	return tasks
		.filter((t) => !done.has(`${t.id}::AB-clause::${model}::parity`))
		.map((task) => ({
			key: task.id,
			label: `${task.id} × AB-clause`,
			run: async () => [await runConflictTask(task, "AB-clause", model)],
		}));
}

function buildStandingCells(): Cell[] {
	const corpus = JSON.parse(readFileSync("corpus/standing.json", "utf8")) as {
		tasks: StandingTask[];
	};
	const tasks = corpus.tasks.filter((t) => t.kind !== "combined");
	const done = loadExistingKeys(rawPath("standing-pack"));
	return tasks
		.filter((t) => !done.has(`${t.id}::Z-full::${model}::parity`))
		.map((task) => ({
			key: task.id,
			label: `${task.id} × Z-full`,
			run: async () => [await runStandingTask(task, "Z-full", model)],
		}));
}

function buildMemoScaleCells(): Cell[] {
	const corpus = JSON.parse(readFileSync("corpus/memo-scale.json", "utf8")) as {
		tasks: MemoScaleTask[];
		integrity: IntegrityTask[];
	};
	const done = loadExistingKeys(rawPath("memo-scale"));
	const cells: Cell[] = [];
	for (const task of corpus.tasks.filter(
		(t) => t.kind === "recall" && t.nLevel === 20,
	)) {
		if (done.has(`${task.id}::AH-recall-n20::${model}::parity`)) continue;
		cells.push({
			key: task.id,
			label: `${task.id}`,
			run: async () => [await runMemoReadTask(task, model)],
		});
	}
	for (const task of corpus.integrity.filter((t) => t.kLevel === 19)) {
		if (done.has(`${task.id}::AH-integrity-k19::${model}::parity`)) continue;
		cells.push({
			key: task.id,
			label: `${task.id}`,
			run: async () => [await runMemoIntegrityTask(task, model)],
		});
	}
	// Study AK amendment (2026-07-17): the K=20 cap edge through the
	// v3.213.0 eviction pipeline (goal-safe on the opus baseline).
	for (const task of corpus.integrity.filter((t) => t.kLevel === 20)) {
		if (done.has(`${task.id}::AK-eviction-k20::${model}::parity`)) continue;
		cells.push({
			key: `${task.id}-eviction`,
			label: `${task.id} eviction`,
			run: async () => [await runMemoIntegrityTask(task, model, "AK-eviction")],
		});
	}
	return cells;
}

function buildAskCalibrationCells(): Cell[] {
	const corpus = JSON.parse(
		readFileSync("corpus/calibration.json", "utf8"),
	) as { tasks: CalibrationTask[] };
	const done = loadExistingKeys(rawPath("ask-calibration"));
	const cells: Cell[] = [];
	for (const task of corpus.tasks.filter(
		(t) => t.level === 0 || t.level === 4,
	)) {
		const conditionId = `AE-rule-l${task.level}`;
		if (done.has(`${task.id}::${conditionId}::${model}::parity`)) continue;
		cells.push({
			key: task.id,
			label: `${task.id} × AE-rule`,
			run: async () => [await runLadderTask(task, "AE-rule", model)],
		});
	}
	return cells;
}

function buildAnaphoraHatchCells(): Cell[] {
	const corpus = JSON.parse(
		readFileSync("corpus/sessions-anaphora.json", "utf8"),
	) as { sessions: XTask[] };
	const outPath = rawPath("anaphora-hatch");
	return corpus.sessions
		.slice(0, 6)
		.filter(
			(t) => !sessionDone(outPath, t.id, "AG-stateless-hatch", t.steps.length),
		)
		.map((task) => ({
			key: task.id,
			label: `${task.id} × AG-stateless-hatch`,
			run: () => runXSession(task, "AG-stateless-hatch", model),
		}));
}

const BUILDERS: Record<string, () => Cell[]> = {
	dialect: buildDialectCells,
	views: buildViewsCells,
	search: buildSearchCells,
	"focus-solve": () => buildAskCells("focus-solve"),
	"ask-hatch": () => buildAskCells("ask-hatch"),
	echo: buildEchoCells,
	"memo-block": buildMemoBlockCells,
	"memo-agent": buildMemoAgentCells,
	precedence: buildPrecedenceCells,
	"standing-pack": buildStandingCells,
	"memo-scale": buildMemoScaleCells,
	"ask-calibration": buildAskCalibrationCells,
	"anaphora-hatch": buildAnaphoraHatchCells,
};

// Pack-grouped protocols (Z and AB cache layouts) run their cells
// sequentially; everything else uses the worker pool.
const SEQUENTIAL = new Set(["precedence", "standing-pack"]);

console.log(
	`# regression-gate suite — model ${model}, run ${runLabel}, gates: ${gateIds.join(", ")}`,
);

for (const gateId of gateIds) {
	const builder = BUILDERS[gateId];
	if (!builder) throw new Error(`no builder for gate ${gateId}`);
	const cells = builder();
	if (cells.length === 0) {
		console.log(`\n== gate ${gateId}: all cells already recorded`);
		continue;
	}
	await runCells(gateId, cells, SEQUENTIAL.has(gateId) ? 1 : concurrency);
}

// ---- evaluate and write the summary ----

const lines: string[] = [];
function emit(line: string): void {
	lines.push(line);
	console.log(line);
}

emit(`\n# regression-gate summary — ${model} (run ${runLabel})`);
emit(
	"# thresholds registered in docs/REGRESSION.md — never adjusted post-hoc\n",
);

const results: GateResult[] = [];
let inTokens = 0;
let outTokens = 0;
for (const gateId of gateIds) {
	const gate = gateById(gateId);
	const records = loadRecords(rawPath(gateId)).filter((r) => r.model === model);
	inTokens += records.reduce((s, r) => s + r.totalInputTokens, 0);
	outTokens += records.reduce((s, r) => s + r.totalOutputTokens, 0);
	const result = gate.evaluate(records);
	results.push(result);
	const status = result.incomplete
		? "INCOMPLETE"
		: result.pass
			? "PASS"
			: "FAIL";
	emit(`${status.padEnd(11)} ${gate.id} — ${gate.title}`);
	emit(
		`            protects: ${gate.protects} (source: Study ${gate.sourceStudy})`,
	);
	for (const check of result.checks) {
		emit(
			`            ${check.pass ? "ok " : "RED"} ${check.name}: ${check.value} vs ${check.threshold}`,
		);
	}
}

const complete = results.filter((r) => !r.incomplete);
const passed = complete.filter((r) => r.pass);
emit(
	`\nsuite: ${passed.length}/${complete.length} gates pass` +
		(complete.length < results.length
			? ` (${results.length - complete.length} incomplete — re-run to finish)`
			: ""),
);
emit(
	`tokens: ${inTokens.toLocaleString()} in + ${outTokens.toLocaleString()} out`,
);

const summaryPath = `results/regression/${slug}-${runLabel}.txt`;
await Bun.write(summaryPath, `${lines.join("\n")}\n`);
console.log(`\nsummary written → ${summaryPath}`);
if (complete.length === results.length && passed.length < complete.length) {
	process.exit(2);
}
