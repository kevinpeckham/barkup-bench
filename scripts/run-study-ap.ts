/**
 * Study AP scored runs (docs/BRIEF-AP.md): the off-catalog fork.
 * Arms: AP-shipped / AP-fork / AP-empty / AP-tool — all carry
 * tags_list + one warning round; AP-tool adds the guarded tag_create.
 *
 *   bun run scripts/run-study-ap.ts [--models a,b,c] [--concurrency 4]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelMessage } from "ai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { ApArm, ApClass } from "../src/grading/tag-steering-ap.js";
import { CellCatalog, scoreCell } from "../src/grading/tag-steering-ap.js";
import type { TaskRunRecord } from "../src/harness/records.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "8000";

const DEFAULT_MODELS = [
	"google/gemini-3.5-flash",
	"anthropic/claude-sonnet-4.5",
	"anthropic/claude-opus-4.8",
];
const ARMS = ["AP-shipped", "AP-fork", "AP-empty", "AP-tool"] as const;

interface TagTask {
	id: string;
	cls: ApClass;
	title: string;
	summary: string;
	expectedTags: string[];
	acceptableTags?: string[];
}
const corpus = JSON.parse(
	readFileSync("corpus/tag-steering-ap.json", "utf8"),
) as {
	catalog: { name: string; category: string }[];
	tasks: TagTask[];
};

/** Registered shipped tool description, verbatim (BRIEF-AO/BRIEF-AP). */
const TAGS_LIST_DESCRIPTION =
	"The organization's canonical tag catalog. ALWAYS pick article frontmatter tags from this list (exact names — casing matters); non-canonical tags trigger schema warnings on save. Tags are managed by humans in Org Settings → Tags.";

/** Registered candidate ship texts, verbatim (BRIEF-AP §Arms). */
const FORK_TEXT =
	"If no specific canonical tag fits the article, choose the nearest GENERAL canonical tags that are still genuinely relevant (a niche technique still belongs to its field's general tag). If nothing in the catalog is even generally relevant, return an empty tags list — do not stretch unrelated tags and do not invent new ones.";
const EMPTY_TEXT =
	"Only use tags that genuinely fit the article. If no canonical tag genuinely fits, return an empty tags list — do not stretch loosely-related tags and do not invent new ones.";
const TAG_CREATE_DESCRIPTION =
	"Create a new canonical tag in the organization's catalog. Use ONLY after checking tags_list and finding no canonical tag that fits — never create a tag when an existing canonical tag (or a casing/format variant of one) covers the topic. Match the catalog's naming style (e.g. Title Case for general topics, exact brand casing for products). Tags you create become canonical and reusable by the whole org.";

function tagsListDescription(arm: ApArm): string {
	if (arm === "AP-fork") return `${TAGS_LIST_DESCRIPTION} ${FORK_TEXT}`;
	if (arm === "AP-empty") return `${TAGS_LIST_DESCRIPTION} ${EMPTY_TEXT}`;
	return TAGS_LIST_DESCRIPTION;
}

const SYSTEM = `You are a publishing agent for an organization's CMS. Given an article's title and summary, propose the frontmatter tags for it. Reply with ONLY a JSON object of the form {"tags": ["...", "..."]} and nothing else.`;

function userMessage(task: TagTask): string {
	return `Article title: ${task.title}\nSummary: ${task.summary}\n\nPropose the frontmatter tags. Reply with ONLY {"tags": [...]}.`;
}

function parseTags(text: string): string[] | null {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	try {
		const parsed = JSON.parse(match[0]) as { tags?: unknown };
		if (!Array.isArray(parsed.tags)) return null;
		return parsed.tags.filter((t): t is string => typeof t === "string");
	} catch {
		return null;
	}
}

async function runCell(
	task: TagTask,
	arm: ApArm,
	model: string,
): Promise<TaskRunRecord> {
	const record: TaskRunRecord = {
		taskId: task.id,
		family: "tag-steering",
		bucket: task.cls,
		condition: arm,
		model,
		regime: "parity",
		success: false,
		firstPassValid: null,
		passAt1: false,
		rounds: 0,
		drift: null,
		idRefFailure: null,
		toolErrorCount: null,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		totalLatencyMs: 0,
		calls: [],
	};
	const detail: Record<string, unknown> = { cls: task.cls };
	record.detail = detail;

	const catalog = new CellCatalog(corpus.catalog);
	let tagsListCalls = 0;
	// Loosely typed: the ai SDK's Tool type rejects assignment under
	// exactOptionalPropertyTypes; the generateText call casts the whole
	// options object (same pattern as the AO runner).
	const tools: Record<string, unknown> = {
		tags_list: tool({
			description: tagsListDescription(arm),
			inputSchema: z.object({}),
			execute: async () => {
				tagsListCalls += 1;
				return JSON.stringify({
					count: corpus.catalog.length,
					tags: corpus.catalog,
				});
			},
		}),
	};
	if (arm === "AP-tool") {
		tools.tag_create = tool({
			description: TAG_CREATE_DESCRIPTION,
			inputSchema: z.object({
				name: z.string(),
				category: z.enum(["capability", "industry", "other"]),
			}),
			execute: async ({ name }: { name: string; category: string }) => {
				const result = catalog.mint(name);
				return JSON.stringify(
					result.ok
						? { created: { name: name.trim() } }
						: { error: result.error },
				);
			},
		});
	}

	const messages: ModelMessage[] = [
		{ role: "user", content: userMessage(task) },
	];
	let finalTags: string[] | null = null;
	for (let round = 1; round <= 2; round += 1) {
		const started = performance.now();
		const result = await generateText({
			model,
			system: SYSTEM,
			messages,
			temperature: 0,
			maxRetries: 4,
			maxOutputTokens: 8000,
			stopWhen: stepCountIs(4),
			tools,
		} as Parameters<typeof generateText>[0]);
		messages.push(
			...(result.steps.flatMap(
				(step) => step.response.messages,
			) as ModelMessage[]),
		);
		record.calls.push({
			phase: 1,
			round,
			inputTokens: result.totalUsage.inputTokens ?? 0,
			outputTokens: result.totalUsage.outputTokens ?? 0,
			latencyMs: Math.round(performance.now() - started),
			issueCodes: [],
		});
		const tags = parseTags(result.text);
		if (round === 1) {
			detail.firstTags = tags;
			record.firstPassValid = tags !== null;
		}
		finalTags = tags;
		// Warning round: the shipped flow — after round 1 only, only when
		// warnings fire against the cell's live catalog (incl. mints).
		if (round === 1 && tags) {
			const warnings = catalog.lint(tags);
			if (warnings.length > 0) {
				detail.firstWarnings = warnings.length;
				messages.push({
					role: "user",
					content: `The save returned schemaWarnings:\n${JSON.stringify(warnings, null, 1)}\nRevise the tags and reply with ONLY {"tags": [...]}.`,
				});
				continue;
			}
		}
		break;
	}

	const score = scoreCell({
		cls: task.cls,
		arm,
		finalTags,
		catalog,
		acceptableTags: task.acceptableTags,
	});
	detail.finalTags = finalTags;
	detail.tagsListCalls = tagsListCalls;
	detail.mints = catalog.mints;
	detail.mintAttempts = catalog.mintAttempts;
	detail.mintRejections = catalog.mintRejections;
	detail.conformant = score.conformant;
	detail.canonicalClean = score.canonicalClean;
	detail.empty = score.empty;
	detail.inventedCount = score.inventedCount;
	record.rounds = record.calls.length;
	record.totalInputTokens = record.calls.reduce((s, c) => s + c.inputTokens, 0);
	record.totalOutputTokens = record.calls.reduce(
		(s, c) => s + c.outputTokens,
		0,
	);
	record.totalLatencyMs = record.calls.reduce((s, c) => s + c.latencyMs, 0);
	// success mirrors the conformance bit; the registered no-gate cell
	// class (AP-shipped × foreign) records false here and null in detail.
	record.success = score.conformant === true;
	record.passAt1 = record.success && record.rounds === 1;
	return record;
}

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}
const models = arg("models", DEFAULT_MODELS.join(",")).split(",");
const concurrency = Number(arg("concurrency", "4"));

for (const model of models) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const outPath = `results/raw/studyap-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = new Set<string>();
	if (existsSync(outPath)) {
		for (const line of readFileSync(outPath, "utf8").split("\n")) {
			if (line.trim() === "") continue;
			const r = JSON.parse(line) as TaskRunRecord;
			done.add(`${r.taskId}|${r.condition}`);
		}
	}
	const queue: { task: TagTask; arm: ApArm }[] = [];
	for (const task of corpus.tasks) {
		for (const arm of ARMS) {
			if (!done.has(`${task.id}|${arm}`)) queue.push({ task, arm });
		}
	}
	console.log(`\n=== ${model} → ${outPath} (${queue.length} cells)`);
	let cursor = 0;
	let conformant = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			try {
				const record = await runCell(item.task, item.arm, model);
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				if (record.success) conformant += 1;
			} catch (error) {
				console.log(
					`  ${item.task.id} × ${item.arm}: ERROR ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	};
	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	console.log(`=== done: ${conformant} conformant cells`);
}
