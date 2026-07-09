# Addendum brief — Study P: synthetic history (what is memory actually teaching?)

**Pre-registration, committed before any scored P run.** Studies M
and O refuted two accounts of why stateless sessions fail: the view
already carried the state (M), and printing exact positions on every
node did not help (O). The failures are late-session placement edits
made with all the relevant facts visible. The remaining candidates
are about what *having produced prior edits* contributes: worked
precedent for how ordinal requests map to anchor-based patches, and
conversational precedent generally. Study P tests the cheapest
version of that account: if history is mostly a **teacher**, then a
constant, canned pair of worked examples — fake history from an
unrelated tree — should recover stateless accuracy at flat cost. If
history's value is tied to the session's own edits, canned examples
should do nothing, exactly as positions did nothing.

## The intervention (pre-registered exactly)

A fixed example tree (~10 nodes, committed as a constant, unrelated
to every corpus tree) and two worked exchanges targeting the failure
class — an ordinal insert and an ordinal move — each shown as a
minimal view plus an edit request plus the correct anchored patch.
The examples are independent snapshots of the same base example tree
(not sequential), their patches are unit-tested to apply cleanly and
produce the described outcome, and their reply style is a bare JSON
array (the terse style real history exhibits). Example instructions
mimic the session corpus phrasing ("as the 3rd child of ...").

Two delivery framings, because the difference is diagnostic:

- **P-canned** — the examples as fake conversation turns. Every step
  is a fresh conversation whose messages are: example-1 user turn,
  example-1 assistant patch, example-2 user turn, example-2
  assistant patch, then the real step (view + instruction). Example
  user turns are prefixed: `Worked example (a different, unrelated
  tree):`. System prompt: Study M's stateless prompt, unchanged.
- **P-system** — the same two examples verbatim, but embedded as a
  `Worked examples` documentation block appended to the stateless
  system prompt; the conversation itself is a single user turn.
  Same content, no multi-turn precedent.

Everything else is M-stateless exactly: fresh single-turn
conversation per step, correction rounds within the step, per-turn
minimal view (no position annotations — one intervention at a time).

## Corpus, baselines, grading

`corpus/sessions.json` unchanged (20 sessions × 12 steps, seed
20260709). Baselines reused, never re-run: Study M's M-stateless and
Study K's K-view cells. Grading identical to Studies K/M/O.

## Models and cells

`anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash`.
20 sessions × 12 steps × 2 policies × 2 models = **960 step
records**.

## Pre-registered hypotheses

- **P-H1 (the teaching account, primary):** P-canned beats
  M-stateless on per-step success (paired McNemar per model over the
  240 shared (session, step) keys), gains concentrated in the
  late-session insert/move placement class. The **gate** (same as
  Study O's): P-canned statistically indistinguishable from K-view
  (McNemar p > 0.05 per model) AND end-state integrity within 2
  sessions of K-view's per model.
- **P-H2 (content vs framing):** if P-system matches P-canned, the
  contribution is pure few-shot content and belongs in a system
  prompt; if P-canned beats P-system, the multi-turn assistant-turn
  framing itself carries weight. If NEITHER moves accuracy, the
  own-history account wins: what history contributes is bound to the
  session's own edits, and keep-history stands with a sharper
  mechanism statement.
- **P-H3 (cost and style, measured):** both arms keep the flat
  stateless cost shape plus a constant ~1–2k-token example overhead.
  Secondary: Study M saw gemini's stateless outputs balloon 6× with
  no conversational precedent for terseness; canned exchanges should
  restore terse outputs (mean output tokens per step reported).

## Interpretation table (pre-registered)

| P-canned | P-system | Reading |
|---|---|---|
| recovers | recovers | Few-shot teaching; ship as prompt guidance — constant-cost stateless sessions are viable |
| recovers | does not | Teaching requires conversational framing; ship canned-exchange recipe |
| does not | does not | History's value is tied to the session's own edits; keep-history guidance final |
| does not | recovers | Not predicted; would demand a replication before any claim |

"Recovers" = passes the P-H1 gate; partial movement short of the
gate publishes as partial, exactly as Study O's did.

## Decision rule

If P-canned (or P-system) passes the gate, the session guidance
gains its missing constant-cost option: stateless sessions with a
canned worked-example preamble, and barkup's docs ship the example
block. If neither passes, Studies M, O, and P together close the
statelessness question for this benchmark: sessions keep full
history, and the mechanism hunt moves to transcript forensics, not
more serializer or prompt variants.

## Protocol

Identical to Studies K/M/O: `maxOutputTokens: 60000`, temperature 0,
1 attempt + ≤3 correction rounds, session as the resume unit,
resumable JSONL (`results/raw/studyp-<model>.jsonl`),
`cacheReadTokens` recorded, mechanical-failure rules as in Study H.
**Expected spend $8–15**; abort past $30.

Honesty rules unchanged: this brief, the example tree and exchanges
(with tests proving the example patches apply and produce the
described outcomes), and both policy implementations are committed
before the first scored call; results publish whatever they show.
