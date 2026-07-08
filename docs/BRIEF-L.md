# Addendum brief — Study L: grounding (closing the oracle gap)

**Pre-registration, committed before any scored L run.** Every view
result so far is an oracle bound: task instructions name their target
ids, so "find the right node" was never tested. Study L removes the
ids. Instructions describe targets the way a person would ("the
text block named X", "the second image inside the block named Y"),
and the study measures (1) whether models can ground such references
at 300 to 1000 nodes, and (2) which context-delivery mechanism
grounds best: seeing everything, navigating, or naive retrieval.

## Corpus

`corpus/grounded.json`, committed before any scored call: the 45
size-extension trees and edits, unchanged, with **regenerated
instructions** that contain no node ids. The referring-expression
generator (committed + unit-tested alongside this brief) describes a
node by, in preference order: its unique name; its type plus a
distinguishing attribute value; or its type plus ordinal position
inside the nearest *named* ancestor ("the 3rd block inside the
section named 'atlas'"). **Every generated description is
programmatically verified to match exactly one node in its tree**
(the resolver is part of the test suite); a task whose target cannot
be uniquely described is a corpus bug, not a model problem. Insert
placements keep their ordinal form; move instructions describe both
the moved node and the destination.

## Conditions (all F patch dialect, shipped applier, protocol v2)

- **LG-full** — the full tree in the prompt (Study H/I's F user
  template), grounded instruction. F's parity system prompt
  unchanged. Tests pure in-context grounding.
- **LG-nav** — model-driven navigation. The prompt carries a minimal
  root view (root rendered fully, its children as placeholders) and
  the model gets ONE tool: `expand_node {"id": ...}`, which returns
  the minimal view of that node (itself fully, children as
  placeholders) or a structured error for an unknown id. Up to 16
  tool steps, then the model replies with the anchored patch as
  text. History uses the corrected (v2) accumulation, obviously.
- **LG-lex** — naive deterministic retrieval feeding `renderView`:
  tokenize the instruction and every node's searchable text (name,
  type, attribute keys and stringified values) into lowercase
  alphanumeric tokens; score each node by distinct-token overlap
  with the instruction; take the top 5 nodes (ties broken by
  document order); render the minimal view focused on their union.
  One-shot patch, Study I's FT system prompt. The retriever is
  committed code with unit tests, chosen deliberately dumb: it is
  the floor any real app should beat.

The LG-nav system prompt is F's parity prompt plus this
pre-registered block:

```
Navigation rules:
- You are shown a minimal view of the tree's root. Collapsed elements are real nodes shown without their contents; data-child-count is how many children each actually has.
- Call expand_node with a visible id to reveal that node in full with its children collapsed. Expand as many nodes as you need to locate the nodes the edit request concerns.
- When you have found them, reply with the anchored patch as your final message. Every id you use must be one you have seen.
```

## Grading (pre-registered, two levels)

- **Task success (primary):** `equalModuloNewIds` against the
  ground-truth expected tree, exactly as Studies H/I/J.
- **Grounding accuracy (secondary):** the set of existing-node ids
  the model's patch operates on (targets, anchors, parents) compared
  to the ground-truth edit's referenced ids. A failed task whose
  patch touched the wrong node is a *misgrounding*; a failed task
  that touched the right node is a *mechanics* failure. This split
  is the study's diagnostic heart.

## Models and cells

`anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash`.
45 tasks × 3 conditions × 2 models = **270 runs**.

## Pre-registered hypotheses

- **L-H1 (the oracle premium, descriptive):** grounded instructions
  cost accuracy relative to Study I's id-anchored bound; we measure
  the premium per condition and size rather than predicting its
  magnitude.
- **L-H2 (mechanism comparison, paired primary):** LG-nav and LG-lex
  are compared to LG-full per model with McNemar over the 45 shared
  tasks. Directional prediction, held loosely: navigation beats
  full-tree at the largest size (finding one node in 85k tokens is
  harder than walking to it), and both partial-context arms use at
  least 80% less input.
- **L-H3 (failure anatomy):** misgrounding, not patch mechanics,
  dominates failures in every arm; unnamed-node ordinal references
  misground more than named references. Exploratory breakdown.

## Decision rule

If a partial-context arm (LG-nav or LG-lex) is non-inferior to
LG-full per model (delta no worse than −5 pp, p > 0.05) with ≥80%
input savings, barkup's `/view` docs graduate from "your app must
find the ids" to a documented, benchmark-backed grounding recipe
(and LG-nav's tool contract becomes a candidate `/navigate` helper).
If grounding collapses everywhere, that is the honest boundary of
the approach and gets published as such.

## Protocol

`maxOutputTokens: 60000`, temperature 0, 1 attempt + ≤3 correction
rounds (structured issues verbatim), resumable JSONL
(`results/raw/studyl-<model>.jsonl`), mechanical-failure rules as in
Study H. **Expected spend $25–45** (LG-full carries full-tree
inputs; the other arms are small); abort past $75.

Honesty rules unchanged: this brief, the referring-expression
generator with its uniqueness tests, the expand-tool renderer, the
lexical retriever, and the grounding-accuracy grader are all
committed before the first scored call; results publish whatever
they show.
