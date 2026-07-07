# Addendum brief — Study K: long editing sessions (drift over sequential patches)

**Pre-registration, committed before any scored K run.** The series
has covered single edits (main study), scale (H), and the input side
(I/J). Study K covers **time**: a session of 12 sequential edits
against one evolving tree — the replicator chat workflow — measured
under the corrected (v2) multi-turn protocol. The question: as the
tree diverges from whatever the model was last shown, does patch
accuracy drift, and which re-serialization policy prevents it?
Studies I/J changed the economics of this question: a minimal focused
view costs ~1.4k tokens, so "re-serialize every turn" is now nearly
free and the interesting hypothesis is that it dominates.

## Conditions (serialization policies; one conversation per session)

All patch arms use condition F's dialect and the shipped applier;
each patch applies to the model's CURRENT tree (the state advances
with whatever the model actually produced, including its mistakes —
realism is the point). The patch arms' system prompt is F's parity
prompt plus one pre-registered session line ("Edit requests arrive
one at a time; each patch applies to the tree as it stands after all
previous patches have been applied."); the view arm adds Study I's
view-rules block.

- **K-once** — the full tree is serialized in the first user message
  only; every later step sends the instruction alone. The model's
  knowledge of the tree decays into its own patch history.
- **K-view** — every step's user message carries a fresh **minimal
  focused view** (Study I's FT algorithm, JSON serialization) of the
  current tree, centered on the ids that step's edit references.
- **K-refresh5** — like K-once, but steps 6 and 11 re-serialize the
  full current tree ("Here is the current tree after the edits so
  far:").
- **K-rewrite** — condition A (HTML whole-tree rewrite) as the
  cost/accuracy anchor: rewrite is self-refreshing by construction
  (the model's last output IS the current state). Run at **half the
  session count** (5 sessions per bucket) purely as an anchor — its
  output cost dominates the study budget and the staleness mechanism
  is already isolated by K-once vs K-view (both patch arms share
  identical history growth; only the shown state differs).

User-message templates are fixed verbatim in
`src/harness/session-runner.ts` (committed with this brief). The
correction loop is the standard one (≤3 rounds, issues verbatim) with
the session-adapted closing line "…reply with a complete corrected
patch against the current tree."

## Corpus

`corpus/sessions.json`, seed **20260709**, committed before any
scored call: 10 sessions per bucket at **l** (~150 nodes) and **xl**
(~300 nodes), 12 steps each, edit kinds cycling round-robin. Steps
whose kind allows it (set-attribute, set-name, move-node) target the
most recently session-created surviving node with seeded probability
0.5 (**reference-back** steps — the reference family generalized to
depth). Session-created nodes carry placeholder ids in the corpus;
the runner resolves them from the model's own output via the created
node's unique (type, name), exactly like the main study's reference
tasks. Insert names are forced unique at creation time (unit-tested).

## Grading (pre-registered)

- **Per-step success (primary):** expected state = the step's edit
  applied to the model's own pre-step tree (`equalModuloNewIds`
  against the pre-step id set). A step is judged on its own edit, so
  earlier divergence does not mechanically fail later steps.
- **Blocked steps:** a step whose reference placeholder never
  resolved (the creating step failed) or whose edit is inapplicable
  to the model's actual state is recorded as blocked WITHOUT a model
  call, excluded from the per-step primary denominator, and counted
  in an exploratory cascade metric. A view that cannot be built
  because the focus id vanished counts the same way.
- **End-state match (exploratory):** final model tree vs the corpus's
  expected final state, modulo non-source ids.

## Models

`anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash`.
Cells: patch arms 3 × 20 sessions × 12 steps × 2 models = 1,440
steps; rewrite anchor 10 sessions × 12 × 2 = 240 steps.

## Pre-registered hypotheses

- **K-H1 (drift):** under K-once, per-step success declines from the
  first third (steps 1–4) to the last third (steps 9–12); under
  K-view it does not. Between-condition test: McNemar on last-third
  steps, paired by (session, step) — the underlying edits are
  identical across arms.
- **K-H2 (policy):** K-view ≥ K-once on per-step success overall
  (paired McNemar, all non-blocked steps).
- **K-H3 (mechanism):** K-once's failures concentrate in
  ordinal-placement edits (insert-node, move-node) whose target
  parent's child list changed earlier in the session; K-view's do
  not. Exploratory classification.
- **K-H4 (anchor):** K-rewrite matches the best patch arm on
  per-step success at several times the output cost per session.
- **Exploratory:** K-refresh5 relative to the bracketing arms;
  reference-back step success by arm; blocked/cascade rates;
  correction-round rates by step index; cost per completed session.

## Decision relevance

K-view winning cleanly ⇒ replicator sessions should attach a fresh
minimal view to every patch turn (a companion rule to
`PATCH_PREFERRED_NODE_THRESHOLD`), and barkup's `/view` docs get a
Sessions section. K-once holding flat would be a genuine surprise
worth reporting on its own.

## Protocol

`maxOutputTokens: 60000`, no streaming, temperature 0, resumable
JSONL (`results/raw/studyk-<model>.jsonl`, one record per step; the
**session** is the resume unit — partial sessions are stripped before
re-running). Mechanical-failure rules as in Study H. **Expected spend
$45–90** (dominated by sonnet K-rewrite output; the halved anchor arm
is the mitigation); abort and report past $150.

Honesty rules unchanged: this file, the generator, the session
runner, and their unit tests are committed before the first scored
call; results publish whatever they show.
