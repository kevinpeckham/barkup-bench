# Addendum brief — Study AL: the prompt-side fence (can an instruction close the client-prune pathway?)

**Pre-registration, committed before any scored AL run.** Study AK
validated the v3.213.0 eviction end-to-end on the pathway the app
can see: wherever the model over-sends, the pipeline admits the new
note, evicts oldest-fact-first, and never loses a goal (AK-H1
100%, opus goal-safe 0/10 → 10/10 at K=20). The residue is the
pathway the app cannot see: at the cap edge sonnet pruned 4/10 and
gemini 6/10 client-side — the raw call already missing an old note
— and **every prune victim was a goal**. The app cannot restore
what it never receives. AK's interpretation table filed the
follow-up: a prompt-side fence ("send the COMPLETE list including
every existing note; the app decides evictions") — measured before
shipped, never shipped untested. AL is that measurement.

**The honest odds, stated up front:** the shipped prompt rule and
tool description ALREADY say "send the COMPLETE updated list", and
the memo block never shows the model a cap number (the 20-note cap
is only named in the eviction notice, after the fact). Sonnet and
gemini pruned anyway — trimming a long list unprompted. AL
therefore tests something narrower than "does the model follow
instructions": whether an explicit anti-self-eviction clause
overrides a tidying behavior that a softer completeness instruction
did not. A null result is a real result: it would mean the prune
pathway is not instruction-closable at these tiers, and the next
lever is app-side (a diff/merge update shape that cannot express
omission), not prompt-side.

## Design

Corpus reused verbatim: the 30 integrity tasks of
`corpus/memo-scale.json` (seed 20260718, K ∈ {10, 19, 20} × 10),
checked by content hash; needle↔note alignment re-verified by unit
test before any scored call. Runner protocol identical to AK's
eviction arm (shipped prompt rule + memo block +
update_session_notes tool, one session, MAX_TOOL_STEPS 4). Both
arms run the v3.213.0 handler (`applySessionNotesUpdate`, notice
returned verbatim) — the handler is NOT the variable. ONE variable:
the text of `SESSION_NOTES_PROMPT_RULE`.

- **AL-control** — AK-eviction verbatim (shipped rule unchanged).
  Run at K=20 only: a contemporaneous replication of the prune
  residue (AK measured sonnet 4/10, gemini 6/10, opus 0/10).
- **AL-fence** — the same handler; the prompt rule gains one
  sentence, frozen here verbatim and appended to
  `SESSION_NOTES_PROMPT_RULE`:

  > Never drop or trim an existing note to make room — even if the
  > memo looks full, send every existing note plus your change; the
  > app decides evictions and will notify you if one occurs.

  Run at all three K levels (the under-cap levels are the no-op
  guard). The tool description is unchanged — the fence is
  prompt-side only, matching AK's filed wording; widening it to the
  tool description would be a second variable.

Cells: fence 30 tasks × 3 models = 90, control 10 × 3 = 30 — 120
scored cells. Models: the standard trio (sonnet-4.5,
gemini-3.5-flash, opus-4.8). Opus is not expected to move (0/10
prunes in AK) and is included as the shipped-tier guard: the fence
must not degrade a currently-perfect tier, and its
consolidation-on-notice behavior (one AK cell, unregistered) gets a
second descriptive look. Estimated ≈$2–4 — pilot scale, no spend
gate.

Multi-call sessions: the FINAL call's raw argument is classified
(last-write-wins, matching shipped replace semantics); extra calls
recorded and reported descriptively — unchanged from AK.

## Grading (deterministic, needle-based, pure classifier unit-tested)

`evaluatePipeline` unchanged from AK (the fence arm evaluates under
the same eviction pipeline as AK-eviction; a unit test pins the arm
mapping before any scored call). Same classifications: goal-safe,
designed-eviction, prune-path cells by victim kind (pruned-goal /
pruned-rule / pruned-fact), under-cap clean-update.

## Hypotheses and gates

- **AL-H1 (prune closure at K=20 — the primary).** Client-prune
  incidence, fence vs control, on the pruner tiers. Per-model
  McNemar exact at n=10 cannot reach p < .05 for sonnet's expected
  4/10 → 0/10 (floor p = .125), so the significance gate is pooled
  over the two pruner tiers, paired by task. **Gate: pooled
  sonnet+gemini prune rate falls with McNemar exact p < .05 AND
  each pruner tier prunes ≤ 1/10 under the fence.** (Expected
  pooled movement 10/20 → ≤ 1/20, p ≈ .004 if fully closed.)
- **AL-H2 (goal-safe closure downstream).** With prunes closed, the
  eviction pipeline already handles over-sends, so K=20 goal-safe
  should approach the ceiling. **Gate: goal-safe ≥ 9/10 per pruner
  tier under the fence** (AK measured 6/10 sonnet, 4/10 gemini;
  control arm replicates those).
- **AL-H3 (no new damage).** The fence must be inert where nothing
  is at stake. **Gate: clean updates ≥ 9/10 per model per K at
  K ∈ {10, 19}, AND opus K=20 goal-safe ≥ 9/10.** (Failure modes
  being guarded: verbatim-dump bloat, malformed lists, the fence
  spooking a model out of calling the tool at all.)
- **AL-H4 (cost of the fence — descriptive with a flag).** Mean raw
  list length and mean output tokens per integrity cell, fence vs
  control per model. No pass/fail gate; **flag if fence output
  tokens exceed 2× control** — a fence that works but doubles the
  memo write cost is a different shipping conversation, and the
  table below prices it in.
- **AL-H5 (descriptive, no gate).** Post-notice behavior under the
  fence: extra update calls, re-adds of evicted facts, and any
  recurrence of opus's consolidation-on-notice (memo compressed to
  carry all needles). Reported as behavior counts, not mechanisms.

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| H1 + H2 + H3 pass, no H4 flag | The fence closes the prune pathway at measured tiers. Eligible to ship to the replicator prompt (ship decision is the app's); extend the memo-scale regression gate to the fence arm; digest the residue as closed-by-fence, bounded by the measured tiers. |
| H1 fails | The prune pathway is not instruction-closable at these tiers. Do NOT ship the fence (a token tax that doesn't buy the guarantee); file the app-side lever — an update shape that cannot express omission (diff/merge tool or server-side missing-note reconciliation) — as the next candidate. |
| H1 passes, H3 fails | The fence works at the cap but damages the common case (bloat, malformed lists, or tool avoidance under cap). Do not ship as worded. A re-worded fence is a NEW pre-registered arm, not a tweak to this one. |
| H1 + H2 + H3 pass, H4 flagged | The guarantee is real and so is the price. Publish both; the ship decision weighs permanent goal loss against per-call token cost — the bench prices the trade, the app makes it. |
| Opus regresses under the fence (H3 opus clause) | The shipped tier pays for a fix aimed at other tiers. Do not ship; report the tier split. |

## Protocol

Prompts and handler semantics frozen at this commit; corpus reused
by content hash; graders pure and unit-tested before any scored
call; cache audit re-run post-hoc; results published regardless of
direction. Raw records to `results/raw/studyal-<model>.jsonl`
(gitignored), analysis to `results/analysis-study-al.txt`
(committed), REPORT.md addendum + README index row on completion.
