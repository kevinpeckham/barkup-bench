# Addendum brief — Study AI: the multiplicity hatch (AE's obvious fix, measured before anyone ships it)

**Pre-registration, committed before any scored AI run.** Study AE
found that referent ambiguity is a tier split: when a singular
request matches exactly two visible nodes, opus asks 15/15 naming
both candidates, while sonnet and gemini ask 1/15 each WITH the
shipped hatch present — sonnet silently edits both matches, gemini
silently picks one. The mechanism was textual: the shipped sentence
covers information "not visible in the view," and an ambiguous
referent is entirely visible. The obvious fix is one added sentence
covering multiplicity. This series has now measured two
obvious-looking clauses at zero (AA's priority meta-rule, AF's
restate ceremony), so the clause does not ship until this study
passes it. If it fails instead, AE's "knowing when to ask is a
capability" claim hardens into its third supporting refutation.

## The registered amendment

The shipped `ASK_RULE` stays byte-identical; the candidate arm
APPENDS one sentence (additive, so a shipping change would not
touch the registered original):

> ` If the request could match MORE THAN ONE node in the view, do
> NOT pick one: reply with a single line "NEED-INFO: <which nodes
> could match and what you would need to know to choose>" instead
> of a patch.`

Ask detection is unchanged (`NEED-INFO:` line-start sentinel).

## Corpus: reused, not regenerated

`corpus/calibration.json` verbatim (seed 20260717, all 75 tasks,
all five levels — the ladder is the point: the amendment must fix
L3 without taxing L0/L1/L2 or disturbing L4).

## Arms (2), 75 tasks each

- **AI-control** — Study AE's AE-rule arm verbatim (the shipped
  sentence alone), re-run contemporaneously; recorded under
  `AI-control-l{level}` condition ids in this study's files. AE's
  published numbers are anchors, never pooled.
- **AI-rule2** — the shipped sentence plus the registered
  multiplicity sentence.

**Models (3):** sonnet-4.5 and gemini-3.5-flash (the tiers the fix
targets) plus claude-opus-4.8 (regression check: the clause must
not disturb the tier that already asks). 75 × 2 × 3 = **450
cells.** Protocol is AE's verbatim: minimal views on registered
focus ids, temperature 0, ≤3 correction rounds, AE's deterministic
per-level classifier, resumable JSONL
`results/raw/studyai-<model>.jsonl`, cache audit re-run.

## Pre-registered hypotheses and gates

- **AI-H1 (the rescue):** AI-rule2 on L3, per sub-frontier model:
  asked ≥ 12/15 (AE's registered detection bar, one-sided binomial
  vs 0.5, p < 0.05). **Gate: passes on BOTH sonnet and gemini.**
  (AE anchors: 1/15 each with the shipped sentence alone.)
- **AI-H2 (no new tax):** per model, AI-rule2 on L0+L1 pooled:
  false asks ≤ 3/30 AND solve rate not significantly below
  AI-control (McNemar, p > 0.05, or arm-favoring). L2 is reported,
  never gated (AE precedent; registered expectation: asks stay
  rare — the L2 target is named by a UNIQUE id, so the multiplicity
  clause should not fire).
- **AI-H3 (boundary non-regression):** per model, AI-rule2 on L4:
  asked ≥ 12/15; AND on opus, AI-rule2 at L3 stays ≥ 12/15.
- **The study gate: AI-H1, AI-H2, and AI-H3 all pass.**
- **AI-H4 (descriptive):** ask-quality heuristic on L3 asks (names
  both candidate ids); the residual unilateral resolutions'
  anatomy (edit-both vs pick-one) under the amended rule;
  control-arm replication of AE's split.

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| All pass | One sentence closes the mid-tier ambiguity gap: the multiplicity clause becomes a measured ship candidate for the downstream ask rules (with the same wire-a-reply-path fence), and the hatch covers both failure classes on every tier |
| H1 fails | Third obvious-clause refutation: ambiguity detection below the frontier is a capability gap prompting cannot close — app-side disambiguation stays the only defense, and AE's capability claim hardens |
| H2 fails | The clause fires on clear requests: over-asking tax measured — do not ship; scope-narrowing variants would need their own registered test |
| H3 fails | The clause disturbs behavior at boundaries it should not touch — do not ship; investigate interference before any variant |

## Protocol notes, registered up front

- The control re-run doubles as a same-corpus replication of AE's
  headline split, two days later — reported under AI-H4.
- One added sentence is the ONLY delta between arms; conditions,
  views, classifier, and corpus are byte-identical otherwise.
- Study letters: AG is reserved by a parallel session's study;
  this study takes AI in sequence after AH. *(Correction,
  2026-07-16: the reservation was a miscommunication during a
  multi-session mix-up — no parallel AG study exists. The letter
  AG remains unassigned and will be taken by the next registered
  study; AH and AI keep their published names.)*

**Expected spend $4–8** (450 U-class cells across three tiers);
abort past $20. Honesty rules unchanged: this brief and the
amendment text are committed before the first scored call; results
publish whatever they show.
