# Addendum brief — Study U: document-carried dependencies (reading node B to edit node A)

**Pre-registration, committed before any scored U run.** Study T
measured conversation-carried state; this is its document-side
mirror, and it sits inside the most-shipped recipe in the series.
Focused views assume the instruction carries every value the edit
needs. A request like "set the caption of image X to match the title
of block Y" requires **reading a second node** — and a minimal view
focused on the target hides that node by construction. No task in
twenty studies has required reading one node to edit another. Study
U builds that class and measures the two obvious fixes: the app puts
both nodes in the view, or the model looks the value up itself with
the shipped search tool.

## The task class (pre-registered exactly)

Single-turn dependent edits over the committed size-extension trees
(~300–1000 nodes), new corpus `corpus/dependent.json` (seed
**20260714**, 45 tasks: one per size-extension tree, 15 per bucket).
Two kinds:

- **value-copy** (8 per bucket): copy an attribute between two
  same-type nodes. Instruction template, verbatim:
  `Set the "{key}" attribute of {refA} to the same value as the
  "{key}" attribute of {refB}. Copy the value exactly.`
  Both refs are id-bearing (`the {type} with id "{id}" (named
  "{name}")` where named) — grounding is deliberately solved; the
  only open problem is the read. Keys drawn from the high-entropy
  set {`content`, `src`, `containerClasses`, `title`} to keep
  accidental value collisions out of the corpus.
- **structure-read** (7 per bucket): rename A to B's name.
  Instruction template, verbatim:
  `Rename {refA}: set its name to exactly the name of {refB}.`
  Here refB must NOT contain B's name (it is the answer), so B is
  referenced by a unique (type, attribute = value) pair — the
  `refText` attr form Studies L/N registered — which also makes B
  findable by the search tool.

Expected trees are computed (`applyEdit`), grading is the standard
`equalModuloNewIds`, and corpus validation (unit-tested, committed)
asserts per task: the needed value appears nowhere in the
instruction; the needed value does not appear anywhere in the
serialized **U-view1** view (so the target-only arm cannot succeed
by coincidence); A ≠ B; the structure-read ref resolves uniquely to
B; and the edit changes the tree.

## Arms (4)

- **U-full** — whole tree in the prompt, anchored patch (the LG-full
  construction verbatim). The baseline that should succeed.
- **U-view1** — minimal focused view of the TARGET only (focus ids
  `[targetId]`, Studies I/J construction). The shipped tier-1 recipe
  applied naively. Predicted to fail by construction; the failure
  anatomy (no valid artifact vs a valid patch with a guessed value)
  is reported.
- **U-view2** — the same view with BOTH nodes in focus
  (`[targetId, sourceId]`). The app-side fix, zero new machinery:
  `renderView` has accepted multiple focus ids since 0.3.
- **U-search** — the barkup 0.4 recipe verbatim (skeleton view +
  `find_nodes`, `runSearchTask` unchanged, ≤16 calls). The
  model-side fix: does it recognize it must look the value up?

Prompts: condition-F anchored-patch system prompt; view arms append
the registered `VIEW_RULES`; search arm uses the registered
`SEARCH_SYSTEM_PROMPT`. Nothing new is written for models to read.

## Models and cells

`anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash`,
temperature 0, 1 attempt + ≤3 correction rounds. 45 tasks × 4 arms
× 2 models = **360 cells**.

## Pre-registered hypotheses

- **U-H1 (the view has a blind spot):** U-view1 fails the
  dependent-edit class badly (headline: its success rate and its
  failure anatomy — a valid-but-wrong "guess" is worse news than an
  honest failure and is counted separately).
- **U-H2 (the app-side fix — the gate):** U-view2 is statistically
  indistinguishable from U-full per model (paired McNemar over the
  45 shared tasks, p > 0.05) on both models. Passing turns the
  tier-1 guidance into "focus on every node the request mentions,
  not just the target."
- **U-H3 (the model-side fix, measured):** U-search accuracy and
  cost, reported per kind. If it reaches U-full parity it extends
  the 0.4 recipe's measured surface to reads; if it fails, the
  boundary note says search grounds *targets*, not *values*.
- **Secondary, by kind:** value-copy vs structure-read reported
  separately on every arm.

## Interpretation table (pre-registered)

| U-view2 | U-search | Reading |
|---|---|---|
| ties full | ties full | Both fixes work; app-side wins on cost — guidance: put every mentioned node in the view; search covers the app-doesn't-know case |
| ties full | fails | The read must be app-side; docs say so, search keeps a boundary note |
| fails | ties full | Views have a deeper problem than focus scope; search becomes the dependent-edit recipe — and view guidance gets a caveat |
| fails | fails | Dependent edits need the full tree; tier-1 guidance gains a measured boundary |

## Decision rule

Whatever passes cheapest at parity becomes the documented
dependent-edit recipe in barkup's focused-views docs, with the
losing arm's failure anatomy stated honestly.

## Protocol

As Studies L/N: `maxOutputTokens: 60000`, temperature 0, resumable
JSONL keyed (task, condition, model) at
`results/raw/studyu-<model>.jsonl`, `cacheReadTokens` recorded,
cache audit re-run, mechanical-failure rules as in Study H.
**Expected spend $10–20**; abort past $40.

Honesty rules unchanged: this brief, the corpus generator with its
no-leakage validation (including the rendered-view check), and all
four arm constructions are committed before the first scored call;
results publish whatever they show.
