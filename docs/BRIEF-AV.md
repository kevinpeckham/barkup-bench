# Study brief — Study AV: which matching policy is right? (strict vs permissive, scored downstream)

**Pre-registration, committed before any scored AV run.** Adopted from
docs/PROPOSAL-AV.md (2026-10-24) by the stem-bench analyst, who runs
this study; deviations from the proposal are noted inline. Spend
authorized by Kevin, "I think we can proceed with study AV from here"
(2026-10-27); fence **$70**.

## The question

Study AU showed Jev is not the same judge as fable at the PDF
pipeline's match stage (agreement 0.676, one-directional: Jev reuses
where fable builds, 45.1% vs 16.7% reuse) — but agreement cannot say
which policy is RIGHT. AV scores both policies downstream: does the
permissive policy cost fidelity, and what does the strict policy's
extra building buy? Fable built 85 widgets across Study AS at the
pipeline's most expensive stage; if generic-heading reuse is fine,
strictness over-builds at real cost.

## System under test

- replicator pinned at **v3.293.3 (commit `cd6ea69`)** in a dedicated
  git worktree (`~/projects/replicator-av`), served by its own dev
  instance on **port 5184** for the study's duration. Deviation from
  AS/AT/AU (which used the shared `replicator-dev.service`), and the
  reason: the shared checkout is a moving working tree with another
  agent's uncommitted work; a pinned worktree removes code drift
  entirely and lets the match engine be set per-process instead of by
  mutating the shared service. Both arms run the SAME commit — unlike
  AU there is no paint-fix version split, so dark pages pair normally.
- The dev ENVIRONMENT (database, blob store, org catalog) is the same
  one AS/AT/AU used and is shared with ongoing dev work; the AS
  cleanup contract (every created entity deleted after scoring,
  orphan sweep available) is the mitigation, as before. The
  SecureLogix org catalog is the reuse pool; the match stage's
  candidate lists ride in every raw record, so catalog state at each
  decision is recorded.
- Engine selection is the shipped `PDF_MATCH_ENGINE` env read by
  `matchPdfPageWidgets.server.ts` (AU's apparatus), set on the AV
  instance's process env per arm.

## Arms (2 registered; a 3rd conditional)

Full AS-corpus passes (12 frozen items, manifest sha256-checked,
sequential registered order, full cleanup between items), the
AT-brand protocol (default org-theme import, no matchColors):

- **AV-fable** — `PDF_MATCH_ENGINE` unset (the shipped default). A
  FRESH baseline at the pinned commit — the proposal's reuse-frozen-
  records option is rejected per the stem-bench Study 5 lesson
  (record reuse propagated a confound there); the $20 buys out the
  version confound.
- **AV-jev** — `PDF_MATCH_ENGINE=jev`.
- **AV-routed (conditional, NOT run by default):** only if AV-jev
  fails AV-G3, and only after its own registered amendment naming the
  threshold (the proposal suggests p ≥ 0.60 from AU's published
  distribution) and the engine-variant implementation. If AV-jev
  passes, routing is moot and the arm is not funded.

## Protocol checks (registered stop rules)

- **Harness smoke (AS precedent):** `t1-event-flyer` runs first in
  AV-fable; STOP and verify the raw record is complete, cleanup left
  zero rows/blobs, and cost/latency is in the AS band — the pipeline
  endpoint has crossed a SvelteKit 3 migration since AT and the
  harness must be revalidated. Any harness fix restarts the arm.
- **Engine-plumbing check:** after AV-jev's first two items, its
  region decisions must differ from AV-fable's on the same items (AU
  predicts ~45% vs ~17% reuse). If they are identical, the env did
  not reach the judge — stop, fix plumbing, restart the jev arm.
  Identical DOWNSTREAM scores with different decisions are a result;
  identical decisions are a defect.

## Gates

- **AV-G1 completion:** 12/12 items per arm.
- **AV-G2 build integrity:** fallback widgets ≤ 10% of builds per arm.
- **AV-G3 fidelity no-harm (the gate):** AV-jev vs AV-fable, paired
  per page on `finalStructureScore`: median delta ≥ −0.03.
- Reuse rates are registered READS, not gates (AU-G5's sanity bound
  deliberately does not apply: differing reuse is the subject).

Decision rule: AV-jev green on G1–G3 → recommend the permissive
default (the stage drops ~1000× in model cost and the disagreement is
measured free). AV-jev red on G3 → fable stays; the routed arm may be
registered by amendment; the finding either way is the measured price
of "judge by purpose."

## Registered reads

Per-arm and paired: widgets built, reuse rate, per-stage wall-clock
and model cost per item, appearance scores for AS/AT continuity;
divergence anatomy (pages with |Δstructure| > 0.05 and the region
classes responsible — AU predicts heading-class dominates); the
structure-score cost or benefit per extra widget built. The
longitudinal question (catalog growth and org-visual consistency over
hundreds of documents) is explicitly out of scope.

## Predictions (registered before any scored run)

1. AV-G3 passes: generic-heading reuse does not measurably hurt
   structure scores on this corpus (the metric is palette-blind and
   heading geometry is forgiving), so the permissive policy wins on
   economics.
2. The jev arm builds 25–40% fewer widgets and cuts match-stage
   wall-clock by ~45× while total pipeline time drops only modestly
   (build and verify dominate).
3. Divergent pages concentrate in T2 (the composition-heavy tier),
   and at least one page shows a visible structure cost from a
   stretched heading match — the honest risk of prediction 1 failing
   narrowly.
4. Dark-page cells pair normally at the pinned version (both arms
   have the paint fix) and show no engine effect.

## Disclosure

The analyst registers and runs this study and is Claude Fable 5; the
fable arm's judge is claude-fable-5.1 (same family). All scoring is
the pipeline's own committed mechanical metrics (structure/appearance
scores, counts, wall-clock); no analyst judgment enters any score.
Raw records land in `results/raw/study-av/{fable,jev}/` (local per
the results/raw convention); the analyzer and its summary are
committed.
