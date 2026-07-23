/**
 * Study AO scored runs (docs/BRIEF-AO.md): canonical-tag steering.
 * Arms: AO-bare / AO-shipped (tags_list tool + one warning round) /
 * AO-warnings-only. Single call + at most one feedback round.
 *
 *   bun run scripts/run-study-ao.ts [--models a,b,c] [--concurrency 4]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelMessage } from "ai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { TaskRunRecord } from "../src/harness/records.js";

process.env.BENCH_MAX_OUTPUT_TOKENS = "8000";

const DEFAULT_MODELS = [
	"google/gemini-3.5-flash",
	"anthropic/claude-sonnet-4.5",
	"anthropic/claude-opus-4.8",
];
const ARMS = ["AO-bare", "AO-shipped", "AO-warnings-only"] as const;
type Arm = (typeof ARMS)[number];

interface TagTask {
	id: string;
	cls: "covered" | "trap" | "uncovered";
	title: string;
	summary: string;
	expectedTags: string[];
}
const corpus = JSON.parse(readFileSync("corpus/tag-steering.json", "utf8")) as {
	catalog: { name: string; category: string }[];
	tasks: TagTask[];
};
const CATALOG_NAMES = new Set(corpus.catalog.map((t) => t.name));

/** Shipped slug algorithm (replicator tagCatalogLint.tagSlug, verbatim). */
function tagSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[™®©]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}
const BY_SLUG = new Map(corpus.catalog.map((t) => [tagSlug(t.name), t.name]));

/** Shipped lint, ported verbatim (message strings registered in the brief). */
function lintTags(tags: unknown): { message: string; path: string }[] {
	if (!Array.isArray(tags)) return [];
	const warnings: { message: string; path: string }[] = [];
	tags.forEach((entry, index) => {
		if (typeof entry !== "string" || !entry.trim()) return;
		if (CATALOG_NAMES.has(entry)) return;
		const canonical = BY_SLUG.get(tagSlug(entry));
		warnings.push({
			message: canonical
				? `"${entry}" is not a canonical tag — did you mean "${canonical}"?`
				: `"${entry}" is not a canonical tag — pick from tags_list, or add it in Org Settings → Tags`,
			path: `tags.${index}`,
		});
	});
	return warnings;
}

/** Registered shipped tool description, verbatim. */
const TAGS_LIST_DESCRIPTION =
	"The organization's canonical tag catalog. ALWAYS pick article frontmatter tags from this list (exact names — casing matters); non-canonical tags trigger schema warnings on save. Tags are managed by humans in Org Settings → Tags.";

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
	arm: Arm,
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

	let toolCalls = 0;
	const tools =
		arm === "AO-shipped"
			? {
					tags_list: tool({
						description: TAGS_LIST_DESCRIPTION,
						inputSchema: z.object({}),
						execute: async () => {
							toolCalls += 1;
							return JSON.stringify({
								count: corpus.catalog.length,
								tags: corpus.catalog,
							});
						},
					}),
				}
			: undefined;

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
			...(tools ? { stopWhen: stepCountIs(4), tools } : {}),
		} as Parameters<typeof generateText>[0]);
		messages.push(
			...(tools
				? (result.steps.flatMap(
						(step) => step.response.messages,
					) as ModelMessage[])
				: [{ role: "assistant" as const, content: result.text }]),
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
		// Warning round: only in warned arms, only after round 1, only
		// when warnings fire.
		if (round === 1 && arm !== "AO-bare" && tags) {
			const warnings = lintTags(tags);
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

	detail.finalTags = finalTags;
	detail.toolCalls = toolCalls;
	record.rounds = record.calls.length;
	record.totalInputTokens = record.calls.reduce((s, c) => s + c.inputTokens, 0);
	record.totalOutputTokens = record.calls.reduce(
		(s, c) => s + c.outputTokens,
		0,
	);
	record.totalLatencyMs = record.calls.reduce((s, c) => s + c.latencyMs, 0);

	// Clean cell: non-empty final tags, every one an exact catalog name.
	record.success =
		finalTags !== null &&
		finalTags.length > 0 &&
		finalTags.every((t) => CATALOG_NAMES.has(t));
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
	const outPath = `results/raw/studyao-${slug}.jsonl`;
	mkdirSync(dirname(outPath), { recursive: true });
	const done = new Set<string>();
	if (existsSync(outPath)) {
		for (const line of readFileSync(outPath, "utf8").split("\n")) {
			if (line.trim() === "") continue;
			const r = JSON.parse(line) as TaskRunRecord;
			done.add(`${r.taskId}|${r.condition}`);
		}
	}
	const queue: { task: TagTask; arm: Arm }[] = [];
	for (const task of corpus.tasks) {
		for (const arm of ARMS) {
			if (!done.has(`${task.id}|${arm}`)) queue.push({ task, arm });
		}
	}
	console.log(`\n=== ${model} → ${outPath} (${queue.length} cells)`);
	let cursor = 0;
	let passed = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const item = queue[cursor] as (typeof queue)[number];
			cursor += 1;
			try {
				const record = await runCell(item.task, item.arm, model);
				appendFileSync(outPath, `${JSON.stringify(record)}\n`);
				if (record.success) passed += 1;
			} catch (error) {
				console.log(
					`  ${item.task.id} × ${item.arm}: ERROR ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	};
	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	console.log(`=== done: ${passed} clean cells`);
}
