# Addendum brief — Study Y: does the memo survive how people actually talk?

**Pre-registration, committed before any scored Y run.** The
session-notes memo is now the most load-bearing component of the
measured architecture: it carries facts (T), qualitative goals (V),
and the agent writes it faithfully (W). But every declaration in
every one of those studies was announced formulaically ("For later
reference: the campaign codename is X"). Real users declare
mid-sentence, bury rules inside other requests, retract casually,
and produce chatter that sounds declarative but isn't. If casual
declarations go unrecognized, everything downstream of the memo
breaks in the series' signature shape — silently, discovered only
when a callback lands. Study Y isolates PHRASING as the variable.

## The design: twin sessions, one variable

New corpus `corpus/sessions-casual.json`, seed **20260719**, 12
session PAIRS (7 l, 5 xl) × 12 steps. Each pair shares the tree,
every edit, every instruction, every schedule slot, and the SAME
session id — the two variants differ ONLY in the text of the
declaration riders. Schedule (kinds on the standard 5-cycle):

- step 1 declares **F1** (campaign codename X1)
- step 3 declares the **RULE** (new text atoms get textStyle
  "small-caps")
- step 4 — rule-governed insert (callback)
- step 5 declares the **RETRACTION** (campaign codename → X2)
- step 6 declares **F2** (sponsor codename Y)
- step 7 — fact callback, campaign → expects X2
- step 9 — rule-governed insert (callback)
- step 12 — fact callback, sponsor
- steps 2, 8, 10, 11 carry **chatter riders** — identical in both
  variants — that declare nothing actionable.

Callback instructions are identical across variants (only
declarations are restyled). Validation as in T/W: callback values
absent from every pre-step tree and every callback instruction;
chatter contains no declarable value; casual riders contain their
declarable value verbatim (extraction must be possible); twin pairs
byte-identical except on declaring steps' instructions.

## The registered phrasing pools

**Formulaic** (the control; T/W's registered forms): "For later
reference: the campaign codename is "{X1}"." / "Standing rule: every
new text atom inserted in this session must have its "textStyle"
attribute set to "small-caps"." / "Correction: the campaign codename
is now "{X2}", not "{X1}"." / "For later reference: the sponsor
codename is "{Y}"."

**Casual** (seeded pick of one variant per rider, pools verbatim):

- campaign: `Oh, before I forget: we're going with "{X1}" as the
  campaign codename from here on.` · `Quick note, the campaign is
  codenamed "{X1}" now.` · `By the way, let's call the campaign
  "{X1}" going forward.`
- rule: `Oh and going forward, any new text atom you add should use
  textStyle "small-caps", please.` · `House style note: new text
  atoms get textStyle "small-caps" from here on.` · `One more thing,
  whenever you insert a text atom, set its textStyle to
  "small-caps".`
- retraction: `Actually, scratch the old codename: the campaign is
  "{X2}" now, not "{X1}".` · `Small correction, we renamed the
  campaign to "{X2}" (forget "{X1}").` · `Change of plans: campaign
  codename is "{X2}" from now on, "{X1}" is dead.`
- sponsor: `Also jotting this down: the sponsor codename is "{Y}".`
  · `FYI the sponsor's going by "{Y}".` · `We're calling the sponsor
  "{Y}" now, just so you know.`

**Chatter** (both variants; seeded pick of 4 from 6, verbatim):
`This page is really coming together, by the way.` · `We are showing
this to the wider team on Friday.` · `I like where the layout is
heading.` · `Busy week over here, thanks for the quick turnaround.`
· `The client saw a screenshot and seemed happy.` · `Almost lunch
time on my end, let's keep rolling.`

## Arms (3) and models

- **Y-formulaic** — stateless + worked examples + the shipped memo
  tool (Study W's agent arm verbatim), formulaic riders. Control and
  W replication (now with chatter present).
- **Y-casual** — identical, casual riders. The phrasing test.
- **Y-casual-history** — the shipped configuration (32-message
  window + memo tool) under casual riders. At 12 steps the window
  never truncates, so this measures recognition in the shipped
  surface's normal operating regime, not truncation (that was W).

Models: sonnet-4.5, gemini-3.5-flash, opus-4.8.
12 pairs × 12 steps × 3 arms × 3 models = **1,296 step records**;
48 callback cells per arm-model.

## Grading

Callback grading standard. Memo fidelity as Study W (deterministic,
planted declarables): end-of-session recall of active declarables
(X2, rule, Y), retraction handling (X1 absent), **noise** (notes
matching no declarable — the chatter false-positive metric, now with
real bait), replace-integrity, tool cadence.

## Pre-registered hypotheses

- **Y-H1 (casual recognition — the gate):** Y-casual callback
  success is statistically indistinguishable from Y-formulaic per
  model (McNemar over shared (session, step) keys, p > 0.05, all
  three models) AND casual end-memo recall is within 2 declarables
  of formulaic's total per model.
- **Y-H2 (chatter resistance — the gate's second clause):** mean
  noise notes per session ≤ 0.5 in every agent arm (i.e., the
  chatter bait produces at most one false note per two sessions).
- **Y-H3 (the shipped config under casual speech, descriptive):**
  Y-casual-history reported on all metrics; no gate.
- **Secondary:** per-declarable-kind recognition splits (is the
  casually-phrased standing RULE the weak link?), casual retraction
  handling specifically, per-model tool cadence.

## Interpretation table (pre-registered)

| Y-casual vs formulaic | Chatter noise | Reading |
|---|---|---|
| ties | ≤ 0.5 | The memo survives human speech; the extraction rule is ecologically valid as shipped |
| ties | > 0.5 | Recognition fine, discrimination weak — chatter pollutes the memo; the fix is a sharper "record only declarations" prompt clause, re-tested |
| falls short | ≤ 0.5 | Under-extraction of casual speech; per-kind split names what the prompt rule must call out (likely buried rules); fix and re-measure |
| falls short | > 0.5 | Both directions fail; the extraction rule needs a rewrite before the memo can be trusted outside the lab |

## Decision rule

Whatever the table says lands in barkup's memo guidance and the
Replicator digest, per-kind splits included, with failure anatomy
stated honestly.

## Protocol

As Studies T/W: `maxOutputTokens: 60000`, temperature 0, session as
resume unit, resumable JSONL `results/raw/studyy-<model>.jsonl`,
`cacheReadTokens` recorded, cache audit re-run, empty-reply marker
rule. The runner is Study W's memo runner with a condition-id
override (no behavior change to any registered arm). **Expected
spend $25–40**; abort past $80.

Honesty rules unchanged: this brief, the twin generator with its
validations, both phrasing pools, and all three arm wirings are
committed before the first scored call; results publish whatever
they show.
