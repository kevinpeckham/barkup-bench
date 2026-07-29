# Addendum brief — Study AR: the advertised headroom (can state information do what the behavioral rule could not — and can it avoid doing what the rule did?)

**Pre-registration, committed before any scored AR run.** Study AQ
closed the fence line for the successor tiers: the anti-trim
sentence is unnecessary on fable-5 and ACTIVELY HARMFUL on kimi-k3,
where prohibiting trims also prohibited its benign lossless
consolidation (prunes 5/40 → 18/40, goal-loss 5 → 19). The filed
app-side lever is measured here: change what the model BELIEVES
about capacity instead of instructing its behavior. The shipped memo
block names no cap; models infer fullness from seeing a full list
and respond per disposition (sonnet prunes, the successors mostly
consolidate, sometimes prune). AR gives the block one line of state
— nothing imperative — and asks whether believed headroom at the
decision point dissolves cap-obedient trimming without perturbing
the benign dispositions the fence destroyed.

## The registered lines (state, not instruction)

Rendered into the memo block header, after the PRECEDENCE sentence,
with the live note count interpolated; templates frozen here
verbatim:

- **AR-headroom:** `Notes: {count} in use · an update may include up
  to 24 notes.`
- **AR-truecap:** `Notes: {count} in use · an update may include up
  to 20 notes.`

Honesty of the headroom figure, registered: the ported v3.213.0
handler accepts over-length updates and evicts down to the 20-note
storage cap — "an update may include up to 24" is a true statement
about call acceptance, not a fiction about storage. At the injury
site (20 notes + 1 new = 21 ≤ 24) the believed constraint is not
binding, so cap-obedience never triggers; the over-length send
routes through the goal-safe designed eviction. The truecap arm is
the mechanism isolator: same sentence shape, but the believed limit
BINDS at the decision point (21 > 20). If headroom helps and
truecap hurts, the mechanism is the number's relation to the
decision point; if both move together, it is mere capacity-
visibility — different ship advice either way.

**Known contradiction, registered:** the eviction notice names "the
20-note cap" verbatim and is NOT changed (the handler and notice
are not variables; changing them would be a second variable). In
these single-update cells the notice arrives after the decisive
call, so the gates are unaffected; post-notice behavior in cells
with a second call is reported descriptively (H4). If the headroom
line ships, reconciling the notice wording is a product step.

## Design

Corpora, protocol, models, output identical to AQ (the same 40
cap-edge tasks of `corpus/memo-consolidation.json`, arms interleaved
per task in one provider window; the 20 under-cap tasks of
`corpus/memo-scale.json` as the no-op guard, headroom arm only;
shipped prompt rule byte-identical in ALL arms — no fence sentence
anywhere; models fable-5 + kimi-k3 gated, sonnet-4.5 +
gemini-3.5-flash as anchors). Arms: AQ's control (`AK-eviction`,
no capacity line) / AR-headroom / AR-truecap.

Cells: cap-edge 40 × 3 arms × 4 models = 480, guard 20 × 4 = 80 —
**560 scored cells**.

## Pre-registered hypotheses and gates

Prune, goal-loss, and landing definitions byte-identical to
BRIEF-AQ. Pairing by task id.

- **AR-H1 (no-harm first — per swap candidate, the AQ lesson made a
  gate):** headroom-arm prune cells ≤ control prune cells AND
  headroom goal-loss ≤ 2/40 AND headroom landing ≥ 38/40. An
  intervention that perturbs the successors' benign dispositions
  fails here regardless of anything else.
- **AR-H2 (the effect — pooled swap candidates):** paired exact
  sign test, headroom vs control on prune cells, pooled over
  fable-5 + kimi-k3: p < .05. Expected pooled baseline from AQ's
  same-corpus controls ≈ 7/80; all-flip gives p = .0078.
  Registered fallback: pooled control prunes < 5/80 = baseline
  insufficient this week — the weather row, not an effect verdict.
- **AR-H3 (guards — every model):** no-op clean ≥ 19/20; landing
  ≥ 38/40 in every arm.
- **AR-H4 (descriptive):** the truecap arm's directional read
  (truecap prunes > control on any model = never render a binding
  cap number into model-visible context — a fence for future
  prompt/UI work); consolidation-rate shifts under headroom (if
  believed headroom suppresses spontaneous consolidation the
  pathway becomes over-send → designed eviction — acceptable, but
  the memo densification is lost; reported per model); post-notice
  second-call behavior where the 20-cap notice contradicts the
  24 line; anchor movement; token cost.
- **The study gate: AR-H1 on BOTH swap candidates, AR-H2, and
  AR-H3.**

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| All pass | State beats instruction where instruction failed: the headroom line ships in any successor tier-swap package (with the notice wording reconciled product-side), the regression memo-scale slice is expected green with the line — re-run to confirm — and the series gains its cleanest give-the-model-information-not-a-rule datapoint |
| H1 passes, H2 fails via the fallback (baseline < 5/80) | No-harm established but the effect was unmeasurable this week; unproven does not ship; the regression cadence monitors, and a re-score waits for a week when the baseline returns |
| H1 passes, H2 fails with intact baseline | Believed headroom does not move cap-obedience — the prompt-side and state-side levers are BOTH closed; remaining posture is acceptance + monitoring (fable-5's dominant lossless consolidation already covers most of its exposure; kimi-k3's residual prune rate is the accepted risk, quantified) |
| H1 fails | State information also perturbs the successors' dispositions — the AQ lesson generalizes from rules to environment description; nothing model-visible changes at the cap edge, and the memo-full exposure is managed app-side only (monitoring, or a future structural redesign registered separately) |
| Truecap arm shows harm on any model | Registered fence for all future work: never render a binding cap number into model-visible context — the composer's 20/20 indicator stays user-facing only |

## Cost fence

560 cells, AQ-class sessions. Projected **$15–30**, dominated by
fable-5. Authorized 2026-07-29 ("proceed with registering the
advertised-cap study").
