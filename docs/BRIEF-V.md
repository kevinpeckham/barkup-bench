# Addendum brief — Study V: qualitative strategic rewrites (Track 2: judge-graded)

**Pre-registration, committed before any scored V run.** Twenty-one
studies graded every claim with deterministic, unit-tested graders.
Study V asks the question that grader cannot reach: when a request is
*qualitative* — "rewrite this paragraph so it focuses on our central
thesis" — do the context findings of Studies T and U still hold? Does
a target-only view produce silently off-goal prose the way it produced
silently invented values, and does the memo carry a *goal* the way it
carried a codename?

**Track 2 disclosure, stated loudly:** Study V opens a second grading
track. Its primary endpoint is judged by a pinned LLM judge under a
pre-registered pairwise protocol, and its results will live in a
clearly labeled judge-graded section of REPORT.md, never mixed into
the deterministic headline claims. The judge itself has a
pre-registered validation gate and is treated exactly like every other
grader in this series: unvalidated graders measure nothing, so if the
judge fails ITS gate, the study halts before any scored editing run.

## The reframe

We do not measure whether models write well. We measure whether the
**context configuration** changes goal-directed rewrite quality,
pairwise: same task, same editor model, different arm. Both sides of
every judged pair come from the same editor model, so judge
self-preference largely cancels; the judge is always omniscient (it
sees the true thesis regardless of what the editor saw).

## Corpus (seeded, committed): planted off-thesis paragraphs

`corpus/rewrite.json`, seed **20260715**, 30 tasks. A seeded generator
assembles fictional company About pages from **committed
sentence-template pools** (6 domains; each with a thesis template and
on-thesis sentence pool; company names slot-filled from the existing
slug vocabulary). Each document: a heading, a **mission** text-atom
carrying the thesis verbatim, and three paragraph text-atoms — two
assembled on-thesis, and **one target paragraph assembled entirely
from a different domain's sentences** (the planted defect). The
improvement direction is therefore known by construction. Documents
are ~10–14 nodes; `maxLength` 600 on paragraphs.

Corpus validation (unit-tested, committed): the thesis string appears
nowhere in the target paragraph; the target-only minimal view does not
contain the thesis string; every planted distractor sentence shares no
content words with the thesis; the mission node is present and carries
the thesis exactly.

## Arms (5): where does the goal live?

All arms edit by anchored patch against a minimal JSON view, condition
F prompts + VIEW_RULES, one `set-attribute` on the target's `content`.
Instruction templates, verbatim (`{thesis}` and node refs filled by
the generator):

1. **V-instr** (control): target-only view.
   `Rewrite the "content" attribute of {refTarget} so the paragraph
   focuses on our central thesis: "{thesis}". Keep it to 2 or 3
   sentences.`
2. **V-doc-view1**: target-only view.
   `Rewrite the "content" attribute of {refTarget} so the paragraph
   focuses on our central thesis, as stated in the mission section of
   this page. Keep it to 2 or 3 sentences.`
3. **V-doc-view2**: view focused on target AND mission node; same
   instruction as V-doc-view1.
4. **V-conv-memo**: target-only view; instruction
   `Rewrite the "content" attribute of {refTarget} so the paragraph
   focuses on the central thesis we discussed. Keep it to 2 or 3
   sentences.` plus the registered T-notes block appended:
   `Session notes (maintained by the application):\n- The central
   thesis is "{thesis}".`
5. **V-conv-nomemo**: same instruction as V-conv-memo, no notes block.

Editor models: `anthropic/claude-sonnet-4.5` and
`google/gemini-3.5-flash`, temperature 0, ≤3 correction rounds.
30 × 5 × 2 = **300 rewrite cells**.

## Grading pyramid

**Layer 1 — deterministic, unit-tested.** A cell is mechanically valid
iff: the patch applies; ONLY the target node's `content` changed (tree
equality elsewhere); the new content is non-empty, ≤ `maxLength`, and
is not a verbatim copy of the thesis (gaming guard). Mechanical
failures never reach a judge.

**Layer 2 — deterministic proxy, disclosed as weak.** Thesis
content-word coverage of the rewrite minus that of the original
(the generator knows the thesis tokens). Reported alongside verdicts;
judge–proxy agreement reported.

**Layer 3 — the judge.** Pairwise forced choice of each non-control
arm against V-instr, same task, same editor model. Judge prompt,
verbatim:

- System: `You are an impartial editor judging rewrites. Answer with
  JSON only.`
- User: `A paragraph on a company page was rewritten with this goal:
  focus the paragraph on the company's central thesis.\n\nThe central
  thesis: "{thesis}"\n\nThe original paragraph: "{original}"\n\n
  Rewrite 1: "{a}"\n\nRewrite 2: "{b}"\n\nWhich rewrite better
  satisfies the goal? Consider thesis focus first, then clarity;
  ignore length differences unless one rewrite is bloated or empty.
  Reply with exactly {"winner": 1} or {"winner": 2}.`

Both presentation orders, temperature 0. A comparison yields a verdict
only when both orders agree; disagreement records a **tie**.
Mechanical-failure rule (pre-registered): if exactly one side of a
pair failed Layer 1, the failed side loses without judging; if both
failed, the pair is excluded from win-rates and counted separately.

**Judges:** primary `openai/gpt-5.4`, sensitivity replication
`anthropic/claude-haiku-4.5` — both deliberately non-editors. Cohen's
kappa between judges reported; pre-registered rule: if raw agreement
< 70%, both verdict sets publish side by side and every claim is
stated at the weaker judge's strength.

## The judge's own gate (runs BEFORE any scored editing call)

A committed, seeded calibration suite (`corpus/judge-calibration.json`):

- **30 known-verdict pairs**: one side assembled on-thesis from unused
  pool sentences, the other off-thesis from distractor sentences,
  winner known by construction.
- **10 identity probes**: the same rewrite on both sides.
- **10 length probes**: a short on-thesis rewrite vs a longer rewrite
  padded with off-thesis sentences (longer side is worse).

Gate, per judge: ≥ 27/30 known pairs correct (consistent across both
orders AND right winner); ≥ 8/10 identity probes resolving to tie;
≥ 9/10 length probes correct. The primary judge must pass or the study
halts and the failure publishes. The sensitivity judge failing its
gate demotes it to disclosed-descriptive.

## Pre-registered hypotheses

- **V-H1 (silent off-goal prose — the U prediction generalized):**
  V-doc-view1 and V-conv-nomemo lose to control decisively (win-rate
  vs V-instr significantly below 50%, exact binomial on consistent
  verdicts, per editor model) while remaining mechanically valid —
  the qualitative analogue of silent invention.
- **V-H2 (the fixes carry over — the gate):** V-doc-view2 and
  V-conv-memo are statistically indistinguishable from control
  (win-rate CI includes 50%) on both editor models. Passing = the T/U
  guidance (mentioned nodes in view; memo for conversation-carried
  goals) extends from exact edits to generative quality.
- **V-H3 (proxy triangulation):** the Layer-2 keyword proxy agrees
  with judged verdicts directionally (arms ranked the same way);
  divergence is reported and the judge verdicts govern.

## Interpretation table (pre-registered)

| V-doc-view1 / V-conv-nomemo | V-doc-view2 / V-conv-memo | Reading |
|---|---|---|
| lose | tie control | T/U guidance generalizes to qualitative work; docs get one sentence, not new machinery |
| lose | also lose | Views/memos suffice for exact edits but not goals — a new boundary; guidance says qualitative rewrites need the goal in the instruction |
| don't lose | tie | Models infer goals from less than we thought; the U silent-invention risk is exact-edit-specific — publish the surprise |
| mixed by arm | mixed | Publish the split; per-context guidance |

## Decision rule

If V-H2 passes, barkup's docs extend the view-contract and memo
sentences with "measured for qualitative rewrites too" and the series
gains a labeled Track 2 section. Whatever fails publishes as found.

## Protocol

Editors as Studies L/N/U (`maxOutputTokens: 60000`, temp 0, resumable
JSONL `results/raw/studyv-edits-<model>.jsonl`). Judging: temp 0,
resumable JSONL `results/raw/studyv-judge-<judge>.jsonl` keyed
(task, editorModel, arm, order); calibration results committed as
`results/analysis-judge-calibration.txt`. Cache audit re-run.
**Expected spend $15–30**; abort past $60.

Honesty rules unchanged and extended to the judge: this brief, the
sentence pools, the generator with its validations, both corpora, the
judge prompt, and the calibration gate are committed before the first
scored call; judge prompts are never revised after seeing scored
verdicts; results publish whatever they show.
