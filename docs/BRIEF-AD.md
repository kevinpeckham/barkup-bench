# Addendum brief — Study AD: the Opus confirmation (does the core stack transfer to the shipped tier?)

**Pre-registration, committed before any scored AD run.** The
benchmark's core editing stack — the id-anchored patch dialect,
focused views at size, search-then-patch grounding, worked examples
for stateless sessions, and the session policies — was measured on
claude-sonnet-4.5 and gemini-3.5-flash (Studies F through U). The
tier that actually ships on the downstream template-chat surface is
claude-opus-4.8, whose data begins at Study W and covers only the
memo, echo, standing-context, and ask mechanisms. Study Q proved
serializer advice is not model-independent (the series' first model
inversion), and Study AA proved per-tier behavior cannot be
extrapolated. Study AD closes the gap: the core recipes, re-run on
the shipped tier, against the already-published anchors.

This is a **confirmation study**: corpora, conditions, prompts,
graders, and runners are reused verbatim from the source studies.
Nothing is tuned. One model: `anthropic/claude-opus-4.8`.

## Prior Opus coverage, disclosed (not re-run)

- Study AC already ran U's construction on opus: solvable both-nodes
  cells solved at ceiling, unsolvable target-only cells 0 silent
  asks without a hatch — the U focus-ids contract has opus coverage.
- Studies W/X/Y covered the memo, echo, and naturalistic-extraction
  mechanisms on opus sessions (under prompts carrying the worked
  examples); Z/AA/AB/AC covered standing context, conflicts,
  precedence, and the hatch.
- What has NO opus data: the patch dialect itself at any size, the
  focused-view serializers, the search recipe, the session policies
  as isolated arms, and fan-out.

## Arms (six), all reused verbatim

1. **AD-F — the dialect on the main corpus** (shipped sub-300-node
   path: full markup + anchored patches). Condition F verbatim over
   `corpus/main.json` (200 tasks), parity regime, via the registered
   matrix runner. Anchor: prior tiers 182–188/200 parity (haiku 184,
   sonnet 187, gemini 182, gpt-5.4 188).
2. **AD-views — the shipped ≥300-node path.** Study J's FVH/FTH
   (HTML focused/minimal views over the F dialect) verbatim over
   `corpus/size-extension.json` (45 tasks × 2 modes), via the
   registered Study J runner. Anchor: per-mode totals 40–44/45
   (sonnet FVH 43, FTH 44; gemini FVH 42, FTH 40).
3. **AD-F@size — the dialect against the full tree at ~1000 nodes**
   (not a shipped configuration; extends Study H's headline).
   Condition F (shipped applier, Study H construction) over the
   xxxl bucket only (15 tasks). Anchor: 13/15 both prior models.
   Descriptive.
4. **AD-search — the grounding recipe.** Study N's N-search arm
   verbatim (skeleton view + `find_nodes` lexical search tool) over
   `corpus/grounded.json` (45 tasks). Anchor: sonnet 43/45 (the
   oracle bound), gemini 39/45; both passed N's gate.
5. **AD-sessions — the session policies.** Study K/M/P machinery
   verbatim over `corpus/sessions.json` (20 sessions × 12 steps),
   three policies: `view` (K-view: full history + fresh minimal view
   per turn — the shipped-config analogue), `cannedSys` (P-system:
   stateless + worked examples in the system prompt), `stateless`
   (M-stateless: the bare ablation — is the examples block
   load-bearing on opus at all?). Anchors: K-view end-states 19/20
   both models; P-system 18–19/20; M-stateless 13–14/20.
6. **AD-fanout — the honest weakness.** Study Q's Q-view and Q-full
   verbatim over `corpus/fanout.json` (45 tasks). Q-search is
   EXCLUDED (measured spiral risk, median 6 calls, runs to 2.4M
   tokens; the shipped fence routes bulk edits to deterministic
   decomposition regardless of what AD finds). Anchors: overall
   62–69%, with the inversion — sonnet better on views (p=.022),
   gemini better on full tree (p=.008).

**Excluded, with reasons:** rewrite arms (A/E at size — rewrite
above ~300 nodes is not a shipped path and costs ~50k output tokens
per cell; Study H's frontier-only rewrite claim is NOT extended to
opus by this study), N-embed (refuted mechanism), N-ground2 (a
cheap-model-grounds arm; opus is not the grounding tier), Q-search
(above).

## Cells

200 + 90 + 15 + 45 + 720 steps + 90 = **1,160 cells**, one model.
Protocol per source study: temperature 0, `maxOutputTokens 60000`,
correction loop ≤3 rounds with issues verbatim, resumable JSONL.
Records land in the source runners' file conventions
(`results/raw/main-anthropic_claude-opus-4.8-parity.jsonl`,
`studyj-…`, `studyad-…`), analysis in
`results/analysis-study-ad.txt`. Graders unchanged (all previously
unit-tested). Cache audit re-run over the new records.

## Pre-registered hypotheses and gates

Confirmation gates are anchored to the WEAKEST prior tier that the
source study counted as passing — "opus is at least as good as the
measured band" — with exact binomial CIs reported throughout.

- **AD-H1 (dialect):** AD-F ≥ 182/200. (Prior band 182–188.)
- **AD-H2 (views):** FVH ≥ 40/45 AND FTH ≥ 40/45, AND no size
  cliff (every mode × size cell ≥ 12/15). (Prior per-mode band
  40–44/45.)
- **AD-H3 (search):** N-search ≥ 39/45. (Weakest passing tier.)
- **AD-H4 (sessions):** K-view AND P-system each hold: per-step
  success ≥ 228/240 (95%) AND end-state intact ≥ 17/20.
  M-stateless is descriptive: McNemar P-system vs M-stateless per
  step. If opus bare-stateless matches P-system, the examples block
  is not load-bearing on opus (and remains harmless); if it trails,
  P's mechanism transfers.
- **AD-H5 (fan-out, descriptive — NO gate):** coverage rates and
  McNemar Q-view vs Q-full within opus; direction reported against
  the published sonnet/gemini inversion. Registered expectation: no
  arm reaches 90%, and the decomposition fence stands regardless.
- **AD-F@size (descriptive):** x/15 at ~1000 nodes vs the 13/15
  prior band.

**The study gate: AD-H1 through AD-H4 all pass.** Then the core
stack is confirmed on the shipped tier and every downstream
"measured on sonnet/gemini" caveat about the core recipes closes.
Any single failure is reported as a tier-specific guardrail gap
with the affected downstream surface named (the point of the study
— a failed gate here is MORE actionable than a passed one).

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| H1–H4 pass | Core stack transfers; playbook/replicator caveats close; fan-out result annotated as opus data either way |
| Views or search fail (H2/H3) | The shipped ≥300-node template-chat path has a tier gap — highest-priority replicator flag |
| Sessions fail (H4) | Shipped history+views config or the examples fallback has a tier gap — flag on template-chat session policy |
| Dialect fails (H1) | The patch funnel itself underperforms on opus — affects every surface; escalate before any other follow-up |
| Fan-out inverts a third way | Registered as further evidence serializer advice is tier-specific; decomposition fence unchanged |

## Protocol notes, registered up front

- Cross-model comparisons (opus vs the published sonnet/gemini
  numbers) are BETWEEN-run comparisons on identical tasks — same
  corpus, same conditions, different date and tier. Reported
  descriptively with CIs; the gates above are within-AD thresholds,
  not significance tests against the old records.
- The sessions arms reuse the Study K corpus (12-step horizon), not
  the 36-step S corpus — the confirmation targets the policy
  mechanism, not the horizon (S showed no late decay on either
  prior model; horizon re-testing on opus is out of scope).
- Q-full at 45 × ~40–48k input tokens is the expensive arm
  (~$10); it is the price of testing the inversion on the tier we
  ship. Q-search's exclusion means AD cannot say whether the search
  spiral replicates on opus — disclosed as out of scope.

**Expected spend $40–60** (opus 4.8 gateway pricing $5/M in,
$25/M out, probed 2026-07-15); abort past $120. Honesty rules
unchanged: this brief is committed before the first scored call;
conditions and prompts are already registered by the source
studies' commits; results publish whatever they show.
