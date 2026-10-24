# Proposal — Study AV: which matching policy is right? (strict vs permissive vs confidence-routed)

**Status: PROPOSAL, not a registration.** Drafted 2026-10-24 by the
stem-bench analyst as a reciprocal hand-off, building on Study AU's
published data. The agent that runs this study owns its registration:
adopt, edit, or reject freely; nothing here binds until a BRIEF-AV is
committed by the runner before its first scored cell. (Precedent: the
matcher brief the stem-shovel side handed to stem-bench, which the
receiving side re-registered in its own terms.)

## The question AU deliberately left open

Study AU established that Jev is not a drop-in replacement for fable at
the match stage — agreement 0.676, and the disagreement one-directional:
Jev reuses where fable builds (45.1% vs 16.7% reuse), mostly matching
heading-class regions to a generic heading widget against the
judge-by-purpose rule both engines were given. An agreement metric can
only show that two judges differ; it cannot say which is right. The
open question: **does the permissive policy cost downstream fidelity,
and what does the strict policy's extra building actually buy?** Fable
built 85 widgets across Study AS at the pipeline's most expensive stage
(build was 17.3 of AS's 46 minutes); if generic-heading reuse is fine,
strictness over-builds at real cost. If stretched matches flatten the
source's layout, Jev's thrift costs quality. AU could not tell; a
full-pipeline A/B scored downstream can.

## Proposed arms (3)

Full AS-corpus passes (12 frozen items, manifest-checked, full cleanup
between items, the AS/AT harness contract), differing only in
`PDF_MATCH_ENGINE`:

- **AV-fable** — the strict policy. If the frozen AT-brand records can
  serve as this arm unchanged, reuse them (saves ~$20); note the
  system-under-test version question below before deciding.
- **AV-jev** — the permissive policy, via the dormant switch shipped by
  AU (`jevMatchJudgeResponse`, identical guards).
- **AV-routed** — the hybrid AU's own data motivates: Jev decides where
  its probability clears a threshold, fable judges the rest. AU's two
  reverse-disagreements sat at p ≈ 0.45–0.53 and its confident extra
  reuses at median p = 0.71, so a threshold in between (suggest
  **p ≥ 0.60**, registered before any scored cell and justified from
  AU's PUBLISHED distribution, not from new data) routes contested
  regions to the strict judge while keeping most of the 49× speedup.
  Requires a small engine variant (`routed`) in the replicator harness;
  ships dormant like the others.

## Proposed gates (comparative, per the AR protocol)

- **AV-G1 completion:** 12/12 items per arm.
- **AV-G2 build integrity:** fallback widgets ≤ 10% of builds per arm.
- **AV-G3 fidelity no-harm (the gate):** per arm vs AV-fable, paired
  per page on `finalStructureScore`: median delta ≥ −0.03. Dark-page
  handling follows AT's precedent if the baseline predates the paint
  fix (exclude from pairing, report separately).
- **AV-G4 reuse sanity:** reported, not gated — the whole point is that
  reuse rates differ; AU-G5's ±15-point sanity bound does not apply to
  a policy comparison.

Decision rule to register: AV-jev green on G1–G3 → recommend the
permissive default (the disagreement is free and the stage drops ~1000×
in model cost). AV-jev red but AV-routed green → recommend routing with
the registered threshold. Both red → the strict policy's building is
purchased quality; fable stays, and the finding is the price tag on
"judge by purpose."

## Registered reads (not gates)

- Widgets built, reuse rate, wall-clock and model cost per item, per
  arm — the economics table the decision rule consumes.
- WHERE the arms diverge: pages whose structure scores differ by > 0.05,
  with the region classes responsible (AU predicts heading-class
  regions dominate).
- Appearance scores for continuity with AS/AT.
- Routed-arm anatomy: fraction of regions routed to fable, agreement of
  the routed subset with fable's own decisions.

## Subtleties worth registering explicitly

- **Catalog state.** All arms against the same SecureLogix catalog
  snapshot, full artifact cleanup between items (the AS contract), so
  item order cannot grow the reuse pool. Record the catalog's widget
  count before each arm.
- **System under test has moved.** AU ran on the v3.281.0-dev line;
  replicator is now at v3.286.0 (SvelteKit 3 migration, auth work).
  Re-pin the exact commit, verify the pipeline path is byte-identical
  to the version AU instrumented or re-baseline AV-fable fresh instead
  of reusing AT-brand records; a fresh baseline adds ~$20 and removes
  the version confound entirely — the stem-bench side's recent
  experience argues for spending the $20 (its Study 5 found a two-study
  confound that record reuse had propagated).
- **The longitudinal question is out of scope and worth naming:** what
  each policy does to catalog growth and org-visual consistency over
  hundreds of documents is a different instrument (a longitudinal
  simulation or production telemetry), not a 12-item corpus. Naming it
  prevents this study's conclusion from being over-read.

## Cost

~$20 per fresh full-pipeline arm: $40–60 for two or three fresh arms
plus Jev pennies and routing overhead. Suggest a fence of **$70** with
Kevin's explicit go-ahead at registration, honoring the house spend
discipline.

## Why now

The switch and guards are already shipped dormant; AU's data gives the
routed arm a principled threshold; and the match stage remains the
pipeline's priciest judgment. Whatever the verdict, the result converts
AU's "not interchangeable" into ship guidance: cheaper-same, routed, or
strictness-is-worth-it.
