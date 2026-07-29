# Addendum brief — the open-weight backfill (tier maps for kimi-k3, gpt-oss-120b, and fable-5; no new gates)

**Pre-registration, committed before any scored backfill run.** The
series has measured three closed-weight models throughout
(gemini-3.5-flash, sonnet-4.5, opus-4.8). Open-weight frontier
models are now competitive and unmeasured here, and a newer
closed-weight frontier tier (fable-5) sits above the shipped tier.
This backfill maps all three against the series' standing
instruments. It is a TIER-MAP EXTENSION, not a new study: no new
hypotheses, no new pass/fail gates, and no prompt or corpus changes
of any kind.

## Models (registered; availability + pricing verified 2026-07-29)

- `moonshotai/kimi-k3` — open-weight frontier ($3/M in, $15/M out).
- `openai/gpt-oss-120b` — open-weight non-frontier ($0.10/M in,
  $0.50/M out).
- `anthropic/claude-fable-5` — current closed-weight frontier
  ($10/M in, $50/M out); doubles as the model-swap CI input if the
  shipped tier is ever upgraded.

## Disclosure: the analyst model is a test model

The analyst operating this bench is fable-5 — one of the models
under test scores itself. Mitigation is structural, not
promissory: every grader in this backfill is mechanical and
pre-registered (deterministic set membership, registered
thresholds in docs/REGRESSION.md, seeded corpora committed before
any fable-5 run existed). The Track 2 judge-graded studies (V, AF)
are EXCLUDED from this backfill for exactly this reason; extending
them to fable-5 would require a non-fable judge and a fresh
registration.

## Phase 0 — the regression-gate suite, per model

`bun run scripts/regress.ts --model <id>` — the 13 registered gates
(docs/REGRESSION.md), thresholds unchanged. Reading is registered
up front: for the shipped tier these gates are ship/no-ship CI; for
backfill models a red gate is a TIER-MAP FINDING (where the model
sits relative to the shipped guardrails), never re-thresholded and
never a reason to change shipped behavior on its own. Committed
artifacts: results/regression/<slug>-<run>.txt per model.

## Phase 1 — the tag-steering family, per model

- Study AO's three arms (36 tasks × 3 arms = 108 cells/model) via
  the committed runner, prompts byte-identical.
- Study AP's four arms (48 tasks × 4 arms = 192 cells/model),
  scored under BOTH keys: the v1 registration and the locked AP′
  independent key (corpus/tag-steering-ap-acceptable-v2.json).
  Both readings published, exactly as for the original models.

Reporting: the existing per-model descriptive tables extend by
three columns. AO/AP's opus-anchored gates are NOT re-evaluated on
new models (they were registered for the shipped tier); the
backfill numbers join the tier map.

## Phase 2 — deliberately unregistered here

Deeper family re-runs (AN-class and beyond) are a separate
registration IF Phase 0 reds make one worth buying. Nothing in this
brief authorizes them.

## Cost fence

Phase 0: ≈ $1 (gpt-oss) + $5–10 (kimi-k3) + $15–25 (fable-5).
Phase 1: ≤ $2 per open model, ≈ $4 fable-5. Total ≈ **$25–45**.
Authorized 2026-07-29 (scope picked: "All 3 models, Phases 0+1").
