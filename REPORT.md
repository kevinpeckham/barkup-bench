# barkup-bench — Findings

> **MAJOR CORRECTION (2026-07-06, protocol v2).** After publication we
> discovered a harness defect: the AI SDK's `response.messages`
> silently omits tool-call/tool-result messages (they live per step),
> so every multi-turn tools conversation showed the model a history in
> which its own tool activity was invisible. Re-running the affected
> cells with correct history **eliminates every interface-reliability
> gap this report originally led with**: A vs C overall becomes 91.9%
> vs 93.9% (Δ = −2.0pp, p = 0.04 — a slight tools edge), the +33pp
> multi-turn H4 effect becomes −3.1pp (n.s.), and the "small-model
> tools fragility" disappears (haiku C: 80.5% → 95%). What stands:
> the H1/H5 null results, the H3 cost findings, positional JSON
> Patch's large-tree collapse, and the condition-F anchored-patch
> results (all protocol-unaffected). Full details in the
> [Correction section](#correction-2026-07-06-the-tool-history-artifact-and-protocol-v2)
> and Study G below; corrected tables in
> `results/analysis-main-corrected.txt`. Sections below are preserved
> as originally written, with correction callouts where superseded.

**Original TL;DR (superseded — see correction above): The
whole-artifact rewrite strategy wins; the HTML dialect itself is
neither an advantage nor a handicap.** Against an equal-quality JSON
twin, rewrite-style editing (HTML or JSON) beats granular mutation
tools by ~5–7 points overall and by 33 points on multi-turn
id-referencing tasks — but the effect comes from the *strategy*, not
the *format*: JSON + whole rewrite (condition B) matches or slightly
exceeds HTML + whole rewrite (condition A) everywhere. The predicted
large-tree reversal never appeared. JSON Patch collapses on large
trees. Granular tools are reliable for frontier models and fragile
for smaller ones.

**Corrected TL;DR: With correct conversation history, every id-stable
interface works — rewrite, granular tools, and id-anchored patches
land within a few points of one another; the format never mattered
for accuracy; cost and large-tree patch addressing are where designs
genuinely differ.** The dramatic interface gaps originally reported
were manufactured by the history defect — which is itself the most
practically important finding this project produced: a one-line SDK
mistake can silently collapse multi-turn tool reliability from ~100%
to as low as 5%, and frontier models mask the defect while smaller
models expose it.

This is a pre-registered benchmark (BRIEF.md, committed before any
scored run). Mixed results — and corrections — are published as found.

## Setup

- 200 tasks (seed 20260706, committed): 80 transformation, 24
  construction, 40 reference (multi-turn), 56 reading; tree sizes
  stratified ~5/20/60/150 nodes (xs/s/m/l).
- Conditions: **A** HTML dialect + whole-tree rewrite (barkup parse);
  **B** JSON + whole-tree rewrite (twin validator); **C** JSON +
  granular mutation tools; **D** HTML + the same tools; **E** JSON
  Patch (RFC 6902 via fast-json-patch). One grammar semantics for all;
  the JSON twin's validator mirrors barkup's issue codes, messages,
  and paths (cross-checked against an ajv-compiled JSON Schema in
  tests).
- Models: `anthropic/claude-sonnet-4.5`, `openai/gpt-5.4`,
  `google/gemini-3.5-flash`, `anthropic/claude-haiku-4.5` via Vercel
  AI Gateway, temperature 0. Held-out describer for construction
  specs: `xai/grok-4.3` (specs mechanically audited + rebuild-checked
  at corpus time).
- Protocol: 1 attempt + up to 3 correction rounds returning the
  condition's structured issues verbatim; two prompt regimes (parity
  and best-effort), both pre-registered by commit.
- 8,000 records (200 × 5 × 2 × 4), zero harness errors. Paired stats:
  McNemar exact; Wilson 95% intervals; effect size = risk difference.
  Full tables: `results/analysis-main.txt`.

## Per-hypothesis verdicts

### H1 — format fluency: NOT SUPPORTED

First-pass validity is ≥ 99.3% in every arm of every model, both
formats. A vs B (parity): 99.8% vs 99.7%, Δ = +0.2pp, 3 discordant
pairs in 576, p = 1.0. Current models write both a strict HTML dialect
and strict JSON essentially perfectly at these sizes; format fluency
is not where anything is decided.

### H2 — strategy: SUPPORTED, with two important qualifications
### ⚠ CORRECTED: NOT SUPPORTED under protocol v2 — A vs C is 91.9% vs 93.9% (Δ = −2.0pp, p = 0.04); no bucket shows a significant A–C difference; B vs C is a wash. A vs E (+5.4pp) stands (E unaffected). See the Correction section.

Task success, parity, pooled (n = 800 paired tasks):

| Comparison | Success | Δ | McNemar p |
|---|---|---|---|
| A vs C (rewrite vs tools) | 91.9% vs 86.6% | **+5.3pp** | < 0.0001 |
| B vs C (same, JSON side) | 93.5% vs 86.6% | **+6.9pp** | < 0.0001 |
| A vs E (rewrite vs patch) | 91.9% vs 86.5% | +5.4pp | < 0.0001 |

Qualification 1 — **it's the strategy, not the format**: B (JSON
rewrite) is at least as good as A (HTML rewrite) overall (93.5% vs
91.9%; B > A driven by gemini-3.5-flash, which is notably better in
JSON). D vs C (format within tools) is a wash.

Qualification 2 — **no crossover**: the pre-registered expectation was
that tools would overtake rewrite as trees grow. They never did.
Success by bucket (parity, pooled):

| Condition | xs (~5) | s (~20) | m (~60) | l (~150) |
|---|---|---|---|---|
| A (HTML rewrite) | 95.8% | 97.0% | 87.0% | 85.1% |
| B (JSON rewrite) | 96.8% | 96.1% | 89.7% | 89.9% |
| C (JSON tools) | 94.4% | 89.2% | 79.9% | 80.4% |
| D (HTML tools) | 93.5% | 90.5% | 78.8% | 81.5% |
| E (JSON Patch) | 93.5% | 94.0% | 84.2% | **69.6%** |

The A–C gap peaks at s/m (+7–8pp, p ≤ 0.035) and narrows at l (+4.8pp,
n.s.) — narrowing, but never reversing, at the sizes tested. The
sharpest size effect belongs to E: JSON Patch holds its own through
medium trees and collapses at 150 nodes (69.6%), where index-based
paths become error-prone.

Qualification 3 (per-model): the rewrite-vs-tools gap is a
small/mid-model phenomenon. gpt-5.4 and sonnet-4.5 are equally good at
tools (C ≈ A ± 1); haiku-4.5 (−10pp) and gemini-3.5-flash (−11pp) are
substantially worse with tools than with rewrite.

### H3 — cost: SUPPORTED on small/medium trees; still positive at large

Tokens per solved task (parity, pooled):

| Condition | xs | s | m | l |
|---|---|---|---|---|
| A | 1.1k | 2.9k | 7.6k | 15.6k |
| B | 1.3k | 3.7k | 10.8k | 23.0k |
| C | 4.8k | 14.6k | 10.7k | 20.8k |
| D | 4.8k | 13.2k | 8.6k | 15.3k |
| E | 1.3k | 3.0k | 6.5k | 15.4k |

Rewrite solves small/medium tasks with 4–5× fewer total tokens than
tools (tools resend the growing conversation each step). The gap
narrows at large sizes as whole-artifact output grows; HTML's terser
serialization makes A cheaper than B at every size (l: 15.6k vs 23k —
the one place the format genuinely matters). Caveats: rewrite tokens
are output-heavy (output costs ~5× input per token), so *dollar* cost
is closer than token cost; and providers cache tool-loop inputs
(gemini/gpt cached 21–40% of input tokens), which favors the tools
arms further. E is the cheapest condition at m — when it works.

### H4 — reference stability: SUPPORTED, large effect, mechanism nuanced
### ⚠ CORRECTED: NOT SUPPORTED under protocol v2 — A 88.1% vs C 91.3% (n.s.). The +33pp effect was the tool-history artifact. Zero id-reference failures remains true in every arm. See the Correction section.

Reference family (insert a node, then edit it by the id from the
model's own output), parity, n = 160 paired:

- **A 88.1% vs C 55.0%, Δ = +33.1pp, p < 0.0001** (A vs E: +13.8pp,
  p = 0.0003; A vs B: −1.9pp, n.s. — again strategy, not format).
- Zero id-reference failures in ANY arm: the referenced id always
  survived. The C/D failures are all "the follow-up edit was never
  applied": in all 110 audited phase-2 failures (haiku + gemini), the
  models performed unrelated or duplicate tool actions — e.g.
  inserting a second copy of the node instead of calling
  setAttribute — and declared DONE. sonnet and gpt-5.4 do not show
  this (38–39/40).

So the pre-registered H4 comparison holds strongly, but the mechanism
is not stale ids — it is multi-turn tool-calling unreliability in
smaller models, which whole-artifact rewrite simply never exposes.

### H5 — reading: NOT SUPPORTED

Reading accuracy A vs B (identical tasks, HTML vs JSON serialization):
87.1% vs 87.9% parity (7/9 discordant, p = 0.80); 86.2% vs 87.5%
best-effort. No model shows an HTML advantage. Errors concentrate in
counting questions on m/l trees in both formats.

## Prompt regimes

Best-effort prompts (a worked example + no-embellishment rule +
checklist, identical additions for every condition) moved success by
at most ~±2pp per cell and changed no conclusion. The parity numbers
above are the primary results.

## Cost & runtime of this benchmark

~$225 total API spend (sonnet $91, gpt-5.4 ≈ $49, gemini ≈ $45, haiku
$31, plus pilot/dev/describer ≈ $10). 21.3 hours of model time, ~7
hours wall-clock with four models in parallel at concurrency 5.

## Limitations

- **Describer affinity**: construction specs were written by
  xai/grok-4.3 (a family outside the subject roster) and were
  mechanically audited plus rebuild-checked — but rebuild checking
  used a JSON representation, and one pilot spec (before the audit
  existed) was hallucinated; the audit caught 1/24 main specs on its
  first attempt.
- **Tool-schema encoding fix mid-run**: Gemini rejects array schemas
  without `items`; all 576 Gemini C/D cells initially failed at the
  API layer (no scored data), the schema was fixed (value space
  unchanged), and those cells were re-run. Other models' cells ran
  with the original encoding; the two encodings are semantically
  identical.
- **Temperature 0 is not determinism**: the pilot observed one
  provider-side flake; expect ±1 task noise per cell.
- **Drift metric blind spot**: drift counts source-node changes and
  new-node count mismatches, not wrong content on new nodes (success
  catches those).
- **Best-effort disclosure**: the no-embellishment rule was motivated
  by pilot failure analysis (A/C parity) and applied uniformly to all
  five conditions; best-effort changed no conclusion.
- Model snapshots are gateway-current as of 2026-07-06; ids in
  `results/analysis-main.txt`.
- Size range tops out at ~190 nodes; a crossover beyond that is
  untested.

## Reproduction

```sh
bun install                                  # needs AI_GATEWAY_API_KEY in .env.local
bun test                                     # graders, twin validator, corpus generators (79 tests)
bun run corpus                               # regenerate corpora from committed seeds (byte-identical)
bun run describe corpus/main.json            # only for a fresh corpus; committed specs are canonical
bun run matrix                               # full matrix (~$225); resumable; per-model logs in results/
bun run scripts/analyze.ts results/raw/main-*.jsonl
```

## Addendum (2026-07-06): Condition F — id-anchored patches

Pre-registered in [docs/BRIEF-F.md](docs/BRIEF-F.md) after the main
study, motivated by E's large-tree collapse: a patch dialect whose
operations address nodes exclusively by id (`before`/`after` sibling
anchors or `parentId` append — no positional indexes), applied
atomically and validated by the same twin. 1,600 new cells (F × 200
tasks × 2 regimes × 4 models), zero harness errors; A/E comparisons
are paired against the existing records.

- **H6a (reliability) — CONFIRMED.** F vs E on the l bucket: 85.1% vs
  69.6%, Δ = +15.5pp, discordant 30/4, p < 0.0001. E's collapse was
  positional path arithmetic; anchoring removes it entirely — F at
  ~150 nodes lands exactly on A (85.1%).
- **H6b (economy) — CONFIRMED.** F is the cheapest condition at every
  size (xs 1.2k / s 2.7k / m 6.4k / l 13.2k tokens per solved task) —
  cheaper than E, and 16% cheaper than A at l.
- **H6c (parity with rewrite) — CONFIRMED.** F vs A overall (parity):
  92.6% vs 91.9%, Δ = +0.8pp, p = 0.53 — statistical parity with the
  best strategy from the main study, including on the reference family
  (90.6% vs 88.1%, n.s.).
- **Small-model bonus:** F is a top-two condition for both fragile
  models (haiku-4.5 184/200, gemini-3.5-flash 182/200, parity) —
  single-artifact patches avoid the multi-turn tool surface entirely.
  *⚠ Corrected under protocol v2: the "fragile models" framing was the
  tool-history artifact — with corrected history, haiku's tools scores
  (190/200) edge past F. F's absolute scores, its parity with rewrite,
  and its cost advantage are unchanged; the surviving structural point
  is that single-artifact interfaces cannot be affected by
  history-construction defects at all.*

Revised practical guidance: id-anchored patches match whole-tree
rewrite's reliability at the lowest cost measured, provided your
pipeline guarantees stable node ids — which is precisely what barkup's
id-preservation guarantee provides. Whole-tree rewrite remains the
simplest robust interface; anchored patches are the optimization to
reach for when token cost or latency matters. Positional formats (RFC
6902) and granular mutation tools remain the approaches to avoid below
the frontier tier.

Shipped-artifact validation (Tier-1 QA, 2026-07-06): the dialect
shipped as `@kevinpeckham/barkup` 0.2.0 (`applyAnchoredPatch`) and was
verified behaviorally identical to the reference applier the benchmark
validated — differential property tests (identical verdicts, trees,
and blamed op indexes over random tree × op sequences), 40 committed
conformance vectors (`corpus/patch-vectors.json`, replayable by any
implementation of the dialect), and a paired dogfood run swapping the
shipped applier into the harness (haiku-4.5, parity: F 184/200 vs
shipped 184/200, discordant 1/1, p = 1.0).

Caveat: F was designed with knowledge of the main-study results (the
motivation is disclosed in BRIEF-F.md); its comparisons reuse the A/E
records rather than re-running them, and the same temperature-0
nondeterminism noise applies.

## Correction (2026-07-06): the tool-history artifact and protocol v2

**The defect.** In the AI SDK, `result.response.messages` was the
documented v5 pattern for appending a tool run to conversation
history (all steps' assistant and tool messages). In v7 that accessor
still exists and typechecks but returns only the final step's
assistant text; the accumulated history moved to a new top-level
`result.responseMessages` (documented in the v7 migration guide),
with per-step messages in `steps[i].response.messages`. The v7 types
do mark the property @deprecated (editor-visible), but there is no
compile error and no runtime signal — and the 4.0 migration guide had
explicitly recommended `response.messages` over the then-deprecated
`responseMessages`, so the trapped pattern is the previously-blessed
one. Our harness used it; history silently truncated. Reported
upstream: https://github.com/vercel/ai/issues/16840.
Our tools loop pushed the former into conversation history, so in
every multi-turn tools conversation the model saw its own prior turns
as bare text ("DONE") with **no record of the tools it had called** —
including the insertNode result that returned the id it was later
asked to edit. Within-call multi-step tool use was always correct;
rewrite (A), patch (E, F), and single-turn tools cells were
unaffected. Affected: tools-arm validity-retry rounds (rare), the
reference family's phase 2 in C/D, and all of Study G's tools arms.

**The fix and re-runs.** Protocol v2 flattens per-step messages
(verified end-to-end). All 640 main-study reference C/D cells and all
1,440 Study G tools cells were re-run under v2; v1 records are
retained (`results/raw/*-v1.jsonl`, and the original `main-*` files)
as a controlled hidden-history ablation.

**Corrected results** (full tables:
`results/analysis-main-corrected.txt`):

| Claim | Original (v1) | Corrected (v2) |
|---|---|---|
| A vs C overall, parity | +5.3pp, p < 0.0001 | **−2.0pp, p = 0.04** (slight tools edge) |
| A vs C by bucket | A ≥ C everywhere | no significant difference in any bucket |
| B vs C overall | +6.9pp, p < 0.0001 | −0.4pp, p = 0.72 |
| H4 reference, A vs C | +33.1pp, p < 0.0001 | −3.1pp, p = 0.36 |
| haiku-4.5 tools overall | 80.5% | **95.0%** |
| gemini-3.5-flash tools overall | 75.5% | 88.5% |

Per-model reference-family v1 → v2 success splits (parity, C+D pooled,
n = 80 per model per protocol) and the reconciliation of the
follow-up-dropout failure counts (110 audited in the original run vs
114 transcript-classified in the Study G Phase A re-run vs 137 total
audit-log failures) are in `results/analysis-permodel-reference.txt`.

Unchanged by the correction: H1 and H5 null results; H3 token-cost
findings (rewrite/patches 4–5× cheaper than tools on small/medium
trees — a statement about tokens, not success); E's positional-patch
collapse at ~150 nodes and all condition-F results (+15.5pp over E at
l; parity with A; cheapest condition); zero id-reference failures in
every arm under both protocols. The one genuine residual model
deficit: gemini-3.5-flash's remaining reference-family failures are
all **phase-1 tools accuracy** (fumbling the initial insert), not
follow-up dropout — consistent with its generally lower tools scores.

**What the artifact teaches (Study G).** Pre-registered as
docs/BRIEF-G.md to investigate "multi-turn tool-instruction dropout,"
Study G instead pinned the artifact precisely, with 2,160 cells per
protocol over six models across three vendors:

- Under v1 (hidden history): follow-up execution ranged from 5%
  (haiku) to 100% (gpt-5.4 at depth ≥ 2), non-monotonic in depth,
  model-idiosyncratic; a restatement-mitigation prompt made gpt-5.4
  collapse from 100% to 7.5%; a fresh-context arm recovered every
  model to 100%.
- Under v2 (correct history): **100% for every model, every arm,
  every depth** — 2,160/2,160.

Practical guidance: if a small model "can't do multi-turn tool
calling," audit the conversation history your framework actually
sends before concluding anything about the model. Frontier models'
robustness to malformed history masks the defect in exactly the
integrations where it will later bite a cheaper model. And
whole-artifact interfaces (rewrite, patches) are structurally immune
to this failure class — the strongest surviving argument for them
beyond token cost.

**Publication trail.** The original findings were published (repo,
article update, companion post) before the defect was found;
corrections are being propagated to every surface. v1 numbers remain
reproducible from the retained files; the pre-registration and
honesty rules required publishing this correction with the same
prominence as the original claims.

## Addendum (2026-07-07): Study H — the size extension

Pre-registered in [docs/BRIEF-H.md](docs/BRIEF-H.md): conditions A
(HTML whole-tree rewrite), E (RFC 6902 patch), and F (id-anchored
patch, via the shipped package) on 45 fresh transformation tasks at
~300 / ~600 / ~1000 nodes (seed 20260708), claude-sonnet-4.5 and
gemini-3.5-flash, parity prompts, protocol v2, `maxOutputTokens`
60k. 270 cells; full tables in `results/analysis-sizeext.txt`.

| Success | ~300 | ~600 | ~1000 |
|---|---|---|---|
| sonnet A | 15/15 | 14/15 | 12/15 |
| sonnet F | 15/15 | 15/15 | 13/15 |
| sonnet E | 8/15 | 3/15 | 1/15 |
| gemini A | 9/15 | 5/15 | **0/15** |
| gemini F | 14/15 | 14/15 | 13/15 |
| gemini E | 8/15 | 3/15 | 2/15 |

- **H-H1 (F holds at scale) — CONFIRMED, in a stronger form.** F is
  within noise of A for the frontier model (95.6% vs 91.1% pooled,
  p = 0.69) and dominates for the small model (91.1% vs 31.1%,
  discordant 28/1, p < 0.0001). Pooled: F 93.3% vs A 61.1%
  (discordant 32/3, p < 0.0001). The crossover the original benchmark
  went looking for exists — above a few hundred nodes, whole-tree
  rewrite becomes frontier-only, while anchored patches are
  tier-independent.
- **H-H2 (cost) — CONFIRMED, with the honest nuance that it is a
  dollars-and-latency story.** Raw solved-task token totals converge
  (F carries the tree as input; A pays it as output), but output
  costs ~5× per token: at ~1000 nodes, sonnet A ≈ $0.88 and 597 s per
  solved task vs sonnet F ≈ $0.26 and **4 s** (gemini F: $0.037,
  2 s). One failed A retry loop burned ~500k tokens; F failures cost
  ~100 output tokens to discover.
- **H-H3 (positional collapse deepens) — CONFIRMED.** E falls from
  69.6% at ~150 nodes to 53% → 20% → ~10%.
- **Mechanical ceiling (exploratory).** Unstreamed, every sonnet A
  cell at ≥600 nodes died at the transport layer (10–15-minute
  generations exceed gateway limits); the cells were re-run with a
  streaming transport (flag-gated, request semantics unchanged —
  disclosed protocol note). One cell (`trans-xxxl-5` × A, sonnet)
  reproducibly generated no output under both transports and is
  counted as a mechanical failure per the brief. Sonnet's three
  graded A failures at scale are all valid-but-wrong (drift), never
  invalid.

Revised practical guidance, superseding the F addendum's phrasing:
below ~200 nodes, whole-tree rewrite and anchored patches are
interchangeable on accuracy and rewrite is operationally simplest;
above ~300 nodes, anchored patches are the only interface that is
simultaneously reliable across model tiers, fast (seconds, not
minutes), cheap, and free of transport ceilings. Positional patch
formats should not be used on large trees at any tier.

## Addendum (2026-07-07): Study I — focused views (partial-context patches)

Pre-registered in [docs/BRIEF-I.md](docs/BRIEF-I.md): every prior
study held the input constant (full tree in the prompt) and varied
the output interface. Study I varies the input: condition F
(id-anchored patch, shipped applier) with the prompt tree replaced by
a **focused view** — the root-to-target spine rendered fully,
everything else collapsed to id-bearing placeholders (**FV**) or
omitted with a count (**FT**, the aggressive minimum). Patches still
apply to the full tree; grading is unchanged. Same corpus, models,
and protocol as Study H's F cells, which serve as the paired
full-input baseline. 180 new cells; full tables in
`results/analysis-studyi.txt`.

| Success | ~300 | ~600 | ~1000 |
|---|---|---|---|
| sonnet F (full input) | 15/15 | 15/15 | 13/15 |
| sonnet FV | 15/15 | 14/15 | 14/15 |
| sonnet FT | 15/15 | 15/15 | **15/15** |
| gemini F (full input) | 14/15 | 14/15 | 13/15 |
| gemini FV | 14/15 | 14/15 | 14/15 |
| gemini FT | 13/15 | 14/15 | 14/15 |

- **I-H1 (views don't hurt) — CONFIRMED.** Paired McNemar vs
  full-input F: sonnet FV p = 1.0, FT p = 0.5; gemini FV p = 1.0,
  FT p = 1.0. Discordant pairs are 1–4 per comparison and trade in
  both directions. Sonnet on the *minimal* view was a perfect 45/45,
  numerically better than its full-input 43/45.
- **I-H2 (input cost) — CONFIRMED, well past the ≥70% prediction.**
  Median input per task at ~1000 nodes: sonnet 85,642 → 3,500 (FV,
  −96%) → 1,531 (FT, −98%). The minimal view's input barely grows
  with tree size (1,331 → 1,531 median tokens from ~300 to ~1000
  nodes): it scales with tree *depth*, not node count, which
  effectively removes the context-window ceiling for id-addressed
  edits. Per solved ~1000-node task, FT costs under a cent on either
  model. The whole study cost ≈ $1.
- **I-H3 (minimal view holds; failures don't concentrate in
  placement) — CONFIRMED.** By edit kind (pooled), the view arms
  match or beat full input everywhere; insert-node is the weakest
  kind in *every* condition including full-input F (13/18 vs FV
  15/18, FT 14/18).
- **Zero duplicate-id collisions** (exploratory) in 180 runs — the
  pre-registered fresh-id worry never materialized; models followed
  the random-suffix instruction. Correction rounds fired on ~10% of
  view tasks, all `invalid-patch`, mostly recovered.
- **Why less context can help (failure audit).** Every failure in the
  study was re-graded independently and diffed. Sonnet's two
  full-input baseline failures were "insert as the 1st child" tasks
  where it appended the node as the *last* child — with 85k tokens of
  tree it reached for the lazy `parentId` append instead of anchoring
  `before` the first sibling. With the view, the destination's child
  list is in plain sight, and both tasks pass. The view arms' own
  failures are ordinal off-by-ones on move and gemini inventing
  unrequested attributes on under-specified inserts — the same
  model-error classes, at the same tasks, as full input.

**Scope caveats (pre-registered).** This is the oracle bound: task
instructions name their target ids explicitly, so "retrieval" is
trivially perfect, and the view is built from exactly the ids the
instruction quotes (verified: zero leakage beyond the instruction
text). How a real system finds the relevant nodes from a vague
request is deliberately untested here. Single-turn tasks only;
n = 45 per model-condition. One corpus wart, condition-independent:
attribute-less insert instructions ("Insert a new image-atom",
nothing else) punish models that invent plausible defaults — a
legitimate obedience test under the parity prompt's "change only
what the request calls for", but future corpora should say "with no
attributes" explicitly.

**Decision rule outcome.** The pre-registered feature gate for a
`@kevinpeckham/barkup/view` capability passes at the trimmed (FT)
contract: spine + complete child lists of referenced nodes + honest
omission counts, with every visible id guaranteed patch-addressable.
Combined guidance with Study H: at any size where you know which
nodes an edit concerns, an anchored patch against a focused view is
simultaneously the most reliable, cheapest, and fastest interface
measured, and its input cost is size-invariant.

## Addendum (2026-07-07): Study J — HTML-rendered views

Pre-registered in [docs/BRIEF-J.md](docs/BRIEF-J.md): Study I's views
were serialized as JSON; the proposed `@kevinpeckham/barkup/view`
capability would render them in barkup's native HTML dialect. Study J
re-ran both view modes with the identical view content rendered as
HTML (placeholders as `data-collapsed` / `data-child-count` elements,
omissions as `data-omitted-children`; expanded regions byte-identical
to condition A's serialization, unit-tested), keeping the JSON patch
dialect, shipped applier, and grading unchanged — the cross-format
seam (HTML view in, JSON patch out) was part of what was tested. 180
cells; full tables in `results/analysis-studyj.txt`; every record
independently re-graded (0 mismatches).

- **J-H1 (HTML views match JSON views) — CONFIRMED, unusually
  cleanly.** Paired McNemar per model per mode: p = 1.0 in all four
  comparisons; three of the four had *zero* discordant pairs, and the
  other two differed by a single task each. The cross-format seam
  produced no failure mode.
- **J-H2 (format cost) — CONFIRMED.** HTML views are terser than
  their JSON twins at every size: at ~1000 nodes, FVH 2,669 vs FV
  3,500 median input tokens (−24%) and FTH 1,391 vs FT 1,531 (−9%);
  the minimal view's input is now ~1.6% of full-input F's.
- **Exploratory: HTML views had *better* first-pass validity** —
  84–85/90 vs 80–81/90 for the JSON views, with correction rounds
  down accordingly (5–6 vs 9–10). Consistent with the original
  article's legibility claim, though the margin is small and
  untested.

**Decision rule outcome.** The serialization gate passes: FTH is
non-inferior to FT for both models (one discordant task each,
p = 1.0). `/view` ships with HTML as its native rendering. Combined
Study I + J guidance: a focused HTML view plus an id-anchored patch
is the cheapest and most reliable editing interface measured at any
size tested, with input that scales with tree depth rather than node
count.

## Prior art

Aider's edit-format benchmarks (whole-file vs diff formats measurably
change success rates — consistent with our E-vs-rewrite results) and
the Berkeley Function-Calling Leaderboard (granular tool-call
reliability varies sharply by model — a phenomenon our correction
suggests should itself be audited for history-construction artifacts).
