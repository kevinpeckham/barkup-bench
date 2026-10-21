# Study brief — Study AT: the Study-AS interventions, measured (structure-judged verify, theme-from-source, brand-mode steering — before/after on the frozen AS corpus)

**Pre-registration, committed before any scored AT run.** Study AS
(2026-10-21) baselined the shipped PDF→template pipeline and failed
two quality gates with a clean decomposition: the appearance metric
conflated intentional re-branding with layout error (G2; a correct-
layout dark page scored 0.002), and the verify loop judged layout
corrections with that same style-dominated metric, rejecting them
round after round (G3; median uplift +0.007, 43% of wall-clock).
Replicator v3.270.0–v3.272.0 shipped the responses: a palette-blind
STRUCTURE score now gates and judges the loop (keep-best on
structure; appearance reported for continuity; min-iteration-gain
stop), an opt-in "Match source colors" import derives a versioned
theme from the PDF's deterministically-extracted palette, and the
critic/corrector are brand-mode aware (color findings fenced under
org-theme; token-scoped under source-colors). AT measures all three
on the SAME frozen corpus, paired page-by-page against the frozen
AS records. Registration lesson from Study AR applied: every
quality gate is COMPARATIVE against a contemporaneous or frozen
baseline, not an absolute ceiling.

## System under test

- replicator at v3.272.0 (commit `123ddc0`), same dev-server rig as
  AS (`replicator-dev.service` :5183, preview auth, SecureLogix org,
  all five LLM stages on `anthropic/claude-fable-5.1`).
- Verify as shipped in v3.272.0: structure threshold 0.95, max 2
  iterations, min kept gain 0.02, keep-best judged on structure.

## Corpus

The frozen Study AS corpus VERBATIM — `corpus/pdf-pipeline/pdf/*`
checked against `corpus/pdf-pipeline/manifest.json` hashes before
any scored call. 12 items, 16 scored pages. No item may change.

## Arms (each = one full corpus pass, items sequential, full
cleanup between items including imported themes)

- **AT-brand** — the default import (org-theme re-branding), i.e.
  the AS protocol re-run on the upgraded pipeline. Isolates the
  structure-metric + loop-economics + color-fence changes under
  unchanged product policy.
- **AT-match** — the same pass with `matchSourceColors` ("Match
  source colors"): palette-derived theme + open token-scoped style
  channel. Measures the fidelity-side option end to end.

Raw records: `results/raw/study-at/brand/<slug>.json` and
`results/raw/study-at/match/<slug>.json` (the frozen
`results/raw/study-as/` records are the paired baseline and are
never rewritten).

## Measures

Per page: appearance `initialScore`/`finalScore` (AS-comparable)
AND structure `initialStructureScore`/`finalStructureScore` (new);
iterations, findingsApplied, reverted. Per item: completion, reuse/
build split, fallbacks, wall-clock (verify share vs AS's 43%
descriptive). Paired deltas vs AS are computed per page on
appearance scores (AS records carry no structure scores).

## Registered gates

- **AT-G1 completion:** ≥ 11/12 items complete in EACH arm.
- **AT-G2 fidelity recovery (the match arm's reason to exist):**
  AT-match improves the appearance `finalScore` over the AS
  baseline on ≥ 12 of the 16 paired pages (one-sided sign test at
  n=16: 12 wins ⇒ p ≈ .038 under the null).
- **AT-G3 verify effectiveness (both arms):** (a) the structure
  keep-best invariant holds on every page (structure final ≥
  structure initial — the successor to AS-G3a; appearance may
  legitimately drop); (b) per arm, among pages entering correction
  (structure initial < 0.95), median structure uplift ≥ +0.03 —
  the loop must demonstrably move the metric that now judges it
  (AS's loop managed +0.007 on the metric that judged IT).
- **AT-G4 build integrity (both arms):** fallback widgets ≤ 10% of
  builds (continuity with AS-G4).
- **AT-G5 brand-arm non-regression:** AT-brand's median appearance
  `finalScore` across all 16 pages is not more than 0.03 below the
  AS baseline median (0.634) — the structure-judged loop must not
  BUY structure by visibly spending appearance under unchanged
  color policy.

Failed gates publish as measured and name the component. No
re-thresholding after data.

## Protocol notes

- Runner = the AS harness (`scripts/run-study-as.ts`) with
  `STUDY_AS_RESULTS_DIR` per arm and `--match-colors` for AT-match;
  items one per invocation (the AS process-kill lesson), registered
  manifest order, one transport retry per stage call, pipeline
  errors unretried.
- The keep-best invariant check in the runner follows the judging
  metric (structure when the report carries it) — updated BEFORE
  this registration, with the AS records' semantics untouched.
- Cleanup now includes the imported theme (`themeIds` in
  replicator's cleanup script, v3.271.0) — verified in the Wave 3
  smoke (themesDeleted: 1).
- Pilot: AT runs no separate pilot — the harness is unchanged from
  AS except the flags above, each exercised in scored-quality smoke
  runs during Waves 2–3 (t2-agenda, both arms' pathways). The first
  two items of the brand arm serve as a sanity checkpoint: if raw
  records are malformed or cleanup leaves rows, stop and restart
  the arm after the fix.
- Spend: 2 × AS's ~$15–40 ⇒ ~$30–80, approved 2026-10-21 ("proceed
  with all of your recommendations"). Abort and report if the first
  arm projects the total past $120.
- Disclosure: the Wave 3 smoke run (t2-agenda, match arm,
  v3.271.0) produced scores the analyst saw before this
  registration (appearance 0.459→0.515, structure 0.531→0.632).
  Gate thresholds were chosen with that single-item knowledge —
  disclosed rather than pretended away; it is one page of 16 and
  pre-dated the v3.272.0 brand-mode steering.

## Outputs

Analyzer `scripts/analyze-study-at.ts` (pairing + gate logic in
`src/harness/study-at-stats.ts`, unit-tested before the first
scored run), REPORT.md addendum with the AS↔AT paired tables and
the gate verdicts.
