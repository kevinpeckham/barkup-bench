# The regression-gate suite — model-swap CI for the shipped guardrails

**Registered manifest. Thresholds are fixed here, by commit, before
any run they judge; a red gate is investigated, never re-thresholded
after the fact. Amendments to slices or thresholds happen by commit,
with a dated note in this file, before the next run they apply to.**

## Purpose

Every guardrail the downstream surfaces ship (the anchored-patch
funnel, focused views, `find_nodes`, the session recipes, the
session-notes memo and its PRECEDENCE clause, the last-edit echo, the
NEED-INFO ask path, the standing brand pack) was validated against
specific model snapshots. Three things drift underneath that:
providers ship new snapshots behind stable ids, products consider
tier swaps, and gateway model ids themselves change. The series' own
findings (Study Q's inversion, Study AA's composition sensitivity)
forbid assuming any of it transfers — and Study AD showed the honest
answer costs about a day and a few tens of dollars when done as a
full study. This suite is the standing, cheap version: the sharpest
gate constructions from the series, re-runnable against any gateway
model id in one command.

```
bun run scripts/regress.ts --model <gateway-model-id>
```

Raw records: `results/regression/raw/` (gitignored, resumable within
a run label; the default label is today's date, so a later re-run
measures fresh). Committed artifact: the summary table,
`results/regression/<model-slug>-<run>.txt`. Exit code 2 on any
failed gate.

## Trigger policy

- Before switching any chat surface to a different model or tier.
- When a provider announces (or is suspected of) a snapshot change
  behind a shipped model id.
- Low-cadence sweep of the shipped tier (quarterly is plenty).
- NOT per-commit: the code does not drift, the models do.

## The gates

Detection philosophy: these are ceiling-anchored cliff detectors, not
precision instruments. At these cell counts a gate catches gross
regressions (the 0/90 and 12/12 cliffs the series actually found)
with high probability and tolerates single-cell flakes. Slices are
deterministic and registered: "first N per bucket / first N sessions
in corpus order."

| Gate | Protects (shipped surface) | Construction (source) | Cells | Threshold |
|---|---|---|---|---|
| `dialect` | apply_template_patch funnel | condition F, main corpus, first 5 tasks per size bucket (F/AD) | 20 | ≥17/20 |
| `views` | get_template_view at ≥300 nodes | FVH over the xxxl size-extension bucket (I/J/AD) | 15 | ≥13/15 |
| `search` | find_nodes content search | N-search, grounded corpus, first 5 per bucket (N/AD) | 15 | ≥11/15 |
| `focus-solve` | view scope as a correctness contract | AC-base on the solvable both-nodes twin (U/AC/AD) | 45 | solved ≥43/45, silent-wrong ≤2 |
| `ask-hatch` | NEED-INFO ask rules (v3.191.0) | AC-rule on unsolvable + solvable twins (AC) | 90 | asked ≥43/45; false asks ≤2/45; solved ≥43/45 |
| `echo` | lastEditEcho (v3.184.0) | X-lastedit, all 12 anaphora sessions (X) | 144 steps | anaphora ≥45/48; ordinary ≥95% |
| `memo-block` | sessionNotes block (v3.183.0) | T-notes, first 10 callback sessions (T) | 120 steps | callbacks ≥38/40 |
| `memo-agent` | update_session_notes tool loop | W-agent, first 6 36-step sessions (W) | 216 steps | callbacks ≥32/36 |
| `precedence` | PRECEDENCE clause (v3.188.1) | AB-clause on override + ri cells (AB) | 24 | honored ≥10/12; satisfy-both ≥10/12; violations = 0 |
| `standing-pack` | brand pack + buildCachedSystem (v3.185.0) | Z-full on fact + rule cells (Z) | 24 | ≥22/24; contamination = 0 |
| `memo-scale` | sessionNotes at the 20-note cap + `applySessionNotesUpdate` eviction (v3.213.0) | AH recall-at-N=20 + integrity-at-K=19 slices (AH) | 25 | recall ≥13/15; clean full-replace ≥9/10 |
| `ask-calibration` | ask-path calibration on the AE ladder (v3.191.0) | AE-rule on L0 precise + L4 missing-info (AE) | 30 | L0 solved ≥13/15, false asks ≤1; L4 asked ≥13/15 |
| `anaphora-hatch` | the NEED-INFO seatbelt behind the echo | AG-stateless-hatch, first 6 anaphora sessions (AG) | 72 steps | anaphora asked ≥17/24; ordinary false asks ≤3 |

Threshold provenance: each minimum sits at or just below the WORST
result any passing tier recorded in the source study (e.g. `search`
tolerates down to 11/15 because gemini's passing 39/45 ≈ 13/15 with
binomial noise at n=15; `memo-agent` tolerates 32/36 because sonnet's
disclosed post-truncation dip measured 31/36 on a different subset
and was n.s.). The two hard zeros (violations, contamination) are
hard because 900+ measured cells never produced one — a single event
is a signal, not a flake.

Everything is reused verbatim from the source studies: corpora,
conditions, prompt stacks (including the replicator's
benchmark-registered texts via `src/shipped/`), graders, and
runners. The manifest and evaluators live in
`src/regression/gates.ts` (unit-tested in `tests/regression.test.ts`);
the cell builders in `scripts/regress.ts`.

### Amendment (2026-07-16)

Three gates added after Studies AE, AG, and AH published, by commit
before any run they judge (per the amendment rule above): AE's
calibration slices, AG's discourse-gap construction, and AH's
memo-at-scale slices. The eviction pipeline itself
(`applySessionNotesUpdate`, replicator v3.213.0) is deterministic
code, ported verbatim into `src/shipped/session-notes.ts` and
guarded by `tests/eviction.test.ts` — no model calls needed for its
policy; the `memo-scale` gate covers the model-behavior side.
Thresholds sit at or just below each source study's measured floor
(anaphora-hatch's ≥17/24 is the n=24 exact-binomial detection bar;
measured values were 21.5–24). The suite is now **thirteen gates**;
the tier-dependent AE L3 construction is deliberately excluded
(no model-independent threshold exists — see Study AI).

## Reading a result

- **All green:** the measured guardrail behavior holds on this model.
  Commit the summary for the record.
- **A red gate:** the named shipped surface has a tier/snapshot gap.
  Do not retune the threshold. Escalate to a proper study (the AD
  pattern: verbatim re-run at full n, pre-registered) before shipping
  the model change, and file the replicator fence.
- **Incomplete:** cells errored or the run was interrupted; re-run
  the same command (same run label) to resume.

Cost: roughly 2M input tokens for the full battery — about $10 on an
Opus-class tier, $6 on Sonnet-class, ~$1 on flash-class models
(gateway pricing probed 2026-07-15).

## Limitations, stated up front

One grammar, seeded corpora, deterministic grading — the same
external-validity bounds as the source studies. The suite validates
the benchmark's constructions on a new model; it does not replay
real traffic (ecological replay is a separate backlog item). Judge-
graded results (Study V) have no gate here by design: Track 2 is
never pooled with deterministic claims. Fan-out has no gate because
it was never a passing guardrail — the protection there is app-side
decomposition, which is deterministic code, not model behavior.

## Validation run (the grader-gets-a-test rule)

Before first use, the battery is validated against
`anthropic/claude-opus-4.8` (the shipped tier, freshly measured by
Study AD) — every gate is expected green; the committed summary of
that run is the suite's own pass gate and the shipped tier's first
baseline.
