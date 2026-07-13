# Addendum brief — Study AC: ask versus guess (is silent failure a prompting defect?)

**Pre-registration, committed before any scored AC run.** The series'
recurring villain is silence: a model missing information never says
so — 90/90 silent inventions (U), 144/144 silent guesses (X), 120/120
oblivious polishes (V), zero clarifying questions in twenty-eight
studies. But no study ever OFFERED an escape hatch. Study AC offers
two, on the series' cleanest silent-failure construction, and
measures both whether models take the exit when they should and what
the exit costs when they shouldn't.

## Corpus: reused, not regenerated

Study U's dependent-edit corpus (`corpus/dependent.json`, seed
20260714, 45 tasks: 24 value-copy + 21 structure-read across three
tree sizes), whose defining property is already unit-validated: the
value the edit needs (`needle`) is **verifiably absent** from the
instruction and from the target-only view, and **verifiably present**
in the both-nodes view.

- **Unsolvable cells** — the target-only view (Study U's U-view1
  construction verbatim). Correct behavior: ask.
- **Solvable twins** — the both-nodes view (U-view2 verbatim,
  measured 90/90 solvable). Correct behavior: solve WITHOUT asking.

## Arms (3), identical across both cell types

- **AC-base** — U-view1/U-view2 verbatim, no hatch. The
  contemporaneous control (U measured 0/90 asks, all silent guesses).
- **AC-rule** — the same conditions with one registered sentence
  appended to the system prompt, verbatim:

  > `If the request requires a value or a node that is not visible in
  > the view and not stated in the request, do NOT guess: reply with a
  > single line "NEED-INFO: <what is missing and where you would need
  > to read it>" instead of a patch.`

  A reply whose trimmed text starts with `NEED-INFO:` is an ask;
  anything else is graded as a patch. Deterministic.
- **AC-tool** — the same conditions with an `ask_user` tool instead
  of the prose rule. Registered tool definition, verbatim:
  name `ask_user`; input `{ question: string }`; description:

  > `Ask the user for information you need and cannot see. Use this
  > INSTEAD of guessing when the request requires a value or a node
  > that is not visible in the view and not stated in the request.
  > Calling this ends your turn.`

  Any `ask_user` call is an ask and ends the cell; a text reply is
  graded as a patch (the tool remains available in correction
  rounds).

An ask ends the cell (no correction rounds follow an ask). Invalid
patches keep Study U's correction loop (≤3 rounds, issues verbatim).

## Cells and models

45 tasks × 2 views × 3 arms × 3 models (sonnet-4.5,
gemini-3.5-flash, opus-4.8) = **810 cells**. Protocol otherwise
Study U's: condition-F anchored patches, `maxOutputTokens: 60000`,
temperature 0, resumable JSONL `results/raw/studyac-<model>.jsonl`,
solve grading via Study U's registered grader (equal-modulo-new-ids
vs the expected tree), cache audit re-run.

**Outcome classification per cell (deterministic):** `asked` /
`solved` (patch applies and grades correct) / `wrong-patch` (patch
applies, grades wrong — the silent guess) / `invalid` (no valid
patch after corrections).

## Pre-registered hypotheses

- **AC-H1 (the hatch works — the gate):** on unsolvable cells, a
  hatch mechanism passes for a model if `asked` exceeds half of
  cells (exact binomial vs 0.5, one-sided, p < 0.05 — i.e. ≥ 29/45).
  **The gate passes if at least one mechanism (rule or tool) passes
  on all three models.** AC-base is expected at 0 asks by
  construction (no hatch exists) and anchors the guess anatomy.
- **AC-H2 (the hatch is affordable — the co-gate):** for each
  mechanism that passes AC-H1: on solvable cells, false-ask rate
  ≤ 10% (≤ 4/45) per model AND solve rate not significantly below
  AC-base (McNemar per model, p > 0.05 or hatch-favoring). A hatch
  that fires on more than a tenth of solvable requests, or that
  degrades solving, fails.
- **AC-H3 (descriptive):** rule vs tool mechanism comparison;
  ask-quality heuristic (the ask text names the source — contains
  `sourceId`, or for structure-reads the registered reference's
  attribute value — reported, never gated); value-copy vs
  structure-read and tree-size splits; what the residual guesses
  look like under a hatch.

## Interpretation table (pre-registered)

| AC-H1 | AC-H2 | Reading |
|---|---|---|
| passes | passes | Silence is a prompting defect — the hatch ships as guidance beside the U/X context contracts, and five studies of silent-failure anatomy get a cheap companion fix |
| passes | fails | Models can ask but the hatch taxes solvable requests — surface-by-surface tradeoff, documented |
| fails | — | Models guess even when explicitly invited to ask: silence is structural, app-side context contracts are the ONLY defense, and "just prompt it to ask" is measured cope |

## Protocol notes, registered up front

- The tool arm gives the model a tool in an otherwise tool-free patch
  protocol; the base and rule arms remain pure text. Mechanism
  differences are therefore confounded with the presence of ANY tool —
  disclosed, and why AC-H3 is descriptive.
- Study X's anaphora cells are the other validated silent-failure
  construction; they need session machinery and are explicitly
  deferred to a follow-up rather than scoped here.

**Expected spend $6–12**; abort past $30. Honesty rules unchanged:
this brief, the two hatch texts verbatim, the outcome classifier, and
all arm constructions are committed before the first scored call;
results publish whatever they show.
