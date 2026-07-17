# Addendum brief — Study AJ: the correction loop in isolation (does error-message quality do anything?)

**Pre-registration, committed before any scored AJ run.** Returning
barkup's structured validation issues verbatim has been a design
commitment in every arm of all thirty-five studies, is playbook
guideline 01's closing instruction, and is standing guidance in the
downstream digest ("keep returning barkup's structured issues to
the model verbatim") — and it has never once been an experimental
variable. Study AJ isolates it: same tasks, same views, same
protocol, with ONLY the correction feedback varied. Either
structured issues are load-bearing (the commitment is validated at
last), or models recover just as well from "invalid patch, try
again" (the commitment is developer UX, not model accuracy — a
finding that would soften shipped guidance honestly).

## The isolation trick: seeded failures

Correction loops rarely trigger naturally (first-pass validity runs
84–99%), so AJ seeds them. For each task the known-correct anchored
patch is derived from the corpus edit, corrupted by a registered
operator, and injected as the ASSISTANT'S prior turn (a fenced JSON
block). The corrupted patch is run through the SHIPPED applier to
harvest its genuine structured issues; the cell then sends exactly
ONE feedback message (the arm's only difference) and grades the
single reply. Single-shot recovery isolates feedback quality —
multiple rounds would let the bare arm brute-force. Disclosed up
front: injected errors are a constructed proxy for organic model
errors; the distribution differs, the mechanism (recovering from a
known-bad patch given feedback) is the same.

## Corpus

`corpus/seeded-failures.json`, **seed 20260719**, built by
`scripts/generate-seeded-failures.ts` from the size-extension corpus
(45 tasks, exactly 9 per edit kind). One corruption per task,
assigned by a registered kind × class matrix, cycling in corpus
order within each kind:

| Edit kind | Corruption classes (cycled) |
|---|---|
| set-attribute | dangling-id · missing-field (no value) · unknown-attribute |
| set-name | dangling-id · missing-field (no name) · malformed-op |
| remove-node | dangling-id · malformed-op · missing-field (no id) |
| insert-node | dangling-parent · bad-anchor (non-sibling) · malformed-op |
| move-node | dangling-id · bad-anchor (non-sibling) · missing-field (no placement) |

Class totals (disclosed, uneven by design): dangling-id/parent 15,
missing-field 12, malformed-op 9, bad-anchor 6, unknown-attribute 3.
Validators, unit-tested before any scored call: the UNcorrupted
patch applies through the shipped applier and equals the task's
expected tree (validating the edit→op mapping), and every corrupted
patch FAILS the shipped applier with at least one issue.

## Arms (3): the feedback message, verbatim

All three share the registered retry wrapper `The patch was NOT
applied — reply with a complete corrected patch against the tree
exactly as originally shown.` and differ ONLY in what precedes it:

- **AJ-structured** — `formatIssuesFeedback(issues, "anchored
  patch")`, the shipped protocol character-for-character.
- **AJ-codes** — `The anchored patch was invalid (issue codes:
  <codes, comma-joined>).` — the dose-response middle rung.
- **AJ-bare** — `The anchored patch was invalid.`

Protocol otherwise standard: minimal view on the edit's referenced
ids, conditionF + VIEW_RULES system, temperature 0, shipped applier,
`equalModuloNewIds` vs the expected tree. Outcomes: recovered /
valid-but-wrong / still-invalid.

**Models (3):** sonnet-4.5, gemini-3.5-flash, opus-4.8.
45 × 3 × 3 = **405 cells**, resumable JSONL
`results/raw/studyaj-<model>.jsonl`, cache audit re-run.

## Pre-registered hypotheses and gates

- **AJ-H1 (is structure load-bearing?):** per model, McNemar on
  recovery, AJ-structured vs AJ-bare, paired by cell. **Gate:
  structured significantly better (p < 0.05) on at least two of
  three models.** A failed gate with parity is the "commitment is
  UX" finding; a failed gate with bare BETTER would be a genuine
  shock, reported as found.
- **AJ-H2 (dose-response, descriptive):** AJ-codes relative to both
  neighbors, per model.
- **AJ-H3 (where structure matters, descriptive):** recovery by
  corruption class × arm — the prior (recorded, not gated):
  placement/anchor errors need the structured paths most;
  dangling-id errors are most recoverable blind.
- **AJ-H4 (failure anatomy, descriptive):** valid-but-wrong rates
  by arm — does thin feedback induce wrong-direction "fixes" rather
  than honest failures?

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| H1 passes | The verbatim-issues commitment is validated as accuracy-bearing: guideline 01 and the digest instruction gain a measurement; candidate fourteenth regression gate |
| H1 fails at parity | The loop is robust to bare feedback: structured issues are developer UX, not model recovery — shipped guidance softens honestly ("return issues verbatim; it costs nothing and helps humans; models recover either way") |
| H1 splits by tier | Feedback quality is another capability-shaped variable — report which tiers need the structure |
| Bare beats structured anywhere | Reported as found, investigated before any guidance changes |

**Expected spend $5–9** (405 cells, ~2.5k input tokens each); abort
past $25. Honesty rules unchanged: this brief, the corruption
matrix, the operators, the three feedback texts, and the seed are
committed before the first scored call; results publish whatever
they show.
