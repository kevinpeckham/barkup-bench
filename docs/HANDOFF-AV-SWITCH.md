# Handoff — Study AV's recommendation: switch the match default to Jev

For the replicator agent, from the stem-bench analyst (2026-10-27).
Study AV is published (docs/BRIEF-AV.md, REPORT.md addendum 2026-10-27);
this is the actionable summary plus the care items the data suggests.

## The recommendation, per the registered decision rule

All gates passed (12/12 completion both arms, zero fallbacks in 140
builds, median paired Δstructure −0.014 against the −0.03 bound), so:
**flip the match engine's effective default to Jev** — ship as a normal
versioned change, keep `PDF_MATCH_ENGINE` as the rollback switch, exactly
as AU's apparatus anticipated.

> **Correction (2026-10-27).** An earlier revision of this line said to flip
> `PDF_MATCH_MODEL`. That is the wrong symbol: `PDF_MATCH_MODEL`
> (`matchPdfPageWidgets.server.ts:24`) is the fable *model id* and has nothing
> to do with engine selection. The engine is chosen at line 207 on
> `PDF_MATCH_ENGINE_ENV` (line 30). No measured claim in this handoff changes
> — only the instruction. The executable version, including the agreed
> two-release rollout (stage first), the rollback trigger and the test
> updates, lives in replicator at
> `docs/superpowers/specs/2026-10-27-pdf-match-jev-default-design.md`.
> Decisions taken by Kevin 2026-10-27: stage-first rollout; the routed guard
> in care item 1 is a follow-up, not a gate; rollback watched via existing ops
> signals (Sentry, prod-data-audit, pipeline verify) plus care item 3's
> telemetry. Measured at v3.293.3 on
the AS corpus: 40.9% fewer widgets built, match stage ×13 faster
end-to-end (sub-second per page), pipeline −24% wall-clock, stage model
cost ~1000× lower.

## Care items the texture suggests (not gates, judgment calls)

1. **Simple pages pay the most.** The one clear casualty was t1-memo
   p0 (−0.111): a loose match hurts most where a page has few regions
   to hide it. If you want a guard, the cheapest is region-count-aware:
   keep Jev everywhere but route pages with ≤ N regions (or Jev's
   low-confidence decisions, p < 0.6 per AU's distribution) to the
   fable judge. AV deliberately did not fund the routed arm (gate was
   green); the dormant-switch pattern fits a routed variant too.
2. **T2 compositions are fine.** The tier AU's anatomy worried about
   absorbed stretched matches best (Δ +0.008; t2-agenda IMPROVED
   +0.068 at 9/10 reuse). No special handling needed.
3. **Catalog drift.** AV ran against the current SecureLogix catalog;
   reuse behavior depends on what exists to reuse. The longitudinal
   question (what a permissive policy does to catalog growth and
   org-visual consistency over hundreds of documents) is explicitly
   out of scope and unmeasured — worth telemetry once the default
   flips: track reuse rate and widgets-created per document over time.
4. **Version note.** AV pinned v3.293.3 (`cd6ea69`) on a dedicated
   worktree instance; the shared dev checkout had moved during the
   study. Nothing in AV constrains your current line — the engines and
   guards are the AU apparatus, unchanged since v3.281.

Raw records: `results/raw/study-av/{fable,jev}/` (local). Analyzer:
`scripts/analyze-study-av.ts`; summary committed as
`results/analysis-study-av.txt`.
