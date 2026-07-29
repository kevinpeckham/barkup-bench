# Addendum brief — Study AQ: the powered fence (does the anti-self-eviction sentence close the client-prune pathway on the tiers that now need it?)

**Pre-registration, committed before any scored AQ run.** Study AL
measured the prompt-side fence against the client-prune pathway and
returned "unproven, not disproven": directionally right at zero
cost (pooled prunes 5→1) but underpowered at n=10 per tier against
a control baseline that halved in three days of provider weather.
The filed follow-up — a re-registration with enough repetitions to
detect a 2–3/10 baseline — sat unattractive while the only pruning
tiers (sonnet, gemini) were not shipping candidates. The 2026-07-29
open-weight backfill changed that: BOTH plausible successor tiers
failed the regression suite's goal-safe eviction slice with exactly
this anatomy — fable-5 7/10 (three client prunes, every victim a
goal), kimi-k3 8/10 (one goal prune, one lossy self-consolidation)
— by being MORE cap-obedient than the shipped tier, which passes by
over-sending. The fence is now the blocking item on any tier swap.
AQ is the powered measurement, run where the decision lives.

## Design (AL's protocol, powered and re-aimed)

Corpora reused verbatim, checked by content hash before any scored
call:

- **Cap-edge (the injury site):** the 40 K=20 integrity tasks of
  `corpus/memo-consolidation.json` (seed 20260719, the AM corpus) —
  4× AL's cell count at the site that decides everything.
- **Under-cap no-op guard:** the 20 K∈{10,19} integrity tasks of
  `corpus/memo-scale.json` (seed 20260718), fence arm only,
  mirroring AL.

Runner protocol identical to AK/AL/AM: shipped prompt rule + memo
block + `update_session_notes` through the ported v3.213.0 handler
with the CURRENT shipped notice (which includes the v3.215.0
consolidation invite — both arms carry it; the handler and notice
are not variables). ONE variable, exactly AL's:
`SESSION_NOTES_PROMPT_RULE` gains the registered fence sentence,
byte-identical to AL (`AL_FENCE_SENTENCE` in
src/harness/memoscale-runner.ts):

> Never drop or trim an existing note to make room — even if the
> memo looks full, send every existing note plus your change; the
> app decides evictions and will notify you if one occurs.

**Arms:** AQ-control = the harness's `AK-eviction` arm verbatim;
AQ-fence = `AL-fence` verbatim. Both arms run on every cap-edge
task, INTERLEAVED in one queue (control and fence cells for the
same task adjacent, one run, one provider window) — AL's drift
lesson made protocol: the baseline and the contrast sample the same
weather.

**Models:** `anthropic/claude-fable-5` and `moonshotai/kimi-k3` —
the swap candidates, gated; `anthropic/claude-sonnet-4.5` and
`google/gemini-3.5-flash` as continuity anchors to AK/AL,
descriptive only. Opus-4.8 is excluded: 0 prunes in AK, 10/10 on
the regression slice, and its fence exposure was measured in AL —
no decision rides on re-measuring it.

Cells: cap-edge 40 × 2 arms × 4 models = 320, no-op guard 20 × 4
models = 80 — **400 scored cells**.

## Pre-registered hypotheses and gates

A cap-edge cell is a **prune cell** when the raw tool call carries
fewer notes than (existing + new) with at least one old note absent
(the harness's `pruned-old` / `lost-old` outcomes); **goal-loss**
when any lost note is a goal (client-side or post-notice; the
pipeline itself never evicts goals — AK). Pairing is by task id.

- **AQ-H1 (the fence effect — per swap candidate, the gate):** on
  40 paired cap-edge tasks, exact McNemar (sign test on discordant
  pairs) shows fewer prune cells under the fence at p < .05, AND
  fence-arm goal-loss cells ≤ 2/40. Minimum detectable effect: 6
  one-way discordant pairs (p = .03125) — detectable even if the
  control baseline halves again from the regression-run rates
  (fable 3/10 → expected ~12/40; kimi 2/10 → ~8/40).
- **AQ-H2 (no-op guard — every model):** fence-arm under-cap cells:
  clean no-op ≥ 19/20 (the AK band; the fence must not make
  under-cap updates weird).
- **AQ-H3 (the declaration lands — every model, both arms):** the
  new note is present in the final memo in ≥ 38/40 cap-edge cells
  per arm (the fence must not convert pruning into refusal or
  paralysis).
- **AQ-H4 (descriptive):** pathway split per model per arm
  (over-send → designed eviction / spontaneous consolidation /
  client prune), victim kinds, consolidation-on-notice reactions
  under the shipped invite, anchor-tier movement vs AK/AL (the
  drift record), token cost.
- **The study gate: AQ-H1 on BOTH swap candidates, plus AQ-H2 and
  AQ-H3 on all four models.**

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| All pass | The fence is measured protection on the tiers that need it: it ships as part of any fable-5/kimi-k3 tier-swap package (added to SESSION_NOTES_PROMPT_RULE; whether it ships universally or tier-scoped is a product call informed by AL's opus data), and the regression memo-scale slice is expected green with the fence — re-run the suite to confirm before any swap |
| H1 passes on one candidate only | Tier-scoped fence: protection is real but per-tier; the failing candidate's swap remains blocked pending an app-side lever |
| H1 fails on both with intact baselines (≥6 control prunes/40) | The prune pathway is not instruction-closable at the new frontier either — the fence line of inquiry CLOSES (two studies, two model generations, no reliable effect); the next lever is app-side and needs its own registration (candidate: advertise a lower cap than the app enforces, so cap-obedient trimming never bites; note the AM constraint that merge-style shapes would break measured lossless consolidation) |
| Control baselines collapse (< 6 prunes/40 on both candidates) | Provider weather again, now twice — the exposure itself is unstable week to week; report, no ship, and the regression suite's periodic cadence becomes the monitoring instrument |
| H2 or H3 fails | The fence has a measurable tax AL's n could not see — it does not ship regardless of H1; report the tax anatomy |

## Cost fence

400 cells, short sessions (≤4 tool steps + possible post-notice
round). Projected **$10–25**, dominated by fable-5. Authorized
2026-07-29 ("proceed with AQ").
