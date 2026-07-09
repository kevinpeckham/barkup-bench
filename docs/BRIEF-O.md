# Addendum brief — Study O: positional views (can the view carry what history was carrying?)

**Pre-registration, committed before any scored O run.** Study M
refuted stateless sessions, and the failure anatomy was unusually
clean: every stateless-only failure was a late-session **placement**
edit — a legal, first-pass-valid patch that put the node in the
wrong position. The per-turn view already shows the target parent's
children, in order, as placeholders; what the model apparently loses
without history is redundancy for *counting* them. Study O tests the
cheapest possible intervention: annotate every rendered child with
its explicit 1-based position, tell the model how positions map to
the anchor-based patch dialect, and re-run the stateless policy. If
the annotation closes the gap, statelessness is rescued by one line
of serializer; if it does not, the positional-redundancy account of
history gets sharper, because the position was printed on the node
and the model still needed the conversation.

## The intervention (pre-registered exactly)

The minimal JSON view (`buildView`, Study I/K/M) gains a `positions`
variant: every rendered child object — full or placeholder — carries
`"position": n`, its 1-based position among its parent's children in
the **current full tree**, counting siblings the view omits (so the
numbers are always true, never view-relative). The root carries no
position. The view rules gain this pre-registered line:

```
- "position": n is a node's 1-based position among its parent's children in the full tree, counting children the view does not show. Ordinals in edit requests ("the 3rd child") refer to these positions. To place a node at position n, anchor "before" the child currently at position n, or use "parentId" to append after the last child.
```

## Conditions (new policies on the Study K/M session runner)

Both use the F patch dialect, shipped applier, and a per-turn
position-annotated minimal view; only history retention differs.

- **O-stateless** — Study M's stateless policy verbatim (fresh
  single-turn conversation every step, M's stateless session rules),
  with the positioned view and the extra view-rules line.
- **O-view** — Study K's full-history view policy verbatim, with the
  positioned view and the extra view-rules line. Completes the 2×2
  (history × positions) so the annotation's effect is separable from
  memory's.

Baselines reused, never re-run: Study M's M-stateless cells and
Study K's K-view cells.

## Corpus, grading

`corpus/sessions.json` unchanged (20 sessions × 12 steps, seed
20260709). Grading identical to Studies K/M: per-step ground truth
from the model's own pre-step state, blocked/cascade rules
unchanged, placeholder resolution runner-side, end-state match as
the exploratory session-level metric.

## Models and cells

`anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash`.
20 sessions × 12 steps × 2 policies × 2 models = **960 step
records**.

## Pre-registered hypotheses

- **O-H1 (primary, the rescue):** O-stateless beats M-stateless on
  per-step success (paired McNemar per model over the 240 shared
  (session, step) keys), with the gains concentrated in the
  insert/move placement class that produced every M
  stateless-only failure. The **gate**: O-stateless is statistically
  indistinguishable from K-view (McNemar p > 0.05 per model) AND its
  end-state integrity is within 2 sessions of K-view's per model
  (K-view: 19/20 sonnet).
- **O-H2 (annotation under memory):** O-view vs K-view shows no
  significant per-step difference — history already supplies what
  positions supply. A positive delta would instead mean explicit
  positions help even with full memory, which would ship as
  unconditional guidance.
- **O-H3 (cost shape preserved):** O-stateless keeps M-stateless's
  flat per-step input (~1.3–1.7k tokens at every step); the
  annotation costs <15% additional view tokens.

## Decision rule

If the O-H1 gate passes, statelessness is rescued: session guidance
becomes "stateless sessions are safe when views carry explicit
positions", the `positions` option becomes a candidate for barkup's
`/view`, and the M addendum gets a forward pointer. If O-stateless
improves on M-stateless but misses the gate, the number ships as a
partial recovery and keep-history stands. If the annotation moves
nothing, that is strong evidence history's contribution is not
positional arithmetic, and the mechanism hunt (transcript-level)
becomes the follow-up.

## Protocol

Identical to Studies K/M: `maxOutputTokens: 60000`, temperature 0,
1 attempt + ≤3 correction rounds, session as the resume unit,
resumable JSONL (`results/raw/studyo-<model>.jsonl`),
`cacheReadTokens` recorded per call, mechanical-failure rules as in
Study H. **Expected spend $5–12** (every input is view-sized); abort
past $25.

Honesty rules unchanged: this brief, the positioned-view serializer,
and the two new policies (with unit tests for position numbering,
including positions under omitted siblings) are committed before the
first scored call; results publish whatever they show.
