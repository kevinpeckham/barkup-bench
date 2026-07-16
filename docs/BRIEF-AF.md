# Addendum brief — Study AF: restate-before-rewrite (Track 2, JUDGE-GRADED — V's inferred clause, measured)

**Pre-registration, committed before any scored AF run. This is the
series' second Track 2 study: its verdicts are judge-graded and are
never pooled with the deterministic claims.** Study V measured that
memos carry qualitative goals at parity with explicit instructions,
while a goal the model merely READS from a view loses 117/120 judged
comparisons despite demonstrably reading it. The shipped mitigation
(v3.183.0, verbatim in `src/shipped/session-notes.ts`) added one
clause: *"restate a goal from the memo in your own words before a
goal-directed rewrite."* That self-restatement step was inferred,
not measured — V tested where the goal LIVES, never whether forced
verbalization converts reading into telling. Study AF measures the
clause, in the shipped memo configuration and in the unshipped
view-side extension that would close V's gap if restatement is the
active ingredient.

## Corpus and judges: reused, not regenerated

`corpus/rewrite.json` (seed 20260715, 30 About pages with a planted
off-thesis paragraph) and `corpus/judge-calibration.json` (seed
20260716) verbatim. Judge protocol is Study V's, unchanged: primary
`openai/gpt-5.4`, sensitivity `anthropic/claude-haiku-4.5`, pairwise
vs control, both presentation orders at temperature 0, verdict only
on order-consistency, mechanical failures auto-ruled without a judge
call. **Both judges must re-pass the registered calibration gate
(30/30 known pairs, 10/10 identity ties, 10/10 length probes)
before any scored verdict** — judges are graders, and graders get
re-tested per study.

## The registered restate clause

The shipped sentence mandates no output format, which makes
compliance undetectable. AF operationalizes it with one registered
formatting sentence appended to the arm instruction, verbatim:

> `Begin your reply with a single line starting "GOAL:" that
> restates the goal of this rewrite in your own words. Then give
> the patch in a fenced code block.`

Compliance is deterministic: the first-round reply matches
`/^GOAL:/m`. Disclosed: this is a formatted operationalization of
the shipped format-free clause; the GOAL line itself is recorded for
descriptive analysis.

## Arms (3), 30 tasks each

- **AF-control** — Study V's V-instr arm verbatim (thesis stated in
  the instruction), re-run contemporaneously. Judged pairs compare
  same-batch edits; V's published numbers are anchors, never pooled.
- **AF-memo-restate** — the SHIPPED configuration: V-conv-memo
  verbatim (thesis in the session-notes block, instruction says
  "the central thesis we discussed") plus the restate clause.
- **AF-view-restate** — the extension: V-doc-view2 verbatim (the
  thesis-bearing mission node IN the view, instruction says "as
  stated in the mission section") plus the restate clause. If
  restatement is the active ingredient, this is the arm that
  rescues V's 117/120 loss.

**Editors (3):** sonnet-4.5 and gemini-3.5-flash (V comparability)
plus claude-opus-4.8 — the shipped tier's first Track 2 data.
270 edits; judged comparisons 2 arms × 30 tasks × 3 editors = 180
per judge, both orders.

## Pre-registered hypotheses and gates

- **AF-H1 (does restatement rescue the view?):** per editor,
  AF-view-restate vs AF-control, order-consistent win/loss sign
  test. The arm passes for an editor if it is NOT significantly
  control-favored (p > 0.05, or arm-favored). **Gate: passes on all
  three editors.** (Anchor: V-doc-view2 lost 117/120 pooled —
  near-zero wins; any recovery to indistinguishable is a large
  effect.)
- **AF-H2 (does the shipped clause keep the memo's parity?):** per
  editor, AF-memo-restate vs AF-control, same criterion. **Gate:
  passes on all three editors.** (Anchor: V-conv-memo tied or beat
  control without a measured restate step; the question is whether
  mandated restatement preserves or harms that.)
- **AF-H3 (descriptive, never gated):** GOAL-line compliance rate
  per arm/editor; thesis-keyword coverage of the GOAL lines and the
  rewrites (V's registered proxy); win/loss/tie tables per judge;
  judge agreement; opus's first qualitative profile; descriptive
  comparison to V's published rows (labeled non-contemporaneous).

## Interpretation table (pre-registered)

| AF-H1 | AF-H2 | Reading |
|---|---|---|
| passes | passes | Restatement is the active ingredient: the shipped clause is validated AND the view gap has a one-sentence fix — "read it, say it, then write" becomes measured guidance |
| fails | passes | "Views carry values, memos carry goals" HARDENS: even forced verbalization cannot anchor a read goal; the shipped clause is validated only where the memo already carries the goal; the view-side hope dies |
| passes | fails | Restatement helps reading but disturbs the memo path — investigate the interaction before touching the shipped rule |
| fails | fails | The clause is theater or harm: file for removal from the shipped prompt rule (with the replicator digest updated) — an inferred clause that measures negative does not survive |

## Protocol notes, registered up front

- Track 2 labeling everywhere: judge-graded, never pooled with
  deterministic studies; the analysis file and REPORT addendum carry
  the label.
- Layer-1 mechanical grading (only the target's content changed,
  legally, no verbatim thesis copy) uses V's fixed structural
  comparator; mechanical failures auto-rule a pair (arm-side failure
  = loss, control-side = win, both = excluded) exactly as in V.
- The GOAL line precedes a fenced patch; the artifact extractor
  reads fenced blocks, so the format does not mechanically penalize
  the restate arms. Non-compliant replies (no GOAL line) are still
  graded on their patch; compliance is reported, not enforced.
- Editor temperature 0 throughout; ≤3 correction rounds as in V.

**Expected spend $10–18** (270 edits + ~720 judge calls + 200
calibration calls); abort past $40. Honesty rules unchanged: this
brief, the clause text, the compliance regex, and all gates are
committed before the first scored call; results publish whatever
they show.
