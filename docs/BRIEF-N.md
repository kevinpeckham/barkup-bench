# Addendum brief — Study N: the retrieval ladder (measuring the gap Study L left open)

**Pre-registration, committed before any scored N run.** Study L
bounded the grounding problem: naive lexical retrieval solves 60% of
id-free tasks (the floor), full-tree in-context grounding solves
84–87%, the id-oracle sits at 91–96% — and the one agentic mechanism
we tested (skeleton + `expand_node`) was a trap, oracle-accurate only
on the frontier model and more expensive than pasting the whole tree.
Study N measures the rungs in between, the ones an application would
actually ship: a **search tool** instead of structural walking, an
**embedding retriever** instead of token overlap, and a **two-stage
ground-then-patch pipeline** where a model reads the whole tree once,
names the target ids, and the patch is produced against a focused
view.

## Corpus

`corpus/grounded.json` unchanged (45 size-extension trees, id-free
instructions, every referring expression verified unique). No new
corpus. Baselines are reused, never re-run: Study L's LG-full,
LG-nav, LG-lex cells and Study I's oracle bound.

## Conditions (all F patch dialect, shipped applier, protocol v2)

- **N-search** — content search instead of structural navigation.
  The prompt carries the same minimal root view as LG-nav and the
  model gets ONE tool: `find_nodes {"query": string}`, which
  tokenizes the query exactly as LG-lex tokenizes (lowercase
  alphanumeric), scores every id-bearing node by distinct-token
  overlap between the query and the node's searchable text (type,
  name, attribute keys and stringified values — LG-lex's function,
  unchanged), and returns the minimal HTML view focused on the union
  of the top 5 matches (ties by document order; nodes scoring 0 are
  excluded; if nothing scores above 0 the tool returns a structured
  "no matches" message). Up to 16 tool steps (parity with LG-nav's
  budget), then the model replies with the anchored patch. System
  prompt: Study J's HTML-patch base plus the pre-registered search
  block below.
- **N-embed** — LG-lex with the scorer upgraded. Retrieval embeds
  the instruction and every node's searchable text (the same strings
  LG-lex scores) with `openai/text-embedding-3-small` via the
  gateway (verified available 2026-07-09), takes the top 5 nodes by
  cosine similarity (ties by document order), and renders the
  minimal JSON view focused on their union. Prompt, one-shot patch
  loop, and everything else are byte-identical to LG-lex. Because
  embedding endpoints are not contractually deterministic, the
  retrieval output is materialized first: a committed script writes
  `corpus/embed-focus.json` (taskId → the 5 focus ids), and that
  file is committed **before the first scored patch call**, so every
  scored run is reproducible from the repo alone. Embedding calls
  are retrieval preprocessing, not scored calls.
- **N-ground2** — two-stage ground-then-patch, same model both
  stages. **Stage 1 (grounding):** the model sees the full tree
  (F's JSON serialization) and the instruction under the
  pre-registered grounder prompt below, and must reply with a JSON
  array of the ids of every existing node the edit concerns
  (targets plus placement anchors). Validation: parseable JSON array
  of strings, non-empty, every id present in the tree; up to 2
  correction rounds with structured feedback; a task whose grounder
  never yields a valid list is recorded as an invalid (mechanical)
  failure. **Stage 2 (patching):** the minimal JSON view focused on
  the stage-1 ids, Study I's FT prompt, standard patch loop. The
  patcher never sees the full tree.
- **N-ground2x** — the economic configuration of the same pipeline:
  `google/gemini-3.5-flash` grounds (stage 1),
  `anthropic/claude-sonnet-4.5` patches (stage 2). The cheap model
  reads the big tree; the expensive model only ever sees a view.
  Records carry the patcher as `model`, the grounder in `detail`,
  and per-stage token counts so frontier-model input is separable.

Pre-registered search block (appended to the HTML-patch base for
N-search):

```
Search rules:
- You are shown a minimal view of the tree's root. Collapsed elements are real nodes shown without their contents; data-child-count is how many children each actually has.
- Call find_nodes with a few search words (names, types, attribute values) to retrieve the 5 best-matching nodes, shown in place in the tree with their ancestors. Search as many times as you need to locate the nodes the edit request concerns.
- When you have found them, reply with the anchored patch as your final message. Every id you use must be one you have seen.
```

Pre-registered grounder system prompt (stage 1 of N-ground2 /
N-ground2x; `{format}` is F's JSON dialect section, verbatim):

```
You are an expert reader of typed content trees.

{format}

Grounding rules:
- You will be shown a tree and an edit request. Do NOT perform the edit.
- Reply with a JSON array of the ids of every EXISTING node the edit concerns: the node(s) to be changed or removed, plus any node the request names as a destination or placement reference (the parent to insert into, the container an ordinal like "the 3rd child" counts within, a sibling the position is relative to).
- Every id must appear exactly as it does in the tree. Reply with the JSON array and nothing else; you may wrap it in a ```json code fence.
```

## Grading (identical to Study L)

- **Task success (primary):** `equalModuloNewIds` against the
  ground-truth expected tree.
- **Failure anatomy (secondary):** the misgrounding-vs-mechanics
  classifier from Study L, unchanged, computed offline from each
  record's final tree.
- **Mechanism metrics (measured, not gated):** retrieval hit rate
  for N-embed and LG-lex (does the 5-id focus set cover the edit's
  ground-truth target ids); stage-1 grounding accuracy for the
  two-stage arms (does the grounder's id list cover the target
  ids); `find_nodes` call counts for N-search; per-stage and (for
  N-ground2x) per-model input tokens.

## Models and cells

`anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash`.
45 tasks × 3 conditions × 2 models + 45 × N-ground2x = **315 runs**
(plus unscored embedding preprocessing and stage-1 grounder calls
inside the two-stage records).

## Pre-registered hypotheses (predictions held loosely)

- **N-H1 (search rescues navigation):** N-search matches LG-nav's
  frontier accuracy at ≤20% of its input tokens, and lifts gemini
  significantly above LG-nav's 23/45 (McNemar per model vs both
  LG-nav and LG-full). Mechanism prediction: a handful of
  `find_nodes` calls replaces a median of ~54 expands.
- **N-H2 (embeddings beat the lexical floor):** N-embed > LG-lex
  per model, driven by retrieval hit rate; whether it reaches
  LG-full-level accuracy is measured, not predicted.
- **N-H3 (two-stage):** N-ground2 is non-inferior to LG-full per
  model (delta no worse than −5 pp); N-ground2x matches sonnet
  LG-full's accuracy while cutting **sonnet-side** input tokens by
  ≥80% (the tree is read only by the cheap grounder).

## Decision rule

Study L's gate, re-tested per rung with the cost basis named: a rung
passes if it is non-inferior to LG-full per model (delta no worse
than −5 pp, p > 0.05) while reducing the relevant input cost ≥80%
(total input for N-search / N-embed / N-ground2; frontier-model
input for N-ground2x). Any passing rung graduates barkup's `/view`
docs from "your app must find the ids" to a documented,
benchmark-backed grounding recipe naming that mechanism. If every
rung fails, Study L's boundary is confirmed at one more level of
resolution and gets published as such.

## Protocol

`maxOutputTokens: 60000`, temperature 0, 1 attempt + ≤3 correction
rounds (structured issues verbatim; stage-1 grounding uses ≤2),
resumable JSONL (`results/raw/studyn-<model>.jsonl`),
`cacheReadTokens` recorded per call, mechanical-failure rules as in
Study H. **Expected spend $30–55** (two arms carry full-tree inputs
once each; the rest are view-sized); abort past $85.

Honesty rules unchanged: this brief, the search tool, the embedding
retriever and its materialized focus file, the grounder prompt and
its validator, and the two-stage runner are all committed before the
first scored patch call; results publish whatever they show.
