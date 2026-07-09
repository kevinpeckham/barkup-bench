/**
 * Study N retrieval preprocessing (docs/BRIEF-N.md): materialize the
 * N-embed focus sets. For every grounded task, embed the instruction
 * and every id-bearing node's searchable text (LG-lex's strings,
 * unchanged) with openai/text-embedding-3-small via the gateway, take
 * the top 5 nodes by cosine similarity (ties by document order), and
 * write corpus/embed-focus.json. The file is committed BEFORE any
 * scored patch call so scored runs are reproducible from the repo
 * alone; embedding calls are preprocessing, not scored calls.
 *
 *   bun run scripts/generate-embed-focus.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gateway } from "@ai-sdk/gateway";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { embedMany } from "ai";
import { searchableText } from "../src/conditions/grounded.js";
import { cosine } from "../src/conditions/grounded-n.js";
import type { Edit } from "../src/corpus/edits.js";
import { groundedTargetIds } from "../src/corpus/grounded.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import { walkTree } from "../src/tree.js";

const EMBED_MODEL = "openai/text-embedding-3-small";
const K = 5;

const corpus = JSON.parse(
	readFileSync("corpus/grounded.json", "utf8"),
) as Corpus;
const tasks = corpus.tasks as TransformationTask[];

const model = gateway.textEmbeddingModel(EMBED_MODEL);
const focus: Record<string, string[]> = {};
let covered = 0;

for (const task of tasks) {
	const nodes: { id: string; text: string }[] = [];
	walkTree(task.tree as BarkupNode, ({ node }) => {
		if (node.id === undefined) return;
		nodes.push({ id: node.id, text: searchableText(node) });
	});
	const { embeddings } = await embedMany({
		model,
		values: [task.instruction, ...nodes.map((n) => n.text)],
		maxRetries: 4,
	});
	const query = embeddings[0] as number[];
	const top = nodes
		.map((node, order) => ({
			id: node.id,
			order,
			score: cosine(query, embeddings[order + 1] as number[]),
		}))
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.slice(0, K)
		.map((s) => s.id);
	focus[task.id] = top;

	const targets = groundedTargetIds(task.edit as Edit);
	const hit = targets.every((id) => top.includes(id));
	if (hit) covered += 1;
	console.log(
		`${task.id}: [${top.join(", ")}] ${hit ? "covers" : "MISSES"} targets [${targets.join(", ")}]`,
	);
}

writeFileSync(
	"corpus/embed-focus.json",
	`${JSON.stringify({ model: EMBED_MODEL, k: K, focus }, null, "\t")}\n`,
);
console.log(
	`\ncorpus/embed-focus.json written: ${tasks.length} tasks, top-${K} covers all targets on ${covered}/${tasks.length}`,
);
