# Addendum brief — Study AE: hatch calibration and the resume loop (AC's two open edges)

**Pre-registration, committed before any scored AE run.** Study AC
proved the escape hatch works perfectly at a validated hard boundary
and disclosed two things it deliberately did not measure: (1) whether
the hatch CALIBRATES on requests that are merely vague rather than
provably unsolvable — the over-asking risk now live on three shipped
chat surfaces (v3.191.0) — and (2) what happens AFTER an ask: AC
ended every cell at the question, so the full loop (ask → user
answers → correct patch) has never been graded. Study AE measures
both.

## Part 1 — the calibration ladder (AE-cal)

Five registered ambiguity levels, 15 tasks each (5 per size bucket,
xl/xxl/xxxl), same minimal-view protocol as Studies U/AC:

- **L0 — precise, solvable (reused).** The first 5 dependent-corpus
  tasks per bucket in their both-nodes (U-view2) form, verbatim —
  AC's solvable-twin class. Correct: solve. Ask = false ask.
- **L1 — indirect but unique.** The instruction names the target by
  a unique (type, attribute = value) reference — never by id — and
  STATES the new value. The view focuses the target plus two
  same-type distractors. Unit-validated: the reference matches
  exactly ONE node tree-wide. Correct: solve. Ask = false ask.
- **L2 — discretionary value (descriptive, NOT gated).** The target
  is named by id; the value is left to judgment (registered template:
  `Make the ${key} of the ${type} with id ${id} punchier.` — always
  a text-atom's content). Outcomes: acted (valid patch on the right
  target+key with a changed value; wording quality deliberately
  ungraded and disclosed) / asked / off-target / invalid. First data
  on this class; our expectation (recorded, not gated) is that asks
  should be rare.
- **L3 — ambiguous referent.** The instruction uses a descriptor
  matching exactly TWO nodes (unit-validated tree-wide), both in the
  view, whose current target-key values differ, and states the new
  value. The request is singular ("the ${type} whose ${key} is …"),
  so it cannot be resolved from context. Correct: ask. A valid patch
  on either candidate = guessed (recorded which); a patch changing
  BOTH candidates = "both" (reported separately; counts as
  not-asked). Ask-quality heuristic (descriptive): the ask mentions
  both candidate ids.
- **L4 — missing information (reused).** The same first-5-per-bucket
  dependent tasks in their target-only (U-view1) form, verbatim —
  AC's unsolvable class. Correct: ask.

Corpus: `corpus/calibration.json`, **seed 20260717**, L1–L3 generated
from the size-extension trees by `scripts/generate-calibration-corpus.ts`
(constructions in `src/corpus/calibration.ts`, validators unit-tested
before any scored call); L0/L4 are registered reuses of
`corpus/dependent.json` (no regeneration).

**Arms (2):** AE-base (no hatch) and AE-rule (the shipped AC-rule
sentence, verbatim, unchanged — the calibration question is about the
text we actually shipped, so the text is frozen). Both arms, all
levels. The tool mechanism is not re-tested (AC measured the two
mechanisms indistinguishable).

**Cells:** 75 tasks × 2 arms × 3 models (sonnet-4.5,
gemini-3.5-flash, opus-4.8) = **450**.

## Part 2 — the resume loop (AE-resume)

The 45 dependent-corpus tasks in their unsolvable (view1) form under
AE-rule. When the model asks, the harness answers as the user — one
registered template, then the cell continues in the same
conversation, view unchanged:

> `${needle-description} is exactly: "${needle}". Now apply the
> requested edit; reply with the patch only.`

where `${needle-description}` is `The ${key} of ${sourceId}` for
value-copies and `The name of ${refText(sourceRef)}` for
structure-reads. Grading: the post-answer patch is graded against
the task's expected tree (Study U's grader, unchanged; ≤3 correction
rounds still apply after the answer). Outcomes: resumed-solved /
resumed-wrong / re-asked (asked again after the answer) /
never-asked (solved or guessed without asking — graded as in AC) /
invalid.

**Cells:** 45 tasks × 1 arm × 3 models = **135** (two-plus calls
each).

## Pre-registered hypotheses and gates

- **AE-H1 (no interrogation tax):** per model, AE-rule on L0+L1
  pooled: false asks ≤ 3/30 AND solve rate not significantly below
  AE-base (McNemar, p > 0.05, or hatch-favoring). Mirrors AC-H2's
  affordability bar on the new territory.
- **AE-H2 (ambiguity detection):** per model, AE-rule on L3:
  asked ≥ 12/15 (one-sided exact binomial vs 0.5, p < 0.05).
  AE-base anchors the guess anatomy (expected ~0 asks).
- **AE-H3 (hard-boundary replication):** per model, AE-rule on L4:
  asked ≥ 12/15. (AC measured 45/45; the slice should be at
  ceiling.)
- **AE-H4 (the loop closes):** per model, AE-resume:
  resumed-solved ≥ 42/45. Every re-ask and resumed-wrong is
  itemized.
- **The study gate: AE-H1, AE-H2, AE-H3, and AE-H4 all pass on all
  three models.** L2 is reported, never gated.

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| All pass | The shipped hatch calibrates beyond its home turf and the loop closes: ask-paths graduate from "measured at the boundary" to "measured across the ladder"; replicator fence updates from watch-chat-logs to measured |
| H1 fails (over-asking) | The hatch taxes clear requests — the shipped rule text needs a narrowing amendment, tested before shipping (the calibration caveat was real) |
| H2 fails (under-asking on ambiguity) | The hatch only fires on provable absence, not on ambiguity — silent coin-flips survive; app-side disambiguation (unique refs, selection grounding) remains the only defense for referent ambiguity |
| H3 fails | AC's own construction fails to replicate on a 15-task slice — investigate before trusting anything else in the study |
| H4 fails | Asks that dead-end or mis-integrate are real: the ask path needs a re-grounding step after the answer (e.g. re-attach the view), measured before the reply UX ships |

## Protocol notes, registered up front

- L2's value quality is ungraded by design (no deterministic grader
  for "punchier"); its outcome classes are mechanical. Disclosed.
- The L3 "both" outcome is a defensible literal reading of a
  singular descriptor over two matches; it is reported separately
  and counted as not-asked for AE-H2. Disclosed.
- The resume answer template gives the value verbatim; it does NOT
  re-attach a view containing the source node. That is deliberate:
  it measures the shipped chat shape (user answers in text) rather
  than the U-view2 fix.
- L0/L4 reuse means 30 of 75 calibration tasks overlap Study AC's
  cells at a different slice size; they are anchors, not new
  evidence, and are labeled as such in analysis.

**Expected spend $8–15** (450 U-class cells + 135 two-call cells
across three tiers); abort past $40. Honesty rules unchanged: this
brief, the corpus generator and its seed, the registered templates,
the outcome classifiers, and all thresholds are committed before the
first scored call; results publish whatever they show.
