/**
 * Fill construction-task specs using the held-out describer model, with
 * the two-stage audit the pilot showed is necessary (1 of 4 pilot specs
 * was hallucinated):
 *
 *   1. mechanical audit — every node name, every string/number
 *      attribute value, and every json-array element must appear
 *      verbatim in the spec; every attribute key must be mentioned;
 *   2. rebuild audit — the describer's own family rebuilds the tree
 *      from the spec (as JSON); the rebuild must equal the target
 *      modulo ids.
 *
 * On failure the spec is regenerated with the audit findings appended
 * (up to 3 attempts). A task whose spec never passes is marked
 * specVerified: false and EXCLUDED from scored runs (reported).
 * All of this happens at corpus time, before any scored run.
 *
 *   bun run describe <corpus/pilot.json|corpus/main.json|corpus/dev.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { generateText } from "ai";
import { formatSection } from "../src/conditions/shared.js";
import { DESCRIBER_SYSTEM, describerPrompt } from "../src/corpus/describe.js";
import type { Corpus } from "../src/corpus/tasks.js";
import { equalModuloAllIds } from "../src/grading/equal.js";
import { BENCH_CONFIG } from "../src/grammar.js";
import { walkTree } from "../src/tree.js";
import { parseJsonTree } from "../src/twin/validate.js";

const DESCRIBER_MODEL = process.env.DESCRIBER_MODEL ?? "xai/grok-4.3";
const MAX_ATTEMPTS = 3;

const corpusPath = process.argv[2] ?? "corpus/pilot.json";

/** Mechanical audit: content the spec must contain verbatim. */
export function auditSpec(target: BarkupNode, spec: string): string[] {
	const problems: string[] = [];
	walkTree(target, ({ node }) => {
		if (node.name !== undefined && !spec.includes(node.name)) {
			problems.push(`the name "${node.name}" is missing from the spec`);
		}
		for (const [key, value] of Object.entries(node.attributes ?? {})) {
			if (!spec.includes(key)) {
				problems.push(`the attribute key "${key}" is never mentioned`);
			}
			if (typeof value === "string" && !spec.includes(value)) {
				problems.push(`the value "${value}" (${key}) is missing`);
			}
			if (typeof value === "number" && !spec.includes(String(value))) {
				problems.push(`the value ${value} (${key}) is missing`);
			}
			if (Array.isArray(value)) {
				for (const item of value) {
					if (typeof item === "string" && !spec.includes(item)) {
						problems.push(`the array element "${item}" (${key}) is missing`);
					}
				}
			}
		}
	});
	return problems;
}

const REBUILD_SYSTEM = `You build typed content trees from natural-language specifications.

${formatSection("json")}

Building rules:
- Follow the specification exactly: every node, every name, every attribute value, every position.
- Do not add ids.
- Reply with ONLY the complete tree as JSON (a \`\`\`json code fence is fine).`;

async function rebuildCheck(
	target: BarkupNode,
	spec: string,
): Promise<string | null> {
	const result = await generateText({
		model: DESCRIBER_MODEL,
		system: REBUILD_SYSTEM,
		prompt: `Specification:\n\n${spec}\n\nBuild the tree now.`,
		temperature: 0,
		maxRetries: 4,
	});
	const fence = result.text.match(/```[a-zA-Z]*\r?\n([\s\S]*?)```/);
	const artifact = fence?.[1]?.trim() ?? result.text.trim();
	const parsed = parseJsonTree(BENCH_CONFIG, artifact);
	if (!parsed.ok) {
		return `a rebuild from your spec was not even a valid tree (${parsed.issues[0]?.message})`;
	}
	if (!equalModuloAllIds(target, parsed.node)) {
		return "an independent rebuild from your spec produced a DIFFERENT tree — the spec is ambiguous or wrong somewhere (check child counts, order, and every attribute)";
	}
	return null;
}

const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as Corpus & {
	describer?: string;
};

let filled = 0;
let failed = 0;
for (const task of corpus.tasks) {
	if (task.family !== "construction") continue;
	if (task.spec !== null && (task.specVerified ?? false)) continue;

	let feedback = "";
	let verified = false;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		const result = await generateText({
			model: DESCRIBER_MODEL,
			system: DESCRIBER_SYSTEM,
			prompt: describerPrompt(task.target) + feedback,
			temperature: 0,
			maxRetries: 4,
		});
		const spec = result.text.trim();
		const problems = auditSpec(task.target, spec);
		const rebuildProblem =
			problems.length === 0 ? await rebuildCheck(task.target, spec) : null;
		if (problems.length === 0 && rebuildProblem === null) {
			task.spec = spec;
			verified = true;
			console.log(
				`  ${task.id}: spec verified (attempt ${attempt}, ${spec.length} chars)`,
			);
			break;
		}
		task.spec = spec;
		const notes = [...problems.slice(0, 8), rebuildProblem].filter(Boolean);
		feedback = `\n\nYour previous attempt had problems: ${notes.join("; ")}. Write the full specification again, correcting these.`;
		console.log(
			`  ${task.id}: attempt ${attempt} failed audit (${notes.length} problems)`,
		);
	}
	task.specVerified = verified;
	if (verified) filled += 1;
	else failed += 1;
}

corpus.describer = DESCRIBER_MODEL;
writeFileSync(corpusPath, `${JSON.stringify(corpus, null, "\t")}\n`);
console.log(
	`${corpusPath}: ${filled} specs verified, ${failed} UNVERIFIED (excluded from scored runs) — describer ${DESCRIBER_MODEL}`,
);
