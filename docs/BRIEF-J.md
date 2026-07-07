# Addendum brief — Study J: HTML-rendered focused views

**Pre-registration, committed before any scored J run.** Study I
validated the focused-view contract with views serialized as JSON
(they ran on condition F's JSON side). The proposed
`@kevinpeckham/barkup/view` capability would render views in
barkup's native HTML dialect instead. Study J asks: **does rendering
the same view content in the HTML dialect change anchored-patch
success or cost?** It gates the feature's native serialization, and
it is the first direct test of the format question on partial views
(the original article's claim that HTML elides more gracefully than
JSON — placeholders are self-describing elements rather than
foreign-looking JSON properties).

## Conditions

- **FVH / FTH** — content-identical to Study I's FV / FT (same
  focus-id derivation, same spine/placeholder/omission algorithm),
  serialized in the HTML dialect via a **view grammar**: the bench
  `GrammarConfig` with three additional declared attributes on every
  node type — `collapsed` (boolean), `childCount` (number),
  `omittedChildren` (number) — compiled with the same barkup
  `defineGrammar` and rendered with the shipped `build()`. On trees
  without view metadata this grammar's output is byte-identical to
  condition A's serialization (unit-tested), so expanded regions look
  exactly like the HTML the models saw in A. Placeholders render as
  `<div data-type="..." data-name="..." id="..." data-collapsed="true"
  data-child-count="N"></div>`; minimal-mode parents carry
  `data-omitted-children="N"`.
- The **patch dialect, shipped applier, correction loop, and grading
  are unchanged** (the reply is still a JSON array of id-anchored
  ops applied to the full tree). The cross-format prompt (HTML view
  in, JSON patch out) is part of what is under test.

**Prompt.** System prompt: F's editing rules with the format section
swapped to the HTML dialect (`formatSection("html")`, the same text
conditions A/D used), plus ONE added editing rule required by the
cross-format seam — inserted nodes are JSON objects with camelCase
attribute keys even though the tree is shown as markup:

```
- Patch operations use JSON node objects and camelCase attribute keys ({"type": ..., "name": ..., "id": ..., "attributes": {...}}), even though the tree is shown as markup.
```

and Study I's view-rules block with only the two format-specific
sentences adapted:

```
View rules:
- You are shown a focused view of the tree, not the whole tree. The view is centered on the nodes the edit request references. Your patch is applied to the full tree, where every hidden node still exists.
- An element with data-collapsed="true" is a real node shown without its contents; data-child-count is how many children it actually has.
- An element with data-omitted-children="N" has N additional children that are not shown at all.
- Every visible id is a valid patch target. Never use an id that is not visible in the view.
- Give every node you create a fresh id unlikely to exist anywhere in the full tree (e.g. with a random-looking suffix); if it collides with a hidden node's id, the patch is rejected with a duplicate-id issue and you can correct it.
```

User message template unchanged.

## Baselines, corpus, models

Paired baselines: Study I's FV/FT cells (JSON views) and Study H's F
cells (full input), reused as-is. Corpus `corpus/size-extension.json`
unchanged; models `anthropic/claude-sonnet-4.5` and
`google/gemini-3.5-flash`. New cells: 45 tasks × 2 modes × 2 models
= **180 runs**.

## Pre-registered hypotheses

- **J-H1 (primary):** FVH/FTH match FV/FT on task success (paired
  McNemar per model per mode; prediction: no significant difference).
- **J-H2 (format cost, measured not tested):** HTML views use fewer
  input tokens than their JSON twins, in line with the main study's
  ~30% HTML-vs-JSON economy at scale.
- **Exploratory:** whether the cross-format seam (HTML view, JSON
  patch ops) shows up as first-round `invalid-patch`/`parse-failed`
  issues; correction-round rate vs Study I; first-pass validity.

## Decision rule (serialization gate for barkup /view)

If FTH is non-inferior to FT per model (success delta no worse than
−5 pp and McNemar p > 0.05), `/view` ships with HTML as its native
rendering. If HTML views degrade, `/view` ships JSON-first and the
divergence is published either way.

## Protocol

Identical to Study I: `maxOutputTokens: 60000`, no streaming,
temperature 0, 1 attempt + ≤3 correction rounds, deterministic
grading, resumable JSONL (`results/raw/studyj-<model>.jsonl`),
mechanical-failure rules as in Study H. **Expected spend < $5**;
abort and report past $25.

Honesty rules unchanged: this file, the HTML view renderer, and its
unit tests (including the byte-parity test against condition A's
serialization and a structural-equivalence test against Study I's
JSON views) are committed before the first scored call; results
publish whatever they show.
