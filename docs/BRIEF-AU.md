# Study brief — Study AU: the match-stage engine A/B (fable-5.1 vs Jev typed decisions — can a decision model replace the pipeline's priciest judgment?)

**Pre-registration, committed before any scored AU run.** Replicator's
PDF-pipeline match stage decides reuse-vs-build per region — one
fable-5.1 call per page over a TEXT-ONLY prompt (spec regions +
mechanically prefiltered candidates; no page image), wrapped in
deterministic guards (no-candidates → build, out-of-candidate-set →
build, judge error → build-all). Jev (typesafe-ai/jev-1.14.0, a typed-
decision model at ~$0.042/M input through our gateway's /v1/decisions)
answers exactly this shape: one choice question per region over the
candidate list plus a build sentinel. The text-only parity makes the
A/B fair; the guards apply identically to both engines (implemented
replicator v3.281.0-dev: `jevMatchJudgeResponse` + `PDF_MATCH_ENGINE`
env switch, default fable, unit-tested including the rogue-answer
guard). Economics if quality holds: the stage's model cost drops
~1000× and page latency from seconds to sub-second.

## Two phases, gated

**Phase 1 — offline decision agreement (runs first, ~$2).** Replay the
FROZEN Study-AT brand-arm decompose outputs (12 items, 16 pages,
`results/raw/study-at/brand/`) against the current SecureLogix widget
catalog; judge every page with BOTH engines FRESH on byte-identical
inputs (runner: replicator `scripts/study-au-match-offline.ts`;
results land in `results/raw/study-au/phase1.json`). The AT-recorded
decisions ride along descriptively only — catalog drift since
2026-10-22 makes them unpaired; the fresh fable-vs-Jev pairing is the
measurement.

Registered Phase-1 metrics: region-level ACTION agreement
(reuse-vs-build), exact-widget agreement among both-reuse regions,
per-engine reuse rates, per-page latency, Jev token spend, Jev
probability on agreeing vs disagreeing regions (calibration read).

**AU-G1 (the gate to Phase 2):** action agreement ≥ 0.85 AND
exact-widget agreement among both-reuse ≥ 0.90. Disagreements are
inspected and described either way (disclosed as qualitative);
a failed gate publishes as measured and Phase 2 does not run.

**Phase 2 — full-pipeline arm (only past the gate, ~$20).** One full
AS-corpus pass (12 items, frozen manifest, full cleanup between
items) with `PDF_MATCH_ENGINE=jev` on the dev rig, raw records to
`results/raw/study-au/jev-match/`, paired against the frozen AT-brand
records (same corpus, fable match, otherwise-identical v3.272+
pipeline — the paint fix v3.273.0 landed between AT and AU and
applies to the AU arm only; the dark-page cells are therefore
excluded from paired score comparisons and reported separately).

Registered Phase-2 gates:
- **AU-G2 completion:** 12/12 items complete.
- **AU-G3 build integrity:** fallback widgets ≤ 10% of builds.
- **AU-G4 fidelity non-regression:** median finalStructureScore across
  non-dark-paint pages within −0.03 of the AT-brand median on the
  same pages.
- **AU-G5 reuse-rate sanity:** corpus reuse rate within ±15 percentage
  points of AT-brand's (a collapsed or exploded reuse rate means the
  engine is not making the same KIND of judgment, whatever the
  per-region agreement said).

Decision rule (registered): ALL of AU-G1..G5 green → recommend
switching `PDF_MATCH_MODEL`'s default to Jev (ship as a normal
versioned change with the env switch retained as rollback). Any red →
fable stays default; publish what failed.

## Protocol notes

- System under test: replicator at the commit recorded in each raw
  record (v3.281.0-dev line), same dev rig and org as AS/AT.
- Spend: ~$2 (Phase 1) + ~$20 (Phase 2), approved 2026-10-24
  ("proceed" on the match A/B plan quoting ~$30).
- Disclosures: catalog drift vs the AT run (2 days — built widgets
  were cleaned per item, so drift is limited to organic catalog
  changes); Phase-1 fable answers are fresh re-judgments, not the
  AT-recorded ones; the Jev dialect was reverse-engineered from the
  live gateway (docs drift documented in replicator memory); Jev's
  vendor API is ~1 month old — the fable default and the guards are
  the fallback story regardless of outcome.

## Outputs

Phase-1 JSON + Phase-2 raw records under `results/raw/study-au/`
(local per convention), analyzer summary committed, REPORT.md
addendum with both phases and the decision.
