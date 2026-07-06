# Addendum brief — Study H: the size extension (300 / 600 / 1000 nodes)

**Pre-registration, committed before any scored H run.** The main
study topped out at ~190 nodes with two open questions: (1) does
whole-tree rewrite's reliability hold as trees grow beyond the sizes
where its token cost balloons, and (2) does the id-anchored patch
dialect (condition F) keep rewrite-level accuracy at sizes where its
cost advantage becomes decisive? Positional JSON Patch (E) collapsed
at ~150 nodes; its trajectory at larger sizes is measured for
completeness.

## Conditions

**A** (HTML + whole-tree rewrite), **E** (RFC 6902 JSON Patch),
**F** (id-anchored patch, applied via the shipped
`@kevinpeckham/barkup/patch`, which Tier-1 QA verified identical to
the benchmark reference). All under the corrected protocol (v2) and
parity prompts, unchanged.

**Exclusions, with reasons.** B (JSON rewrite) is excluded: at ~75
tokens/node, a 1000-node JSON tree is ~75k tokens — beyond the
output caps of the roster models — so B would fail mechanically
rather than behaviorally; its format question was settled at smaller
sizes. C/D (tools) are excluded on cost (the conversation-resend
pattern at these input sizes) and because the corrected main study
already established tools parity; tools at scale is a future study if
warranted. A's HTML serialization (~50 tokens/node) fits within a
60k output budget at 1000 nodes — if it truncates, that is a genuine
finding about rewrite's mechanical ceiling and is reported as such
(truncation manifests as parse-failed and is counted, not excluded).

## Corpus

Three new size buckets, pre-registered bands: **xl** ~300 nodes
[240–380], **xxl** ~600 [480–750], **xxxl** ~1000 [800–1250].
15 transformation tasks per bucket (45 total), same generation
pipeline as the main corpus (seeded `treeArbitrary` shape sampling +
humanization; all five edit kinds cycling round-robin), fresh seed,
committed as `corpus/size-extension.json`. Transformation family
only: it is the core editing task, and single-turn cells keep the
study within budget.

## Models

`anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash` — two
vendors, two price tiers, both with ≥60k output caps and ≥200k
context. `maxOutputTokens` is set explicitly to 60,000 for this study
(the main study used provider defaults; large-tree rewrite requires
the headroom — documented protocol difference).

## Pre-registered hypotheses

- **H-H1 (accuracy at scale):** F's task success is within noise of
  A's at every size tested (paired McNemar, n = 90 per comparison
  pooled over models).
- **H-H2 (cost at scale):** F's tokens-per-solved-task advantage over
  A grows with size (F output is O(edit), A output is O(tree)).
- **H-H3 (positional collapse deepens):** E's success declines
  further below its ~150-node level (69.6%) as size grows.
- **Exploratory, not hypothesis:** whether/where A hits mechanical
  output limits; drift rates at scale; input-token growth by
  condition.

## Protocol

Identical to the main study except `maxOutputTokens: 60000`:
1 attempt + ≤3 correction rounds with issues verbatim, temperature 0,
parity prompts, deterministic grading (equal-modulo-new-ids + drift),
resumable JSONL. Cells: 45 tasks × 3 conditions × 2 models = 270.
**Expected spend $100–200** (dominated by sonnet A-cells at xxxl,
~50k output tokens each); the run is aborted and reported if spend
projects past $250.

Honesty rules unchanged: this file, the corpus, and the seeds are
committed before the first scored call; results publish whatever they
show.
