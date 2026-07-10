# Addendum brief — Study T: conversation-carried context (when history really is state)

**Pre-registration, committed before any scored T run.** (Corpus,
notes-block format, and runner changes will be committed before the
first scored call, per series protocol; this brief registers the
design, hypotheses, and gates.)

Studies M/O/P/S established that session history contributes
**teaching, not memory** — and Study S measured the stateless
worked-examples recipe to 36 edits at flat cost. But every
instruction in every session study was **self-contained**: the
instruction plus the current tree carried everything needed to
execute the edit. Real sessions also contain requests whose
parameters live only in the **conversation**: "use the campaign
codename we settled on", "apply the standing rule from earlier".
For those, history is not a teacher — it is state, and a stateless
editor fails them *by construction*. No study in this series has
measured that class. Study T does, along with the obvious cheap
fix: an app-maintained **session-notes block** (a memo, not a
transcript).

## The task class (pre-registered exactly)

A new session corpus where most steps are ordinary self-contained
edits (the Study K generator unchanged) but ~4 steps per session are
**callback steps** of two kinds:

- **Declared-fact callback.** An earlier step's instruction declares
  a named fact that never enters the tree ("For later reference:
  the campaign codename is 'aurora'." appended to an ordinary edit
  instruction). A later step requires it ("Set the label attribute
  of the node "n412" to the campaign codename."). The expected edit
  is deterministic (set-attribute label = "aurora"); grading is
  exact-match as always.
- **Standing-rule callback.** An earlier instruction declares a
  standing rule ("From now on, every node this session inserts gets
  textStyle 'serif'."). A later insert instruction does NOT restate
  the rule; the expected inserted node carries it.

Corpus validation (unit-tested, committed): a callback step's
required fact must NOT be derivable from the current tree at that
step — the generator asserts the fact value appears nowhere in the
pre-step state (no attribute, name, or type equals it). Declared
fact values are drawn from a pool disjoint from the grammar's
generated attribute pools, so accidental collision is structurally
excluded. Callback steps are flagged in the step record for
analysis.

## Arms (3)

- **T-history** — the K-view policy verbatim (full history + fresh
  minimal view per turn). Predicted to handle callbacks: the
  declaring turn is in context.
- **T-system** — the P-system policy verbatim (stateless + the two
  worked examples in the system prompt). Predicted to fail callback
  steps: the declaring turn no longer exists.
- **T-notes** — T-system plus a **session-notes block** appended to
  each step's user message: a plain bullet list of every fact and
  standing rule declared so far, maintained by the harness from the
  generator's step metadata. Pre-registered format:

  ```
  Session notes (maintained by the application):
  - The campaign codename is "aurora".
  - Standing rule: every inserted node gets textStyle "serif".
  ```

  Disclosed honestly: this simulates an application that reliably
  captured each declared fact — an upper bound for the memo pattern.
  A real application needs its own capture step (deterministic,
  cheap, or model-assisted); Study T measures whether the memo,
  once captured, substitutes for the transcript.

Everything else identical to Studies K/M/O/P/S: per-turn minimal
views, anchored patches, ≤3 correction rounds, per-step ground truth
from the model's own pre-step state, exploratory end-state grade.

## Corpus, models, cells

New `corpus/sessions-callback.json` (fresh seed, committed before
any scored call): 20 sessions × 12 steps (10 per bucket, l/xl),
~4 callback steps per session (~80 callback cells per arm-model).
Models: `anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash`,
temperature 0. 20 × 12 × 3 arms × 2 models = **1,440 step records**.

## Pre-registered hypotheses

- **T-H1 (the boundary is real — primary):** T-system fails
  callback steps at a rate far below T-history (paired McNemar over
  shared (session, step) keys, per model). If instead T-system's
  callback success is statistically indistinguishable from
  T-history's, the gap hypothesis is REFUTED and the stateless
  guidance stands unqualified — publish that.
- **T-H2 (the memo rescue — the gate):** T-notes recovers callback
  steps to T-history parity (McNemar p > 0.05 per model, callback
  steps AND all steps) with end-state within 2 sessions of
  T-history's per model. Passing = the guidance becomes "a memo,
  not a transcript."
- **T-H3 (cost, measured):** T-notes stays near T-system's flat
  cost (prediction: ≤ 1.3× T-system mean input/session; both well
  below T-history). Reported regardless.
- **Secondary, by kind:** declared-fact vs standing-rule callbacks
  reported separately — a split verdict (facts rescued, standing
  rules not, or vice versa) publishes as a split.

## Interpretation table (pre-registered)

| T-system callbacks | T-notes callbacks | Reading |
|---|---|---|
| fail | recover | History's residual value is a memo's worth of state; stateless + notes becomes the session default, docs updated |
| fail | fail | Context-dependent sessions need real history; the scope note hardens into a boundary |
| pass | — | Gap refuted (and the corpus validation audited for leakage before claiming it) |
| split by kind | split | Publish the split; guidance names which request kinds need which memory |

## Decision rule

Whatever passes, barkup's session docs replace the current scope
note with the measured answer: either the memo pattern (with the
notes-block format as a documented pattern), or an honest "keep
history when requests reference the conversation" boundary.

## Protocol

Identical to Studies K/M/O/P/S: `maxOutputTokens: 60000`,
temperature 0, session as the resume unit, resumable JSONL
(`results/raw/studyt-<model>.jsonl`), `cacheReadTokens` recorded,
cache audit re-run. **Expected spend $15–30** (12-step sessions;
one history arm); abort past $60.

Honesty rules unchanged: this brief, the corpus generator with its
no-leakage validation, the notes-block construction, and all three
arm implementations are committed before the first scored call;
results publish whatever they show.
