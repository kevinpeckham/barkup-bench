# Addendum brief — Study AK: eviction validation (does the AH fix close the cap-edge injury?)

**Pre-registration, committed before any scored AK run.** Study AH
found that at the memo's 20-note cap edge the pipeline sacrifices a
note 30/30, and every victim was a GOAL — the block renders
facts→rules→goals, so both loss pathways (the model over-sending 21
notes and the shipped clamp keeping the first 20, and the model
pruning client-side before sending) eat the tail. The replicator
shipped v3.213.0 (commit 434532a) in response:
`evictSessionNotesToFit` + `applySessionNotesUpdate`, an app-side
eviction that runs BEFORE the registered clamp in the
update_session_notes handler — evict the oldest FACT, then the
oldest RULE, and never a goal unless the memo is all goals. The
bench carries a verbatim port (`src/shipped/session-notes.ts`,
guarded by `tests/eviction.test.ts` and a regression gate), but the
pipeline has only ever been unit-tested. Study AB set the standard:
a fix shipped in response to a finding gets re-measured at the
injury site. AK is that measurement.

**The fix's honest boundary, stated up front:** the eviction runs
in the app, on what the model sends. It can convert a clamp victim
(over-send pathway) from tail-goal to oldest-fact, but it cannot
restore a note the model already pruned client-side — the app never
receives it. AH measured the pathway split at K=20: opus over-sent
10/10, sonnet 7/10 (3 prunes), gemini 2/10 (8 prunes). End-to-end
benefit is therefore predicted to be bounded by each tier's
over-send rate, and the prune residue is documented, not hidden.

## Design

Corpus reused verbatim: the 30 integrity tasks of
`corpus/memo-scale.json` (seed 20260718, K ∈ {10, 19, 20} × 10; at
K=20 the memo is 12 facts + 5 rules + 3 goals in list order
facts→rules→goals, and the declared new note is always a FACT — so
the designed eviction outcome on an over-send is: oldest fact
evicted, new fact admitted, all three goals and all rules intact).
No new corpus; needle↔note alignment (`oldNeedles[i]` ∈
`notes[i].text`) re-verified by unit test before any scored call.

Same runner protocol as AH (shipped prompt rule + memo block +
update_session_notes tool, one session, MAX_TOOL_STEPS 4, the edit
graded report-only). ONE variable: what the tool handler does with
the raw argument.

- **AK-control** — AH's handler verbatim: persist
  `normalizeSessionNotes(notes)` (the registered clamp alone),
  return `{applied: true, notes}`. Contemporaneous replication of
  the injury. Run at K=20 only (the injury site).
- **AK-eviction** — the v3.213.0 handler: persist
  `applySessionNotesUpdate(notes).notes` and return its `result`
  verbatim (which reports any eviction back to the agent via
  `evicted` + `notice`). Run at all three K levels.

Cells: eviction 30 tasks × 3 models = 90, control 10 × 3 = 30 — 120
scored cells. Models: the standard trio (sonnet-4.5,
gemini-3.5-flash, opus-4.8). Estimated ≈$2–4 — pilot scale, no
spend gate.

If a model calls the tool more than once in a session (e.g. reacting
to the eviction notice), the FINAL call's raw argument is classified
— last-write-wins, matching the shipped replace semantics — and the
extra calls are recorded and reported descriptively.

## Grading (deterministic, needle-based, pure classifier unit-tested)

For the final raw argument and its post-pipeline memo (per arm's
pipeline):

- **goal-safe** — the new needle survives post-pipeline AND every
  goal-note needle survives post-pipeline.
- **designed-eviction** (eviction arm, over-send path) — goal-safe
  AND the evicted set is exactly non-goal notes.
- Prune-path cells (raw ≤ 20 with an old needle already missing from
  the raw list) are classified by victim kind: pruned-goal /
  pruned-rule / pruned-fact.
- Under-cap cells keep AH's `clean-update` criterion unchanged.

## Hypotheses and gates

- **AK-H1 (mechanical guarantee — pooled, eviction arm).** In every
  cell where the raw list exceeds the cap, the pipeline admits the
  new note and evicts zero goals. **Gate: 100%** — one violation
  fails (this is the shipped code's contract; a violation is a port
  or logic bug and gets filed upstream, not narrated around).
- **AK-H2 (end-to-end injury closure at K=20).** Goal-safe rate,
  eviction vs control, McNemar exact per model. **Gate: significant
  improvement (p < .05) on ≥ 2 of 3 models AND opus eviction
  goal-safe ≥ 9/10.** (AH's pathway split predicts opus ~10/10 and
  sonnet ~7/10 goal-safe under eviction vs 0/10 under control;
  gemini, prune-dominant at 2/10 over-sends, is expected n.s. and
  is reported descriptively either way.)
- **AK-H3 (no new damage under the cap).** Eviction-arm clean
  updates at K=10 and K=19 ≥ 9/10 per model per K (AH-H3's gate,
  unchanged — the eviction pipeline must be a strict no-op where
  the update fits).
- **AK-H4 (descriptive, no gate).** Residual prune pathway at K=20
  per model (rate and victim kinds); post-notice behavior (extra
  update calls after the eviction notice, and whether models try to
  re-add the evicted fact); control-arm taxonomy vs AH's (the
  replication check).

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| H1 + H2 + H3 pass | Fix validated end-to-end: goal preservation is an app guarantee on the clamp pathway; prune residue is tier-dependent and documented. Upgrade digests from "designed" to "measured"; extend the memo-scale regression gate to the eviction pipeline. |
| H1 passes, H2 fails (behavior shift: more client prunes this run) | The mechanical guarantee holds but end-to-end benefit is bounded by the over-send rate. File the prompt-side fence ("send the COMPLETE list including every existing note; the app decides evictions") as a follow-up candidate — do NOT ship it untested. |
| H1 fails | Port or shipped-logic bug. File upstream immediately; no claims ship. |
| H3 fails | The eviction pipeline damages under-cap updates — a regression worse than the injury. File upstream immediately. |

## Protocol

Prompts and handler semantics frozen at this commit; corpus reused
by content hash; graders pure and unit-tested before any scored
call; cache audit re-run post-hoc; results published regardless of
direction. Raw records to `results/raw/studyak-<model>.jsonl`
(gitignored), analysis to `results/analysis-study-ak.txt`
(committed), REPORT.md addendum + README index row on completion.
