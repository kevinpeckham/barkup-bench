/**
 * Study AP′ elicitation (docs/BRIEF-AP-PRIME.md): three independent
 * editor passes author acceptable-tag sets for the 24 adjacent+foreign
 * tasks, from task text + catalog ONLY. Deterministic shuffle, no class
 * labels, no study context. Output: results/raw/ap-prime-elicitation.json
 * (per-editor votes + mechanical ≥2/3 merge; Kevin's review locks the
 * key separately).
 *
 *   bun run scripts/elicit-ap-prime-sets.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { generateText } from "ai";

const EDITORS = [
	"anthropic/claude-opus-4.8",
	"anthropic/claude-haiku-4.5",
	"google/gemini-3.5-flash",
];

interface TagTask {
	id: string;
	cls: string;
	title: string;
	summary: string;
}
const corpus = JSON.parse(
	readFileSync("corpus/tag-steering-ap.json", "utf8"),
) as {
	catalog: { name: string; category: string }[];
	tasks: TagTask[];
};
const CATALOG_NAMES = new Set(corpus.catalog.map((t) => t.name));

// Adjacent + foreign only, in a deterministic interleave (sorted by a
// stable hash of the id) so neither class clusters.
const hash = (s: string) =>
	[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100_000, 7);
const tasks = corpus.tasks
	.filter((t) => t.cls === "adjacent" || t.cls === "foreign")
	.sort((a, b) => hash(a.id) - hash(b.id));

// Names only: run 1 rendered "- AI (other)" and editors copied the
// parenthetical into their answers, which then failed the exact-name
// check (see results/raw/ap-prime-elicitation-run1.json). Category
// isn't needed for an acceptance judgment.
const catalogBlock = corpus.catalog.map((t) => `- ${t.name}`).join("\n");

const SYSTEM = `You are the editor-in-chief of an organization's publication. The organization tags its articles ONLY from a fixed canonical tag catalog. For the article described, list EVERY tag from the catalog that you would accept a colleague applying to it — be generous but defensible: include any tag a reasonable editor would let stand, and no tag you would strike. Copy names exactly as they appear in the catalog, with nothing appended. If nothing in the catalog genuinely applies to the article, reply with an empty list. Reply with ONLY a JSON object of the form {"acceptable": ["...", "..."]} and nothing else.`;

function userMessage(task: TagTask): string {
	return `Canonical tag catalog:\n${catalogBlock}\n\nArticle title: ${task.title}\nSummary: ${task.summary}\n\nWhich catalog tags would you accept on this article? Reply with ONLY {"acceptable": [...]}.`;
}

function parseSet(text: string): string[] | null {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	try {
		const parsed = JSON.parse(match[0]) as { acceptable?: unknown };
		if (!Array.isArray(parsed.acceptable)) return null;
		return parsed.acceptable.filter((t): t is string => typeof t === "string");
	} catch {
		return null;
	}
}

interface TaskElicitation {
	taskId: string;
	cls: string;
	title: string;
	votes: Record<string, string[]>;
	discardedNonCatalog: Record<string, string[]>;
	merged: string[];
}

const out: TaskElicitation[] = [];
for (const task of tasks) {
	const votes: Record<string, string[]> = {};
	const discarded: Record<string, string[]> = {};
	for (const editor of EDITORS) {
		const result = await generateText({
			model: editor,
			system: SYSTEM,
			messages: [{ role: "user", content: userMessage(task) }],
			temperature: 0,
			maxRetries: 4,
			maxOutputTokens: 2000,
		});
		const raw = parseSet(result.text);
		if (raw === null) {
			console.log(`  ${task.id} × ${editor}: UNPARSEABLE`);
			votes[editor] = [];
			discarded[editor] = ["<unparseable>"];
			continue;
		}
		votes[editor] = raw.filter((t) => CATALOG_NAMES.has(t));
		discarded[editor] = raw.filter((t) => !CATALOG_NAMES.has(t));
	}
	const counts = new Map<string, number>();
	for (const editor of EDITORS) {
		for (const tag of new Set(votes[editor])) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	const merged = [...counts.entries()]
		.filter(([, n]) => n >= 2)
		.map(([tag]) => tag)
		.sort();
	out.push({
		taskId: task.id,
		cls: task.cls,
		title: task.title,
		votes,
		discardedNonCatalog: discarded,
		merged,
	});
	console.log(`${task.id} [${task.cls}] merged: ${JSON.stringify(merged)}`);
}

writeFileSync(
	"results/raw/ap-prime-elicitation.json",
	`${JSON.stringify({ editors: EDITORS, tasks: out }, null, 1)}\n`,
);
console.log(
	`\nWrote results/raw/ap-prime-elicitation.json (${out.length} tasks)`,
);
