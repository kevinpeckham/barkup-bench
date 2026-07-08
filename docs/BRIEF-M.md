# Addendum brief — Study M: stateless sessions (does the model need to remember?)

**Pre-registration, committed before any scored M run.** Study K
showed that a fresh minimal view every turn eliminates session drift
and is the cheapest policy — but its sessions still carried full
conversation history, which grows without bound and is exactly where
the tool-history footgun class of bugs lives. Study M pushes the
K-view result to its logical extreme: **if the view carries the
state, does the model need conversation history at all?** A yes
means unbounded editing sessions at constant per-step cost, immune
to context ceilings and to history-construction mistakes, because
there is no history to construct.

## Conditions (new policies on the Study K session runner)

Both use the F patch dialect, shipped applier, and K-view's per-turn
minimal view of the current tree; only history retention differs.

- **M-stateless** — no memory whatsoever. Every step is a fresh
  single-turn conversation: system prompt + one user message (the
  current view + the instruction). Correction rounds stay within the
  step. Nothing from prior steps is ever shown.
- **M-window** — a sliding window keeping only the last 2 completed
  step exchanges (their user messages and final assistant patches;
  intermediate correction rounds are dropped when a step leaves the
  window) plus the current step. The middle ground between K-view
  and stateless.

The system prompt is K's patch-arm prompt (F parity + the session
rules line + Study I's view rules) for M-window, and for M-stateless
the session-rules line is replaced by this pre-registered variant
(there is no "previous patches" conversation to refer to):

```
Session rules:
- The view shows the tree as it stands right now, after all previous edits have already been applied. Edit it from this state.
```

## Corpus, baseline, grading

`corpus/sessions.json` unchanged (20 sessions × 12 steps, seed
20260709). The paired baseline is **Study K's K-view cells**, reused
as-is. Grading is identical to Study K: per-step ground truth from
the model's own pre-step state, blocked/cascade rules unchanged,
reference-back placeholders resolved by the runner exactly as before
(resolution is runner-side and history-independent by construction).
End-state match stays the exploratory session-level metric.

## Models and cells

`anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash`.
20 sessions × 12 steps × 2 policies × 2 models = **960 step records**.

## Pre-registered hypotheses

- **M-H1 (primary):** M-stateless matches K-view on per-step success
  (paired McNemar per model over the 240 shared (session, step)
  keys; prediction: no significant difference — each step is
  self-contained given the view).
- **M-H2 (cost shape, measured not tested):** M-stateless per-step
  input is constant in step index (~1.5–2k tokens at every step),
  so session cost is strictly linear in edit count with no context
  ceiling; K-view's history-carrying input grows roughly
  quadratically by comparison.
- **M-H3 (exploratory):** M-window sits at parity; if statelessness
  fails anywhere, the failures identify what history was actually
  contributing (candidates: style consistency of freshly minted ids,
  or instructions that implicitly lean on a prior step's phrasing).

## Decision rule

If M-H1 holds, the session guidance in barkup's `/view` docs and in
replicator gains its final clause: sessions need no conversational
memory of prior edits — persist the tree, render a fresh view, treat
every edit as the first. If statelessness degrades, the window
result locates how much memory is enough, and that number ships
instead.

## Protocol

Identical to Study K: `maxOutputTokens: 60000`, temperature 0,
1 attempt + ≤3 correction rounds, session as the resume unit,
resumable JSONL (`results/raw/studym-<model>.jsonl`),
`cacheReadTokens` recorded per call, mechanical-failure rules as in
Study H. **Expected spend $10–20** (every input is view-sized);
abort past $40.

Honesty rules unchanged: this brief and the runner's two new policy
implementations (with unit tests for the window-trimming and
stateless message construction) are committed before the first
scored call; results publish whatever they show.
