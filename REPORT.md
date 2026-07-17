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

## Addendum (2026-07-07): prompt-caching audit

Provider-side prompt caching is on by default for two of the three
vendors (OpenAI caches ≥1024-token prefixes automatically; Gemini 2.5+
implicit caching is on by default) and cannot be disabled at the
request level; Anthropic caching is opt-in via `cache_control`
breakpoints, which this harness never sets. Since caching cannot be
uniformly controlled out, it is audited instead: the harness records
provider-reported cached-input reads per call
(`CallLog.cacheReadTokens`), and `scripts/audit-cache.ts` tabulates
them over every raw record (full tables in
`results/analysis-cache-audit.txt`).

What the audit shows, and what it means for the published numbers:

- **Token metrics are caching-independent.** The subset invariant
  (cache reads ≤ input tokens) holds on all 46,258 calls: reported
  input tokens are *total* prompt tokens, cached included. Every
  token count in this report measures true prompt size. Accuracy and
  validity metrics are untouched by definition — caching is a
  serving-layer optimization, not a change to model computation.
- **Anthropic cells are cache-free by construction** — zero cache
  reads across all 21,124 Anthropic calls on record, consistent with
  opt-in caching never being enabled.
- **Where default caching fired:** the main matrix's gemini/gpt arms
  (6.9–51% of input by condition, heaviest in the tools arms C/D —
  already disclosed in the H3 caveat); the Study G follow-up's
  deep-history arms (gemini 46–63%, gpt 74–87% — long identical
  resent histories are exactly what caching targets); reference-v2
  tools arms (30–53%); Study H gemini A 6.2% and E 20.4%.
- **Cache-free cells include every published dollar figure.** Study
  H's solved-task economics quote sonnet A $0.88 / sonnet F $0.26
  (Anthropic: zero cache) and gemini F $0.037 (gemini F: 0.0% cached
  at every size), so the list-price arithmetic behind those figures
  is exact, not a caching-inflated bound. Studies I and J are
  entirely cache-free (all four view arms, both models, 0 reads in
  360 runs — view prompts are small and per-task unique), so every
  Study I/J number stands as-is.
- **What caching does touch:** real billed cost and latency in the
  gemini/gpt arms above (providers discount cached reads), which
  *favors the tools/deep-history arms* in any dollar reading of those
  cells — the direction already noted in H3. Latency comparisons
  within those vendors inherit the same mild tailwind.

**Going forward (Study K).** Sessions resend a growing conversation
every step — the caching-relevant workload. The session runner now
records per-call cache reads (instrumentation-only change, committed
mid-run; the first 204 sonnet steps predate it but are zero by the
construction above). K's primary cost metric stays token-based
(cache-independent); any dollar view will disclose observed cache
reads and the structural asymmetry that a stock integration caches by
default on gemini but not on anthropic — a production Anthropic
deployment would opt in and cache session prefixes, so cross-vendor
session dollar comparisons are "default config" comparisons, not
capability comparisons.

## Addendum (2026-07-07): Study K — long editing sessions

Pre-registered in [docs/BRIEF-K.md](docs/BRIEF-K.md): 12 sequential
edits per tree in one conversation (the production chat-session
shape), 20 sessions at ~150/~300 nodes, with 51 steps referencing
nodes the session itself created. Four serialization policies:
**K-once** (full tree shown only at step 1), **K-view** (a fresh
~1.5k-token minimal focused view every step), **K-refresh5** (full
re-serialization at steps 6/11), **K-rewrite** (whole-tree rewrite
anchor, half session count). Patches apply to the model's CURRENT
tree; each step is graded against ground truth computed from the
model's own pre-step state. 1,680 step records, 140 sessions, zero
invariant violations in audit; full tables in
`results/analysis-studyk.txt`.

Per-step success by session third (sonnet-4.5 / gemini-3.5-flash):

| Policy | steps 1–4 | steps 5–8 | steps 9–12 | end-state intact |
|---|---|---|---|---|
| K-once | 98.8% / 98.8% | 92.5% / 100% | **83.8%** / 96.3% | 8/20 / 17/20 |
| K-refresh5 | 98.8% / 100% | 92.5% / 100% | 91.3% / 91.3% | 11/20 / 15/20 |
| K-view | 100% / 98.8% | 98.8% / 100% | **100%** / 98.8% | **19/20 / 19/20** |
| K-rewrite | 97.2% / 52.5% | 100% / 67.5% | 94.4% / 69.2% | 7/10 / **2/10** |

- **K-H1 (drift) — CONFIRMED for sonnet, decisively.** Serialize-once
  decays to 83.8% by the last third; per-turn views stay flat (239/240
  steps overall). Paired per (session, step): 19 K-view-only successes
  vs **zero** K-once-only (p < 0.001; last third 13–0). Gemini is the
  surprise: it barely drifts under K-once (96.3% last third) — the
  cheap tier tracks its own *visible* patch history fine; Study G's
  small-model fragility was about *hidden* history.
- **K-H2 (policy) — CONFIRMED, with no cost tradeoff.** K-view is the
  most accurate AND the cheapest policy: ~55k input tokens/session vs
  K-once ~215k (the once-shown tree rides along in history every turn,
  so showing it once saves nothing), K-refresh5 ~366k (worst of both),
  K-rewrite ~836–971k in plus ~130k out.
- **K-H3 (mechanism) — CONFIRMED.** The decay concentrates in
  ordinal-placement edits: insert/move under K-once fall 95% → 85% →
  80% while K-view holds ~98% at every stage; reference-back steps are
  99.0% under K-view vs 92.2% under K-once.
- **K-H4 (rewrite anchor) — accuracy holds only at the frontier, and
  sessions add two structural failure modes.** Sonnet K-rewrite
  matches K-view where it completes (n.s.), but one xl session
  deterministically exhausted the 200k context window at step 11 —
  twelve accumulated whole-tree rewrites simply do not fit (recorded
  as a mechanical failure; reproduced on re-run). Gemini K-rewrite
  collapses at ~300 nodes in session form (52–69%; sessions as low as
  0/12), and **all 44 of its graded failures are valid-but-wrong with
  drift** — silently damaged trees that pass validation, compounding
  step over step (end-state intact: 2/10).

**Protocol notes (disclosed).** Two recording-only harness changes
mid-study, request semantics untouched: per-call `cacheReadTokens`
capture was added after the first 17 sonnet sessions (those records
lack the field; zero by construction, since Anthropic caching is
opt-in and never enabled), and partial-session recording at
mechanical ceilings was added after the context-window failure was
first observed (the affected session was re-run once, confirming the
ceiling deterministically). Per the prompt-caching audit's Study K
rule above: tokens are the primary cost metric; gemini's default
implicit caching covered 44–74% of session input depending on arm
(sonnet 0%), so cross-vendor dollar comparisons are default-config
comparisons. Spend ≈ $93 at list prices (cache-blind upper bound),
within the pre-registered band.

**Practical guidance.** For editing sessions over typed trees, attach
a fresh minimal focused view to every patch turn: it is the most
accurate policy at every model tier tested, the cheapest by 4–15×,
structurally immune to context-window exhaustion, and it removes the
one failure class (stale ordinal placement) that grows with session
length. Whole-tree rewrite should not be used as a session protocol:
below the frontier tier it silently corrupts state, and at any tier
its conversation grows toward a hard context ceiling.

## Addendum (2026-07-08): Study M — stateless sessions

Pre-registered in [docs/BRIEF-M.md](docs/BRIEF-M.md): if the per-turn
view carries the state (Study K), does the model need conversation
history at all? Two new policies on the K corpus and runner —
**M-stateless** (every step a fresh single-turn conversation: view +
instruction, no memory) and **M-window** (last 2 completed exchanges
kept) — paired against Study K's K-view cells. 960 step records, 80
sessions, zero invariant violations, ≈ $4; tables in
`results/analysis-studym.txt`.

- **M-H1 (statelessness matches K-view) — REFUTED for sonnet,
  directionally refuted for gemini.** The result we predicted did not
  happen, and we publish it as found: K-view beat M-stateless 7–0 on
  discordant steps for sonnet (p = 0.016) and 5–0 for gemini
  (p = 0.063). End-state integrity drops from 19/20 sessions (K-view)
  to 13–14/20 (stateless). History contributes something beyond
  state.
- **What history contributes (failure anatomy):** every stateless-only
  failure is a **late-session placement edit** (inserts at step 9,
  moves at steps 5/10), almost all first-pass-valid with drift 0 —
  the patch was legal, the position was wrong. The current view shows
  the same child lists in both arms, so the redundancy history
  provides for positional reasoning is doing real work; pinning the
  exact mechanism needs transcript-level follow-up
  (`BENCH_LOG_TRANSCRIPTS=1`). A side observation: without
  conversational precedent for terse replies, gemini's stateless
  outputs balloon 6× (mean 309 vs 55 output tokens per step).
- **M-H2 (cost shape) — CONFIRMED.** Stateless input is flat
  (~1.3k tokens at step 1 and step 12 alike) vs K-view's growth
  (1.2k → 8.1k); a stateless session costs ~16–18k input tokens vs
  K-view's ~54–56k. The economics work; the accuracy doesn't.
- **M-H3 (the window) — intermediate, leaning inadequate.** M-window
  is not significantly below K-view on per-step success (4–0,
  p = 0.125 sonnet; 5–2, p = 0.453 gemini), but its end-state
  integrity (15–16/20) sits closer to stateless than to K-view, and
  its failures are the same late-session placement class.

**Decision rule outcome.** Statelessness fails the gate, so the
session guidance stands at Study K's answer and gains a boundary:
keep the full conversation history AND attach a fresh minimal view
every turn. History is cheap at these session lengths (~55k input
tokens for 12 edits); the constant-cost stateless recipe costs 3× as
many session corruptions. For sessions long enough that history
itself becomes the ceiling, a >2-exchange window is the open
question, not zero memory.

## Addendum (2026-07-08): Study L — grounding without ids

Pre-registered in [docs/BRIEF-L.md](docs/BRIEF-L.md) (one disclosed
pre-run amendment: the navigation prompt's format section is the HTML
dialect, matching the HTML views its rules already described): the
size-extension tasks with **id-free instructions** — targets
described by unique name, distinguishing attribute, or ordinal within
a named ancestor, every description programmatically verified to
match exactly one node (`corpus/grounded.json`). Three context
mechanisms, all emitting anchored patches: **LG-full** (whole tree in
the prompt), **LG-nav** (minimal root view + an `expand_node` tool,
≤16 steps/call), **LG-lex** (deliberately dumb lexical retrieval
feeding the minimal view — the floor). 270 cells, zero errors, every
record independently re-graded (0 mismatches); tables in
`results/analysis-studyl.txt`.

| Success (45 tasks) | sonnet-4.5 | gemini-3.5-flash |
|---|---|---|
| Oracle bound (Study I, ids in instructions) | 43/45 | 41/45 |
| LG-full (grounded, whole tree) | 39/45 | 38/45 |
| LG-nav (grounded, navigate) | **43/45** | 23/45 |
| LG-lex (grounded, naive retrieval) | 27/45 | 25/45 |

- **L-H1 (the oracle premium): measured at ~7–9 points.** Grounding a
  human-style description in a full 300–1000-node tree costs sonnet
  95.6% → 86.7% and gemini 91.1% → 84.4% relative to id-anchored
  instructions. Models are decent grounders in-context; they are not
  free ones.
- **L-H2 (mechanism comparison): the interesting half survived, the
  economics did not.** Navigation reaches oracle-level accuracy on
  the frontier model (43/45; 4–0 discordant over LG-full, p = 0.125)
  — but at a median of **54 expand calls per task**, its input cost
  exceeds just showing the whole tree (355k median tokens at ~1000
  nodes vs 90k). And it is frontier-only: gemini navigates itself
  into the ground (23/45, p < 0.001, median 58 expands, inputs up to
  ~636k), usually exhausting its budget without ever emitting a valid
  patch (20 of its failures are "invalid"). The predicted ≥80% input
  saving held only for LG-lex (~2.5k tokens/task, −97%), which is
  significantly less accurate (p ≤ 0.002 both models).
- **L-H3 (failure anatomy) — CONFIRMED where it applies.**
  Misgrounding dominates LG-full (8 of 13) and LG-lex (34 of 38 —
  the retriever simply misses the target region); LG-nav's dominant
  failure is a new class, budget exhaustion without an answer.

**Decision rule outcome: the gate FAILS, and the boundary stands.**
No partial-context arm is simultaneously non-inferior and ≥80%
cheaper. `/view`'s honest guidance is unchanged: when your
application knows which node ids an edit concerns, views are free
accuracy-wise (Studies I/J); *finding* those ids from a vague request
is real work that either costs a full-tree read (~7–9 point premium
included) or a retrieval system genuinely better than lexical
overlap. The skeleton-plus-expand agent pattern, appealing as it
looks, is not the free win: accurate only at the frontier tier and
more expensive than the problem it solves. Spend ≈ $45, within the
pre-registered band. *(This boundary is revised by Study N, below:
replacing the expand tool with a content-search tool passes the same
gate on both models.)*

## Addendum (2026-07-09): Study N — the retrieval ladder

Pre-registered in [docs/BRIEF-N.md](docs/BRIEF-N.md): the rungs
between Study L's floor (lexical retrieval, 60%) and ceiling
(full-tree grounding, 84–87%), on the unchanged grounded corpus.
**N-search** replaces LG-nav's `expand_node` with one `find_nodes`
content-search tool (LG-lex's token-overlap scorer over the model's
own query, top 5 rendered in place, same 16-step budget).
**N-embed** replaces LG-lex's scorer with
`openai/text-embedding-3-small` (retrieval materialized and
committed pre-run in `corpus/embed-focus.json`). **N-ground2** is
two-stage: a grounder reads the full tree and names the target ids,
then the patcher edits against the minimal view of those ids;
**N-ground2x** is the economic configuration (gemini grounds, sonnet
patches). 315 cells, zero errors, every record independently
re-graded (0 mismatches), zero invariant violations; ≈ $12, well
inside the $30–55 band; tables in `results/analysis-studyn.txt`.

| Success (45 tasks, grounded) | sonnet-4.5 | gemini-3.5-flash |
|---|---|---|
| Oracle bound (Study I, ids in instructions) | 43/45 | 41/45 |
| LG-full (Study L) | 39/45 | 38/45 |
| LG-nav (Study L) | 43/45 | 23/45 |
| **N-search** | **43/45** | **39/45** |
| N-embed | 25/45 | 24/45 |
| N-ground2 (same model, two-stage) | 41/45 | 37/45 |
| N-ground2x (gemini grounds → sonnet patches) | 41/45 | — |

- **N-H1 (search rescues navigation) — CONFIRMED, emphatically.**
  N-search matches LG-nav's frontier accuracy exactly (43/45, the
  same two failed tasks) at a **median of ONE `find_nodes` call**
  and ~5–6.5k input tokens vs LG-nav's 355k at ~1000 nodes. And it
  fixes the cheap-model collapse: gemini 39/45 vs LG-nav's 23/45
  (16–0 discordant, p < 0.001), matching LG-full. Content search
  jumps straight to the region; structural walking pays a frontier
  toll per hop. On sonnet, N-search even beats LG-full 4–0
  (p = 0.125) — the focused result set appears to help, not hurt.
- **N-H2 (embeddings beat the lexical floor) — REFUTED.** The
  embedding retriever's top-5 covers the targets on 23/45 tasks vs
  lexical's 24/45; task success is statistically identical to LG-lex
  (p = 0.688 / 1.000). Node-level text embeddings cannot resolve
  structural references ("the 3rd block inside the section named
  atlas") any better than keyword overlap. Swapping a lexical
  matcher for off-the-shelf embeddings is not the retrieval upgrade
  the gap needs.
- **N-H3 (two-stage) — accuracy holds; the cross cell is the
  winner.** Same-model two-stage is non-inferior to LG-full
  (+4.4 pp sonnet, −2.2 pp gemini) but saves little total input
  (18% / 5%) — someone still reads the whole tree. N-ground2x keeps
  the accuracy (41/45, +4.4 pp over sonnet LG-full, p = 0.688) while
  the frontier model's median input drops to **1,484 tokens
  (−97.4%)**; gemini's stage-1 grounding is exactly as good as
  sonnet's (valid 45/45, covers targets 41/45 for both). Grounding
  is cheap-model work.

*Protocol note (disclosed 2026-07-09, found while porting the
scorer to the barkup package): BRIEF-L and BRIEF-N describe
retrieval tie-breaking as "document order", but the committed
scorer's traversal (`walkTree`) is breadth-first, so equal-score
ties across depths actually resolved in BFS order. The committed
code is the pre-registered artifact and every scored run and
analysis used the same function, so all results are internally
consistent; the divergence affects only which of several
equally-scoring nodes fills the last top-5 slots. The shipped
`barkup` port implements the brief's depth-first pre-order and
documents the difference.*

**Decision rule outcome: the gate PASSES, twice.** N-search is
non-inferior to LG-full on both models (in fact better or equal)
with ~90% input savings; N-ground2x is non-inferior with 97% savings
on the frontier-side basis. Study L's boundary is revised: finding
the ids no longer requires a full-tree read or a real retrieval
system — a skeleton view plus one deterministic content-search tool
call gets oracle-level accuracy on the frontier model and
full-tree-level accuracy on the cheap one, at view-scale cost.
`/view`'s guidance graduates as BRIEF-N specifies: the documented
recipe is search-then-patch (and, where a frontier patcher is the
expensive resource, ground with the cheap model first).

## Addendum (2026-07-09): Study O — positional views

Pre-registered in [docs/BRIEF-O.md](docs/BRIEF-O.md): Study M's
stateless failures were all placement edits, so Study O annotates
every rendered view child with its true 1-based position (counting
omitted siblings) plus one pre-registered prompt line mapping
ordinals to anchors, and re-runs the stateless policy
(**O-stateless**) and the full-history policy (**O-view**),
completing the history × positions 2×2 against the reused
M-stateless and K-view baselines. 960 step records, zero invariant
violations, zero blocked steps, ≈ $6; tables in
`results/analysis-studyo.txt`.

- **O-H1 (the rescue) — REFUTED; the gate FAILS.** Positions moved
  stateless accuracy barely at all: O-stateless vs M-stateless is
  3–1 discordant on sonnet (p = 0.625) and 1–0 on gemini (p = 1.0).
  Against K-view the deficit replicates (5–0, p = 0.063 sonnet; 4–0,
  p = 0.125 gemini), and end-state integrity is 15/20 on both models
  vs K-view's 19/20 — outside the pre-registered within-2 bound.
  Late-session placement edits keep failing (sonnet 54/60 vs
  K-view's 59/60) **with the correct position printed on every
  visible child**. Whatever history contributes to placement, it is
  not arithmetic the model failed to do; making the number explicit
  does not substitute for having produced the prior edits.
- **O-H2 (annotation under memory) — as predicted.** O-view is
  indistinguishable from K-view (1–1, p = 1.0 sonnet; 2–0 in
  O-view's favor, p = 0.5 gemini). It is the best cell in the study
  descriptively — gemini O-view ends 20/20 sessions byte-perfect and
  goes 60/60 on late placements — but not significantly better, so
  it ships as "harmless, possibly mildly helpful", not as guidance.
- **O-H3 (cost shape) — CONFIRMED.** O-stateless input stays flat
  (~1.33k at step 1, ~1.44k at step 12); the annotation costs ~9%
  extra view tokens, inside the pre-registered <15%.

**Decision rule outcome: statelessness stays refuted, and the
mechanism account sharpens.** M left open whether history was
supplying positional information the view lacked; O closes that
door — the position was printed on the node and stateless models
still misplaced. Keep the full conversation history AND the per-turn
view. The remaining mechanism candidates (does producing prior
patches teach the dialect's anchor semantics? does history carry
commitment to earlier placements?) need transcript-level work, not
another serializer variant.

## Addendum (2026-07-09): Study P — synthetic history

Pre-registered in [docs/BRIEF-P.md](docs/BRIEF-P.md): Studies M and
O showed stateless sessions fail on late placements with every
relevant fact visible, leaving two accounts of what history
contributes — worked precedent (teaching) or commitment to the
session's own edits. Study P injected **fake history**: two canned
worked examples (an ordinal insert and an ordinal move on a fixed,
unrelated tree; patches unit-tested), delivered either as fabricated
conversation turns before every fresh step (**P-canned**) or as a
documentation block in the system prompt (**P-system**). 960 step
records, zero invariant violations, zero errors, ≈ $5; tables in
`results/analysis-studyp.txt`.

- **P-H1 (the teaching account) — CONFIRMED; the gate PASSES, on
  both models, in both framings.** Against K-view (full history) the
  worst discordance is 2–0 (p ≥ 0.5 everywhere); end-state integrity
  is 18/20 (sonnet) and 19–20/20 (gemini) vs stateless's 13–14/20 —
  within the pre-registered bound. Against M-stateless, gemini's
  gains are significant (7–0, p = 0.016 canned; 6–0, p = 0.031
  system) and sonnet's directional (7–1, p = 0.070; 7–2, p = 0.180).
  Late placements go from the failure class to near-perfect
  (gemini P-canned: 60/60, and 20/20 sessions end byte-perfect —
  descriptively the best session cell in the series alongside
  O-view).
- **P-H2 (content vs framing):** P-system ≈ P-canned (discordance
  ≤ 2–1, p = 1.0 both models). The contribution is the CONTENT — it
  can live in a system prompt; no fake turns required.
- **P-H3 (cost and style) — CONFIRMED.** Flat ~2.1k input/step
  (examples cost ~900 tokens, constant), ~26k tokens per 12-edit
  session vs K-view's ~54k. And the terseness account from Study M
  closes: gemini's stateless output bloat (309 tokens/step)
  disappears with examples in context (55/step).

**Decision rule outcome: statelessness is rescued, and the session
guidance is REVISED.** What conversation history was contributing is
now identified: worked precedent for the anchor dialect's tricky op
classes, not memory of the session's own edits (Study O ruled out
positional arithmetic; Study P shows unrelated-tree examples
substitute fully). Sessions no longer need to carry their past:
persist the tree, render a fresh minimal view every turn, and put
two worked examples of insert-by-ordinal and move-by-ordinal in the
system prompt. At 12-edit lengths this is half the input cost of
keep-history, is flat in session length with no context ceiling, and
matches full-history accuracy on both models. Studies K/M/O's
keep-history guidance remains correct where prompt space is
unavailable; it is no longer the only safe option.

## Addendum (2026-07-09): Study Q — fan-out edits

Pre-registered in [docs/BRIEF-Q.md](docs/BRIEF-Q.md): one
instruction, many targets ("set textStyle to serif on every
text-atom inside the block named X"), on a new 45-task corpus over
the size-extension trees (seed 20260710, 2–32 targets, median 6,
uniqueness/non-nesting validated, id-free). Three arms: **Q-view**
(retrieval oracle: container + every target in the view), **Q-full**
(whole tree), **Q-search** (the barkup 0.4 recipe, deliberately
untuned). 270 cells, every record independently re-graded
(0 mismatches); two gemini Q-search cells hit a retryable gateway
error ("Corrupted thought signature") and were re-run per protocol
(never double-recorded; both failed). ≈ $25; tables in
`results/analysis-studyq.txt`.

| Success (45 tasks) | sonnet-4.5 | gemini-3.5-flash |
|---|---|---|
| Q-view (oracle retrieval) | 31/45 | 28/45 |
| Q-full (whole tree) | 22/45 | **36/45** |
| Q-search (shipped recipe) | 21/45 | 25/45 |

- **Q-H1 (mechanics hold with retrieval solved) — REFUTED.** With
  every target visible in the view, success is 62–69% overall and
  44–50% at 7+ targets (vs 87–100% single-target). Failures are
  100% partial coverage on Q-view (mean ~35–47% of targets edited):
  models emit legal patches that stop short of the full target set.
  Multi-op anchored patches degrade with op count, full stop.
- **Q-H2 (the recipe under stress) — the gate FAILS.** On gemini,
  Q-search loses to Q-full 11–0 (p = 0.001, −24.4 pp). On sonnet the
  non-inferiority clause technically holds (−2.2 pp, p = 1.0) but
  only because sonnet's own Q-full collapsed to 48.9% — parity with
  a collapsed baseline is not a pass, and we report it as a fail.
  Search also spirals at fan-out: median 6 find_nodes calls, 34 of
  90 runs above 100k input tokens (max 2.4M) — the single-target
  economics (median 1 call, ~5k tokens) do not survive.
- **The models invert, significantly.** Sonnet does better on the
  focused view than the full tree (11–2 discordant, p = 0.022);
  gemini the opposite (8–0 for the full tree, p = 0.008) and beats
  sonnet at whole-tree fan-out by 31 points (80.0% vs 48.9%, with
  9 of sonnet's 23 Q-full failures touching unsanctioned nodes).
  Neither "show a view" nor "show everything" is model-independent
  advice here — the first such inversion in the series.
- **Q-H3 (failure shape) — CONFIRMED.** Partial coverage dominates
  everywhere; collateral edits are a minority (worst: sonnet Q-full,
  9/23); exploratory split: remove-all is consistently harder than
  set-attribute-all (e.g. gemini Q-full 15/22 vs 21/23).

**Decision rule outcome: the boundary ships.** Fan-out instructions
are an honest weakness of every interface tested — including the
oracle — and of the shipped search recipe in particular. The
practical guidance for applications is **decomposition**: the
application enumerates the target set itself (a deterministic query
like "descendants of C with type T" — exactly what the corpus
generator does) and issues single-target anchored edits, which run
at 87–100% at every size tested (Studies F/H/I). One model call per
target costs more calls but buys back both accuracy and the
view-scale economics. barkup's docs get this boundary note; asking
one prompt to edit N nodes is, on current models, asking for ~N×50%
coverage.

## Addendum (2026-07-09): Study R — fan-out interventions

Pre-registered in [docs/BRIEF-R.md](docs/BRIEF-R.md): can Study P's
worked-example teaching fix Study Q's coverage failures, does a
checklist instruction suffice, and — the audit we owed our own
guidance — does app-side decomposition actually survive per-edit
compounding across 2–32 targets? Four prompt-intervention arms (the
example and the checklist, each on Q's two context bases) plus the
decomposition pipeline executed literally. 450 cells, zero errors,
every record independently re-graded (0 mismatches), zero invariant
violations; ≈ $20; tables in `results/analysis-studyr.txt`.

| Success (45 fan-out tasks) | sonnet-4.5 | gemini-3.5-flash |
|---|---|---|
| Best Study Q arm | 31/45 (view) | 36/45 (full) |
| R-exV / R-exF (worked example) | 34/45 · 20/45 | 28/45 · 33/45 |
| R-ckV / R-ckF (checklist) | 35/45 · 30/45 | 25/45 · 34/45 |
| **R-decomp (app enumerates, single edits)** | **45/45** | **45/45** |

- **R-H1 (teaching transfers to coverage) — essentially REFUTED.**
  No example arm significantly beat its base (best: sonnet R-exV
  4–1, p = 0.375), and no prompt intervention passed the rescue
  gate on gemini (its view arms stay significantly below Q-full).
  One worked example taught placement in Study P; it does not teach
  exhaustiveness here. Failures remain partial-coverage-dominated
  in every prompt arm.
- **R-H2 (demonstration vs instruction) — mixed, one real effect.**
  The checklist on the full tree is the only intervention that
  significantly beat its base (sonnet: 9–1, p = 0.021,
  48.9% → 66.7%) — for sonnet the full-tree failure was partly a
  stopping rule. Still short of its Q-view baseline, and the
  Q model inversion persisted through every prompt arm.
- **R-H3 (the decomposition audit) — the advice survives, at the
  strongest number in the series.** 90/90 tasks, both models,
  including every 7+-target task; 674 subtasks, **zero failures**
  (per-edit 100%, so compounding never bites at these lengths).
  And it is CHEAPER than the alternatives: median ~8k input per
  task vs ~40–48k for any full-tree arm, and mean ~10k per solved
  task vs Q-search's 51–102k. Decomposition dominates on accuracy,
  cost, and model-independence simultaneously.

**Decision rule outcome: decomposition is the documented fan-out
guidance, now measured rather than inferred.** The published claim
("the 87–100% case") understated it: on fan-out's simple subtasks
(set-attribute / remove on a named id with a focused view), per-edit
reliability is 100% at n = 674 and the pipeline is a third the cost
of showing the whole tree once. Prompt interventions are not the
answer: fan-out coverage is not teachable with one example and only
partially instructable, and nothing model-independent emerged. The
practical rule stands as shipped, with better numbers: enumerate
targets deterministically in the application, issue one
single-target anchored edit per node.

## Addendum (2026-07-10): Study S — long sessions

Pre-registered in [docs/BRIEF-S.md](docs/BRIEF-S.md): the two
surviving session recipes — **S-view** (K-view verbatim: full
history plus a fresh minimal view every turn) and **S-system**
(P-system verbatim: no history, two worked examples in the system
prompt) — run through **36-edit sessions**, three times the horizon
every prior session study used. New corpus
(`corpus/sessions-long.json`, seed 20260712, 10 sessions at
~150/~300 nodes, 114 reference-back steps), same grading as K/M/O/P.
1,440 step records, zero blocked steps, zero mechanical ceilings,
zero cache-audit invariant violations; ≈ $18; tables in
`results/analysis-studys.txt`.

| Per-step success (360 steps/cell) | sonnet-4.5 | gemini-3.5-flash |
|---|---|---|
| S-view (history + per-turn view) | 360/360 | 359/360 |
| S-system (stateless + worked examples) | 357/360 | 356/360 |
| S-system, steps 25–36 only | 118/120 | 119/120 |

- **S-H1 (the stateless recipe holds) — GATE PASSES, both models.**
  No late-third collapse (S-system last third 98.3% / 99.2% vs
  first third 99.2% / 100%), McNemar parity with S-view (p = 0.250
  / 0.375), end-state within the pre-registered margin (sonnet
  8/10 vs 10/10; gemini 9/10 vs 9/10). Distance-from-example does
  not decay: step 36 is taught by the same two canned examples as
  step 1.
- **S-H2 (cost divergence) — confirmed, larger than predicted.**
  S-view's median per-step input grows linearly (1.25k at step 1 →
  ~23.6k at step 36) while S-system stays flat (~2.1k at every
  step). Per session that is 449k vs 81k input tokens on sonnet
  (5.6×; gemini 5.4×) against a predicted ≥ 3×.
- **S-H3 (does history itself crack?) — no.** S-view is
  descriptively perfect-to-near-perfect through step 36 with no
  late-session drift and no context ceilings (23.6k at step 36 is
  nowhere near a limit; Study K's ceiling was a rewrite-arm
  artifact). Both recipes hold; the difference at this horizon is
  purely cost.
- Honest detail on the end-state row: per-step grading judges each
  step against the model's own pre-step state, and a failed step
  leaves the tree unchanged — so sonnet's two S-system end-state
  misses are exactly its failed steps' edits missing from the final
  tree, not accumulated corruption. All 7 S-system step failures
  across both models are placement-class (insert/move), the same
  class Studies M/O/P mapped.

**Decision rule outcome: the interpretation table's first row —
both recipes hold, stateless wins on cost and becomes the default
long-session guidance.** The worked-examples recipe is now measured
to 36 edits at flat ~2.1k input per step with no reliability
penalty; keep-history remains a valid (marginally more accurate on
sonnet's end states) alternative at 5 to 6 times the input cost.
barkup's session docs gain the horizon statement.

## Addendum (2026-07-10): Study T — conversation-carried context

Pre-registered in [docs/BRIEF-T.md](docs/BRIEF-T.md): every prior
session study used **self-contained** instructions, so the stateless
findings were scoped to that class. Study T builds sessions where
four steps per session depend on facts that live only in earlier
*conversation* — a declared codename a later rename must use, and a
standing rule ("every new text atom gets textStyle X") later inserts
must apply without their instructions restating it. Corpus
`corpus/sessions-callback.json` (seed 20260713, 20 sessions × 12
steps, 40 fact + 40 rule callback steps, no-leakage validated and
unit-tested: the required value appears in no pre-step tree and no
callback instruction). Three arms: **T-history** (K-view verbatim),
**T-system** (P-system verbatim), **T-notes** (T-system plus an
app-maintained session-notes block, the registered memo format).
1,440 step records, zero blocked; ≈ $9; tables in
`results/analysis-studyt.txt`.

| Callback steps (80/model) | sonnet-4.5 | gemini-3.5-flash |
|---|---|---|
| T-history (full history) | 80/80 | 80/80 |
| T-system (stateless + examples) | **0/80** | **0/80** |
| T-notes (stateless + examples + memo) | 80/80 | 80/80 |

- **T-H1 (the boundary is real) — CONFIRMED, maximally.** The
  stateless recipe fails **every** callback step on both models
  (McNemar 80–0, p < 1e-20) while scoring 160/160 on the ordinary
  self-contained steps of the very same sessions. The dissociation
  is total: statelessness loses nothing on execution and everything
  on conversation-carried state, exactly as constructed.
- **T-H2 (the memo rescue) — GATE PASSES, both models.** T-notes
  recovers 80/80 callbacks on both models, ties T-history on every
  paired comparison (callbacks p = 1.0; all steps p = 0.5/1.0, the
  only discordant steps favoring notes), and its end-states beat
  history's (19/20 vs 17/20 sonnet; 20/20 vs 19/20 gemini).
- **T-H3 (cost) — the memo is nearly free.** T-notes costs 1.02×
  T-system (~27k vs ~26.5k input/session — the note block is a few
  hundred tokens); keep-history costs 2.1× either.
- Secondary by kind: no split — facts and rules both go 0/40
  stateless and 40/40 with history or notes, on both models.

Protocol notes, disclosed: one sonnet T-system session crashed
before recording because the model returned an empty reply and the
API rejects empty assistant text blocks in the correction loop; the
failure reproduced (twice rule), the harness now stands in an
`(empty reply)` marker so the round grades as invalid (fff5692), and
the session was then run once and recorded normally. Cache audit
re-run: subset invariant holds across 55,822 calls.

**Decision rule outcome: the interpretation table's first row —
history's residual value is a memo's worth of state, and "a memo,
not a transcript" becomes the session guidance.** The stateless
worked-examples recipe stands for self-contained requests (P/S);
when requests can reference earlier conversation, the application
records declared facts and standing rules as a plain notes block and
appends it to each step. That memo restores history-parity at
essentially stateless cost, and — measured here — slightly better
end-state integrity than the transcript itself. barkup's session
docs replace the Study T scope note with this measured answer.

## Addendum (2026-07-10): Study U — document-carried dependencies

Pre-registered in [docs/BRIEF-U.md](docs/BRIEF-U.md): Study T's
document-side mirror. Focused views assume the instruction carries
every value an edit needs; a dependent edit ("set A's content to the
same value as B's", "rename A to B's name") requires **reading a
second node** the target-only view hides by construction. New corpus
`corpus/dependent.json` (seed 20260714, 45 tasks over the
300–1000-node trees, 24 value-copy + 21 structure-read), with the
strictest no-leakage validation in the series: the needed value is
verified absent from the instruction AND absent from the rendered
target-only view AND present in the rendered both-nodes view. Four
arms, all registered constructions: **U-full** (whole tree),
**U-view1** (target-only minimal view), **U-view2** (target + source
in focus), **U-search** (the 0.4 skeleton + `find_nodes` recipe).
360 cells, zero errors; ≈ $12; tables in
`results/analysis-studyu.txt`.

| Success (45 tasks) | sonnet-4.5 | gemini-3.5-flash |
|---|---|---|
| U-full (whole tree) | 42/45 | 45/45 |
| U-view1 (target-only view) | **0/45** | **0/45** |
| U-view2 (both nodes in view) | **45/45** | **45/45** |
| U-search (find_nodes recipe) | 38/45 | 37/45 |

- **U-H1 (the blind spot) — confirmed, with the worst possible
  anatomy.** The target-only view fails all 90 cells across both
  models — and **every single failure is a valid patch with an
  invented value**. Neither model ever refused, asked, or produced
  an invalid artifact: 90/90 failures are silent plausible guesses
  that validate and apply. A dependent edit against a too-narrow
  view doesn't error; it quietly writes fiction.
- **U-H2 (the app-side fix) — GATE PASSES, both models.** Putting
  both mentioned nodes in the focus ids scores a perfect 45/45 on
  both models (McNemar vs U-full p = 0.25 / 1.0) — descriptively
  *better* than the whole tree (sonnet's U-full dropped 3
  structure-reads at ~1000 nodes) at ~25× less input (median 1.7–1.8k
  tokens vs 40–45k).
- **U-H3 (the model-side fix) — partial, short of parity.** The
  search recipe self-serves reads at 84%/82% overall — a real
  capability, median 2–3 calls — but significantly below U-full on
  gemini (8–0, p = 0.008) and weakest exactly on value-copies
  (75% both models). Search grounds *targets* at oracle level
  (Study N); it reads *values* at ~75–95%.
- Secondary by kind: structure-reads are search's strength
  (90–95%) and the full tree's occasional weakness; value-copies
  are trivial with the right view and search's weak spot.

**Decision rule outcome: the interpretation table's second row —
the read belongs app-side.** The tier-1 focused-view guidance
sharpens to: **focus ids = every node the request mentions, not
just the target.** That one-line fix is perfect at benchmark sizes
and 25× cheaper than the whole tree. The search recipe keeps a
boundary note: it retrieves where to edit at oracle level, but
copying values through search alone leaves a measurable gap — and
the silent-guess anatomy means a missing read fails *invisibly*, so
the view scope is not an optimization but a correctness contract.

## Addendum (2026-07-11): Study W — who writes the memo?

Pre-registered in [docs/BRIEF-W.md](docs/BRIEF-W.md): Studies T and V
validated the session-notes memo with **oracle extraction**; Replicator
v3.183.0 ships **agent-maintained** extraction (an
`update_session_notes` tool, a prompt rule, and a last-32-message
history window). Study W tests those shipped artifacts VERBATIM
(character-identity-tested ports) with the series' nastiest remaining
hypothesis: within the window, callbacks succeed via history whether
or not the agent records, so a lazy agent's empty memo is invisible —
until truncation. Corpus: 12 × 36-step callback sessions crossing the
window (seed 20260717), declarations early, a mid-session retraction,
callbacks placed within-window and post-truncation (classified by
RECORDED membership, since agent tool calls shift truncation), and a
scheduled cleanup step so codenames never leak into pre-step trees.
Three arms (oracle ceiling / stateless agent memo / the shipped
history + agent memo config) × three models — including the series'
first data on `claude-opus-4.8`, the tier Replicator runs.
3,888 step records, zero errored sessions, ≈ $65; tables in
`results/analysis-studyw.txt`.

| Callback cells (72/arm-model) | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| W-oracle (harness memo) | 71/72 | 72/72 | 72/72 |
| W-agent (agent memo, stateless) | 71/72 | 72/72 | 71/72 |
| W-agent-history, post-truncation | 31/36 | 35/36 | **36/36** |

- **W-H1 (pure extraction) — GATE PASSES, all three models.** The
  agent-maintained memo ties the oracle exactly (sonnet's single miss
  is the same cell in both arms; every McNemar p ≥ 1.0). Memo
  fidelity is near-perfect and deterministic: recall 36/36 per model
  (one Opus session dropped one note, the only drop event in 72 agent
  sessions), retraction handling 12/12 everywhere, **zero noise
  notes**, and ~4 tool calls per session — models call the tool at
  the four declarative moments and essentially nowhere else.
- **W-H2 (redundancy breeds laziness) — REFUTED; GATE PASSES.** In
  the shipped configuration the agents keep writing the memo even
  though history makes it redundant (4.0–4.1 tool calls/session,
  identical cadence to the stateless arm, recall 36/36), and
  post-truncation callbacks hold (gemini 35/36, opus 36/36, sonnet
  31/36 with McNemar vs oracle p = 0.22). Honest descriptive note:
  sonnet shows a mild post-truncation dip (5 discordant losses at
  n = 36, not significant, failures NOT explained by memo gaps — its
  memo was complete in every failing cell), worth re-checking if
  sonnet becomes a shipped tier.
- **W-H3 (tier calibration) — Opus is the cleanest of the three.**
  First Opus data in the series: perfect callbacks in the shipped
  configuration (72/72 including all post-truncation cells), best
  ordinary-step rate, one memo-drop blemish in the stateless arm.
  The recipe advice transfers to the tier it ships on.
- **Cost note:** the stateless agent-memo arm ties everything at
  ~⅓ the shipped config's input (137k vs 371k per session, sonnet;
  152k vs 421k, opus) — with the caveat that its bench prompts carry
  the two worked examples, not Replicator's production prompts.

**Decision rule outcome: the interpretation table's first row —
v3.183.0 is de-risked end to end.** Agent extraction is faithful,
the retraction path works, the window's redundancy does not suppress
recording, and the 32-message protection is real protection, not
theater. The oracle→agent gap that BRIEF-T disclosed is now closed
with measurement. Protocol note: the history ledger is built from
per-step messages (the Study G-safe construction) with a runtime
assertion that tool messages are present; it never fired.

## Addendum (2026-07-12): Study X — edit-anaphora

Pre-registered in [docs/BRIEF-X.md](docs/BRIEF-X.md): the last
structurally unmeasured request class — follow-ups that point at the
previous edit ("also set that same node's...", "apply the same change
to X", "actually, undo that"). Corpus
`corpus/sessions-anaphora.json` (seed 20260718, 12 sessions × 12
steps, scheduled predecessor→anaphora pairs at distance 1, 48
anaphora cells per arm-model, no-leakage validated). Anaphora steps
get a ROOT SKELETON view — an oracle-focused view would leak the
answer — so target, key, and value must come from the carrier under
test. Four carriers × three models (sonnet, gemini, opus-4.8).
1,728 step records; ≈ $30 plus a mid-run gateway credit outage
(sessions error unrecorded; resumed cleanly, disclosed); tables in
`results/analysis-studyx.txt`.

| Anaphora cells (48/arm-model) | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| X-history (full history) | 48/48 | 48/48 | 46/48 |
| X-window2 (last 2 exchanges) | 45/48 | 41/48 | 43/48 |
| X-lastedit (app-side note) | 43/48 | 47/48 | **48/48** |
| X-stateless (no carrier) | **0/48** | **0/48** | **0/48** |

- **X-H1 (structural failure) — confirmed at the maximum, and
  silent.** No carrier, no anaphora: 0/144 across all three models —
  and **every one of the 144 failures was a valid, applied, wrong
  patch.** Not one refusal or question. The strongest silent-guess
  result in the series.
- **X-H2 (the app-side carrier) — GATE PASSES on all three models,
  and on the production tier the note BEATS history.** The one-line
  last-edit note (`set "{key}" from {old} to {new} on {nodeRef}`)
  ties full history per model (gemini 1–0 p = 1.0; sonnet 5–0
  p = 0.0625, marginal and disclosed; opus 0–0 with the note at a
  perfect 48/48 while opus's own full-history arm dropped two undo
  cells to 46/48). At roughly HALF history's cost (≈28k vs ≈53–58k
  input/session). The from/to format carries undo completely —
  every undo cell under the note passed on every model.
- **X-H3 (window-2) — inadequate, again, and now we know for what.**
  Study M called window-2 inadequate for placements; here it holds
  amend and undo but leaks on REPEAT (sonnet 9/12, gemini 5/12,
  opus 8/12, the latter significant at p = 0.016 on gemini).
- **The per-kind split is the practical fine print.** Amend and undo
  are carried perfectly by the note on all models. **Repeat**
  ("apply the same change to X") is the strain point for compressed
  carriers on sonnet (7/12 with the note) while gemini and opus
  handle it — one more instance of the series' carrier-advice-is-
  not-model-independent lesson, disclosed rather than averaged away.

**Decision rule outcome: the interpretation table's first row —
discourse needs an echo, not a transcript.** The automatic last-edit
note joins the memo in the session recipe: the application always
knows what it just applied, so this carrier costs zero agent
judgment and half the transcript's tokens, and on the tier that
ships it is the single best-measured carrier. The full stateless
stack is now: fresh view per turn + two worked examples + the
session-notes memo + the last-edit echo.

## Addendum (2026-07-12): Study Y — does the memo survive how people actually talk?

Pre-registered in [docs/BRIEF-Y.md](docs/BRIEF-Y.md): every
declaration in Studies T/V/W was announced formulaically; Study Y
isolates PHRASING with twin sessions — identical trees, edits,
schedules, chatter, and session ids, differing only in declaration
rider text (formulaic control vs registered casual pools:
"oh, before I forget…", "scratch the old codename…", "house style
note…"). Four chatter riders per session — conversational lines that
declare nothing — give the noise metric real bait for the first
time. Corpus `corpus/sessions-casual.json` (seed 20260719, 12 twin
pairs × 12 steps, twin identity unit-validated). Three arms
(formulaic / casual / casual under the shipped history-window
config) × three models. 1,296 step records; ≈ $22; tables in
`results/analysis-studyy.txt`.

| Callback cells (48/arm-model) | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| Y-formulaic (control, = W replication) | 48/48 | 48/48 | 48/48 |
| Y-casual | 48/48 | 48/48 | 48/48 |
| Y-casual-history (shipped config) | 47/48 | 48/48 | 48/48 |

- **Y-H1 (casual recognition) — GATE PASSES, perfectly, on all
  three models.** Zero discordant pairs anywhere (every McNemar
  0–0, p = 1.0): casually-phrased declarations, buried rules, and
  conversational retractions ("…X1 is dead") were extracted exactly
  as well as announced ones. Recall 36/36 and retraction 12/12 in
  both stateless arms on every model.
- **Y-H2 (chatter resistance) — GATE PASSES at zero.** 432 chatter
  riders of bait across the study produced **not one false memo
  note** (noise 0.00 in all nine arm-model cells). The models'
  record-only-declarations discrimination is perfect at this task
  shape.
- **The shipped-config arm shows a whisper of W's redundancy
  effect, disclosed:** recall dipped to 35/36–34/36 with cadence
  3.8–3.9 calls/session (vs a flat 4.0 stateless) — within-window
  history covered every such case except one sonnet rule cell, and
  nothing post-truncation exists at 12 steps to expose it.
  Consistent with W's finding that the memo is written faithfully;
  the redundant-context cadence softens at the margin.

**Decision rule outcome: the interpretation table's first row — the
memo survives human speech, and the extraction rule is ecologically
valid as shipped.** Recognition needs no announcement syntax,
retractions work when phrased like people phrase them, and chatter
does not pollute the memo. The formulaic arm doubles as a clean
replication of Study W's agent arm under added chatter.

## Addendum (2026-07-12): Study Z — does standing context work? (the brand pack, measured)

Pre-registered in [docs/BRIEF-Z.md](docs/BRIEF-Z.md): production doc
editors ship a standing context block (company, clients, styleguide)
with every request, now assembled with the v3.185.0 cached-system
layout (`buildCachedSystem`, ported verbatim and identity-tested).
Study Z measures whether the model actually USES that block: 12
seeded org packs (~3.3k tokens each: About → Solutions → four clients
with same-schema near-miss distractors → a 12-rule styleguide with
governing rules planted at head/middle/tail) × 3 tasks (fact-copy /
rule-following / combined) × 3 arms (Z-full = whole pack, Z-slice =
oracle-relevant excerpt, Z-memo = whole pack + governing rules
distilled into the shipped session-notes block) × 3 models. 324 cells
plus a 10-cell plain-system neutrality spot-check; ≈ $2; tables in
`results/analysis-study-z.txt`.

| Registered grading (36/arm-model) | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| Z-full | 26/36 | 27/36 | 30/36 |
| Z-slice | 27/36 | 35/36 | 24/36 |
| Z-memo | 35/36 | 32/36 | 28/36 |

- **The unconfounded core: standing context simply works.** Fact and
  rule tasks are **216/216 per arm-triple — 100% on every model in
  every arm**: exact client facts copied from a 3.3k-token pack with
  three same-schema distractors sitting next to the target, and
  styleguide rules applied unprompted regardless of position (head /
  middle / tail all 12/12 — no burial effect at this pack size).
  **Zero contamination events in all 324 cells**: not one distractor
  email, phone, product, or city ever leaked into an output.
- **Every combined-task "failure" is a rule-conflict reading, not a
  compliance failure.** The combined task pits R-contact ("contact
  lines always follow the form {email} | {city}") against an
  instruction clause asking to mention the product (governed by
  R-tm's ™ mark). All 108 combined outputs per model split cleanly
  into two readings — obey both (append product™ after the form) or
  obey the form rule strictly (exact `email | city`, no mention) —
  with **zero true violations and zero unmarked product mentions**.
  Under the R-tm rule's own conditional semantics ("on every
  mention" — no mention, no obligation), **every arm on every model
  regrades to 36/36**. Disclosed post-hoc reanalysis; the registered
  grading above stands as primary.
- **Z-H1 (gate): passes in substance, confounded in letter.** The
  registered McNemar verdicts disagree in *opposite directions* by
  model (sonnet ties p = 1.0; gemini slice-favoring p = 0.0078; opus
  full-favoring p = 0.0313) — every discordant pair is the combined
  cell's interpretation split, and on the unconfounded fact+rule
  subset Z-full ties Z-slice at 24/24 everywhere with zero
  contamination. The interpretation table's first row obtains:
  ship-everything works at these pack sizes.
- **Z-H2: the memo doesn't change competence, it changes which
  reading wins.** Distilling the governing rules into the dynamic
  session-notes tail moved sonnet from 2/12 to 11/12 on combined
  cells (p = 0.0039) — not by fixing errors but by pushing it to
  satisfy both obligations rather than the strict form. Opus barely
  moved (and its slice arm went fully strict: 0/12 registered,
  12/12 regraded). Restating a rule near the request makes models
  treat it as something to actively satisfy; burying it makes strong
  models treat it as a constraint to conservatively honor.
- **Interpretation strictness scales with capability, descriptively:**
  strict-form readings across all arms: opus 26/36 > sonnet 20/36 >
  gemini 14/36. The strongest model is the most literal about the
  styleguide — the failure mode of a conflicted spec is not chaos
  but *disciplined obedience to the rule you forgot you wrote*.

**Caching appendix (no gate).** The shipped layout produced real
mid-prompt cache hits under the bench's pack-grouped traffic:
Anthropic arms read 64–68% of input from cache (sonnet Z-full
−24.6% effective input cost vs uncached, Z-memo −42.5%; opus −24.9%
/ −43.0% — memo arms are pure reads because Z-full already wrote the
identical static block). Two instructive negatives, disclosed:
Z-slice never got a read on either Anthropic model (the per-task
slice block defeats prefix reuse — opus paid +10.8% in pure cache
writes; a static block must actually be static across requests), and
gemini reported zero cache tokens throughout (`cacheControl` is
Anthropic-specific; Gemini's implicit caching reported nothing at
these sizes). The neutrality spot-check (10 sonnet Z-full cells,
plain string system) matched 9/10 outputs exactly; the single
divergence is the conflicted combined cell flipping readings —
consistent with interpretation instability, not a caching artifact.

**Decision rule outcome: the interpretation table's first row.**
Standing context works as shipped at ~3.3k tokens: facts get copied
exactly, rules get applied unprompted, distractors never bleed. The
production guidance the combined cells add: **don't ship rules that
can collide with instructions — and when two rules can both apply,
expect the strongest models to pick the most literal reading.**
Slice-by-client buys nothing on accuracy AND forfeits the cache (the
slice arm was the only one that ever paid a caching penalty); the
memo pattern (V/W) extends here as the lever that steers rule
*interpretation*, not just recall.

Protocol notes, disclosed: (1) governing-rule bands hold three slots
(head 1–3 / middle 6–8 / tail 10–12) rather than the brief's two,
because one pack text serves all three tasks and the rule+combined
governing unions share R-tm (committed before any scored run, e2c9366);
(2) CTA rule tasks carry a single governing rule; (3) fact-task Z-memo
cells are byte-identical to Z-full (no rules to distill); (4) the
conditional-tm regrade is post-hoc, motivated by inspecting failures,
and never replaces the registered numbers; (5) spend came in far under
the brief's estimate ($2 vs $40–70 — single-turn xs cells).

**Correction (2026-07-13, Study AA):** this addendum's
capability-strictness claim ("strict readings scale WITH capability")
did not survive its pre-registered confirmation study. Study AA's
base arm measured opus as the LEAST literal model (0/24 vs sonnet
10/24, gemini 7/24), significant in the opposite direction. The Z
aggregate (26/36) leaned on the Z-slice arm, where opus went fully
strict; on Z's shipped-shape arm alone opus was already the least
strict (6/12). Cite Study AA, not this sentence, for how strictness
distributes across models.

## Addendum (2026-07-13): Study AA — conflict resolution (we refute our own headline)

Pre-registered in [docs/BRIEF-AA.md](docs/BRIEF-AA.md): Study Z's
spec-conflict findings re-measured with pre-registered intent — three
conflict kinds (rule-vs-instruction, an explicit user countermand of
a rule, rule-vs-rule), four arms (base / a registered priority
meta-rule / soft "generally prefer" phrasing / rules restated in the
memo tail), 12 packs × 3 kinds × 4 arms × 3 models = 432 cells under
the Study Z protocol. ≈ $3.24; tables in
`results/analysis-study-aa.txt`.

| AA-base literal readings (of 24) | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| rule-vs-instruction `form` + countermand `enforced` | 10 | 7 | **0** |

- **AA-H1 (capability strictness) — REFUTED, and inverted.** The
  confirmation gate predicted opus most literal; opus measured LEAST
  literal — zero strict readings in 24 base cells, while sonnet took
  10 and gemini 7 (paired McNemar opus vs gemini p = 0.0156, in the
  direction OPPOSITE the registered prediction). Study Z's claim is
  corrected above. The residual truth: strictness varies BY MODEL and
  is real (sonnet took the strict form reading 10/12 on the Z
  template), but it is not a capability gradient, and it is
  composition-sensitive — the identical C-ri template that split opus
  6/6 under Z's three-rule packs reads both-obligations 12/12 under
  AA's four-rule packs. Which reading a model picks is not a stable
  property you can bank; the conflict itself is the hazard.
- **AA-H2 (priority meta-rule) — GATE FAILS.** One registered
  sentence under the styleguide heading ("…the user's request takes
  precedence") moved things in the right direction and never
  backfired, but reached significance on zero of three models
  (sonnet +2, p = 0.50; gemini +4, p = 0.125; opus at ceiling).
  Conflicts must be resolved in authoring, not patched by meta-rule.
- **AA-H3 (soft phrasing, descriptive) — the intervention that
  actually moved strictness.** Rewriting "always" as "we generally
  prefer" collapsed literal readings: sonnet 10/24 → 2/24, gemini
  7/24 → 0/24. The one-word audit ("always"/"exactly" → "generally
  prefer") outperformed the meta-rule everywhere it had room to act.
- **AA-H4 (memo steering) — REPLICATES Z exactly, and reveals the
  memo's edge.** Restating rules in the memo tail moved sonnet's
  rule-vs-instruction cells from 2/12 to 11/12 satisfy-both
  (p = 0.0039, Z's numbers to the digit; gemini 5/12 → 12/12,
  p = 0.0156). But on the countermand cells the same lever OVERPOWERS
  THE USER: with R-tm restated in the memo, opus stamped ™ on a
  product the user explicitly asked to see "written plain, with no
  trademark symbol" in 12 of 12 cells (sonnet 9/12; gemini resisted,
  0/12). Every base-arm cell honored the countermand 36/36 — the
  memo, not the pack, causes the trampling. The memo is an
  interpretation-steering instrument with no sense of precedence:
  never inject standing rules into the dynamic tail of a request that
  might be overriding them.
- **C-rr (rule vs rule, descriptive): specificity wins, not
  position.** With two irreconcilable tagline rules, the concrete
  rule (end with the fixed phrase) beat the generic one (end with the
  city) in 100/144 cells, and styleguide listing order did not decide
  it (phrase-first vs city-first distributions near-identical;
  sonnet and gemini picked the phrase regardless of order). Soft
  phrasing loosened the grip (sonnet split 6/6; opus flipped toward
  the city rule 10/12 soft).
- **Safety scan: zero.** 432 more cells, zero Layer-1 failures, zero
  violations, zero contamination — 756 conflict-bearing cells across
  Z and AA without a single rule broken or distractor value leaked.
  Models do not break conflicted specs; they resolve them.

**Decision rule outcome: the interpretation table's fourth row —
publish the correction prominently (done, above).** The guidance that
survives: (1) audit standing rules for "always"/"exactly" wording and
prefer "generally prefer" — the cheapest measured intervention that
works; (2) do not rely on a priority meta-rule to fix conflicts;
(3) the memo remains the interpretation lever AND is now a measured
footgun — never restate a rule in the memo when the request may be
countermanding it; (4) strictness ordering across models is not
stable — test the tier you ship, on the pack you ship.

Caching appendix: the shipped layout again read 68–70% of Anthropic
input from cache (sonnet 355k/524k, opus 562k/808k read); gemini
reported zero cache tokens, consistent with Z.

## Addendum (2026-07-13): Study AB — the shipped precedence clause, tested

Pre-registered in [docs/BRIEF-AB.md](docs/BRIEF-AB.md): Study AA's
memo footgun (rules restated in the memo tail trample explicit user
countermands — opus 12/12) was mitigated the same day by Replicator
v3.188.1: a PRECEDENCE sentence inside the memo block header,
adjacent to the notes it governs. The same intervention CLASS as
AA-H2's failed styleguide meta-rule — shipped as flagged, untested
insurance. Study AB tested it verbatim (`formatSessionNotesBlockV2`,
character-identity checked): the AA conflict corpus's 12 countermand
+ 12 rule-vs-instruction tasks × AB-memo (the v3.183.0 formatter, a
contemporaneous injury replication) vs AB-clause (v3.188.1) × 3
models = 144 cells. ≈ $1.13; tables in
`results/analysis-study-ab.txt`.

| Countermand honored (of 12) | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| AB-memo (v3.183.0 block) | 3 | 12 | **0** |
| AB-clause (v3.188.1 block) | **11** | 12 | **12** |

- **AB-H1 (protection) — GATE PASSES, completely.** On the gate
  model the clause is a clean sweep: opus went from honoring the
  countermand 0/12 under the old block to **12/12** under the
  shipped clause (12–0 discordant, p = 0.0005). Sonnet 3/12 → 11/12
  (p = 0.0078). Gemini was already at floor and stayed there.
- **AB-H2 (steering preserved) — CO-GATE PASSES at ceiling.** The
  memo's measured benefit is untouched: satisfy-both stayed 12/12 on
  every model in both arms. The clause buys protection at zero
  steering cost.
- **The injury replicated exactly before being cured:** AB-memo
  reproduced Study AA's trampling to the digit (9/12, 0/12, 12/12
  enforced — identical to AA-memo), so the comparison is
  contemporaneous and the cure is not a model-drift artifact.
- **The placement lesson, sharpened:** AA-H2's priority meta-rule in
  the styleguide (2,000 tokens from the action) moved nothing
  significantly; the SAME class of sentence inside the memo block —
  at the point of injury, adjacent to the notes it governs — is a
  total fix. Meta-rules don't fail because models ignore meta-rules;
  they fail when they sit far from the decision they're meant to
  govern.
- **Safety scan: zero** — 144 more cells, no violations, no
  contamination, no Layer-1 failures (900 conflict-bearing cells
  across Z/AA/AB, still zero).

**Decision rule outcome: the interpretation table's first row — the
clause is validated protection.** The v3.188.1 memo block ships as
measured, upgraded from "flagged insurance" to "proven"; Study AA's
"never restate a rule in the memo when the request may be overriding
it" guidance is superseded by "use the v3.188.1 block, whose
precedence clause makes rule restatement countermand-safe on every
model tested." Caching appendix: 66–68% of Anthropic input read from
cache, consistent with Z/AA.

## Addendum (2026-07-13): Study AC — ask versus guess (silence was never inability)

Pre-registered in [docs/BRIEF-AC.md](docs/BRIEF-AC.md): across
twenty-eight studies the recurring villain was silence — 90/90 silent
inventions (U), 144/144 silent guesses (X), 120/120 oblivious
polishes (V), zero clarifying questions anywhere — but no study ever
OFFERED an escape hatch. Study AC offered two, on Study U's
unit-validated silent-failure construction (the needed value provably
absent from the target-only view, provably present in the both-nodes
twin): a one-sentence NEED-INFO prompt rule, and an `ask_user` tool.
45 tasks × 2 views × 3 arms × 3 models = 810 cells; zero errors;
≈ $6.58; tables in `results/analysis-study-ac.txt`.

| Unsolvable cells (45/model) | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| AC-base: silent wrong patches | 45/45 | 45/45 | 45/45 |
| AC-rule: asked | **45/45** | **45/45** | **45/45** |
| AC-tool: asked | **45/45** | **45/45** | **45/45** |

- **AC-H1 (the hatch works) — GATE PASSES at ceiling, both
  mechanisms, all models.** With no hatch, every model guessed
  silently on every unsolvable cell — a perfect contemporaneous
  replication of Study U. With either hatch, every model asked on
  every unsolvable cell: 270/270 asks against the base arm's 0/270,
  not one residual guess anywhere. The prose rule and the tool were
  indistinguishable.
- **AC-H2 (the hatch is affordable) — CO-GATE PASSES at zero tax.**
  On the solvable twins: zero false asks in 270 hatch cells, solve
  rate 45/45 everywhere, identical to base. The hatch costs nothing
  measured.
- **The asks are surgical.** Every one of the 270 asks named the
  exact missing node (registered heuristic: 270/270) — "What is the
  content attribute value of the text-atom with id n219?" The models
  always knew precisely what they couldn't see. Which reframes five
  studies of silent-failure anatomy: the guessing was never
  inability to notice the gap. The models noticed, and produced a
  plausible value anyway, because the protocol demanded a patch and
  nothing said asking was allowed.
- **Ecological caveat, stated loudly:** the hatch was tested on its
  home turf. The registered rule text ("requires a value or a node
  that is not visible in the view") describes Study U's construction
  almost exactly, and the unsolvable cells are UNAMBIGUOUSLY
  unsolvable — a validated hard boundary, not fuzzy real-world
  ambiguity. This study shows the capability exists and costs
  nothing at the boundary; it does not show the hatch calibrates
  well on requests that are merely vague. That is the follow-up
  (and Study X's anaphora cells, deferred by the brief, are the
  next-hardest construction to point it at).

**Decision rule outcome: the interpretation table's first row —
silence is a protocol defect, not a model property.** The practical
guidance: give document-editing agents an explicit ask path (either
mechanism; one sentence suffices) AND keep the app-side context
contracts (U's focus-ids rule, X's echo). The hatch is the seatbelt,
not the substitute: it converts the failure mode from silent fiction
to a visible question, but the contracts are what make the question
unnecessary. Caching note: the AC runner uses the plain string-system
protocol of Study U (no cache layout), so Anthropic cells are
cache-free by construction, consistent with the audit.

## Addendum (2026-07-15): Study AD — the Opus confirmation (the core stack on the shipped tier)

Pre-registered in [docs/BRIEF-AD.md](docs/BRIEF-AD.md): the core
editing stack (Studies F–U) was measured on sonnet-4.5 and
gemini-3.5-flash, but the tier that ships on the downstream
template-chat surface is claude-opus-4.8, whose data began at Study W
(memo/echo/standing-context/ask mechanisms only). Study Q's model
inversion and Study AA's composition sensitivity forbid assuming
tier transfer, so Study AD re-ran the core recipes on opus —
corpora, conditions, prompts, graders, and runners reused verbatim,
gates anchored to the weakest previously passing tier. 1,160 cells,
zero harness errors, ≈ $44.60 (within the registered $40–60);
tables in `results/analysis-study-ad.txt`.

| Arm (anchor) | opus-4.8 | Gate |
|---|---|---|
| AD-F: dialect, main corpus (prior band 182–188/200) | **194/200** | ≥182 — **PASS** |
| AD-views: FVH / FTH at 300–1000 nodes (band 40–44/45) | **45/45 / 45/45** | ≥40 each — **PASS** |
| AD-search: N-search (sonnet 43, gemini 39) | **43/45** | ≥39 — **PASS** |
| AD-sessions: K-view / P-system steps (95% floor) | **240/240 / 240/240**, end-states 20/20 both | **PASS** |
| AD-F@size: full tree at ~1000 nodes (13/15 band) | 14/15 | descriptive |
| AD-fanout: Q-view / Q-full (prior 62–69%) | 80.0% / 88.9% | descriptive |

- **THE STUDY GATE PASSES (AD-H1–H4): the core stack transfers to
  the shipped tier**, mostly at or above the top of every prior
  band. The dialect's 194/200 is the best condition-F number ever
  measured on the main corpus, and its six misses are not editing
  failures at all: five are reading-family COUNTING questions at
  m/l sizes (off by 1–4) and one is a reference-family phase-1
  miss — the patch channel itself was error-free. The HTML views
  are perfect at every size (90/90; the first perfect view sweep in
  the series), N-search lands exactly on sonnet's oracle bound
  (43/45, median ONE search call, ~5.5k tokens median input), and
  every session arm is flawless.
- **The worked-examples block is NOT load-bearing on opus — and
  remains harmless.** The AD ablation is the finding W's cost
  caveat anticipated: bare stateless sessions (M-stateless, no
  history, no examples) score 240/240 steps and 20/20 end-states,
  indistinguishable from P-system and K-view (all three arms
  perfect; McNemar p = 1.0, zero discordant steps). Sonnet needed
  the examples (M-stateless lost 7–0 to history, 13/20 end-states);
  opus does ordinal inserts and moves correctly with no precedent
  at all, at 12-step horizon, on this corpus. Shipped guidance
  unchanged (the block is ~900 flat tokens of measured insurance
  for every tier below the frontier), but the frontier-tier cost
  floor is now measured: fresh view + nothing else, ~20k
  input/session vs K-view's ~65k.
- **Fan-out stays the honest weakness — at a higher floor, with a
  third composition.** Opus clears the prior 62–69% band by a wide
  margin (Q-full 88.9%, Q-view 80.0%) but still drops to 12/18 on
  7+-target tasks under views, with the failures the same
  partial-coverage anatomy as ever. Directionally opus prefers the
  FULL TREE (view-only 2 vs full-only 6, p = 0.29, n.s.) — gemini's
  direction, not sonnet's, and a third distinct profile for the
  serializer-inversion file. The decomposition fence stands for
  every tier: even the best fan-out number measured leaves one in
  nine bulk edits incomplete.
- **Full-tree patches at ~1000 nodes: 14/15**, above the 13/15
  prior band (median input 89k tokens — the views do it for 2% of
  that, which is why the shipped path uses them).

**Decision rule outcome: the interpretation table's first row.**
Every "measured on sonnet/gemini" caveat attached to the core
recipes (patch dialect, focused views, search-then-patch, session
policies) now closes for the shipped tier, and the downstream
guardrail set is validated end to end on the model that runs it.
Rewrite-at-scale remains deliberately unextended to opus (not a
shipped path; disclosed exclusion), and Q-search's spiral behavior
on opus is unmeasured (excluded by cost fence). Cache audit re-run:
all four AD record files report zero cache reads (plain
string-system protocol, Anthropic caching never enabled) — every
token figure above is cache-free.

## Addendum (2026-07-15): Study AE — hatch calibration and the resume loop (the gate fails, and the failure is a tier split)

Pre-registered in [docs/BRIEF-AE.md](docs/BRIEF-AE.md): Study AC
validated the escape hatch at a provable hard boundary and disclosed
two unmeasured edges — calibration on merely-vague requests (the
over-asking risk, live on three shipped chat surfaces) and the
ask → answer → resume loop (AC ended every cell at the question).
Study AE measured both: a five-level ambiguity ladder (75 tasks,
seed 20260717, every level's defining property unit-validated;
L0/L4 are registered reuses of the U corpus) under the shipped
NEED-INFO sentence frozen verbatim, plus 135 resume cells with a
registered answer template. 720 cells, three models, zero harness
errors, ≈ $6; tables in `results/analysis-study-ae.txt`.

| AE-rule arm | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| L0+L1 false asks (clear requests) | **0/30** | **0/30** | **0/30** |
| L2 discretionary: acted / asked | 15/0 | 15/0 | 13/2 |
| L3 ambiguous referent: asked | 1/15 | 1/15 | **15/15** |
| L4 missing info: asked | 15/15 | 15/15 | 15/15 |
| Resume: resumed-solved | **45/45** | **45/45** | **45/45** |

- **AE-H1 (no interrogation tax) — PASSES at ceiling on all three
  models.** Zero false asks in 90 clear-request cells, solve rates
  identical to the no-hatch control (30/30 everywhere, McNemar
  p = 1.0). The calibration fear that motivated the study is
  refuted on its cheap half: the hatch costs literally nothing on
  requests the model can already handle, including indirect
  references it must resolve itself (L1). L2 agrees: models edit
  "make it punchier" rather than interviewing the user about
  wording (opus asked twice in 15; disclosed, descriptive).
- **AE-H2 (ambiguity detection) — FAILS on sonnet and gemini,
  PASSES at ceiling on opus. The tier split is the finding.** When
  a singular instruction matches exactly two visible nodes, opus
  asks every time and its asks named BOTH candidate ids 15/15
  ("Which of n112 or n191 did you mean?"). Sonnet and gemini ask
  once each in 15 — with the hatch present — and resolve the
  ambiguity unilaterally instead, in two DIFFERENT ways: sonnet
  edits BOTH matches (12/15; the "apply to every match" reading —
  defensible for a plural, wrong for this singular), gemini
  edits ONE (9/15 with the rule, 14/15 base — the true silent
  coin-flip). Mechanism, not blindness, again: the registered
  hatch sentence is scoped to information that is "not visible in
  the view" — an ambiguous referent is entirely visible. Opus
  generalized the rule's intent; the mid tiers applied its letter.
  (The same models that read conflicting SPECS most literally in
  Study AA read this rule most literally too — the literalism
  profile travels.)
- **AE-H3 (hard boundary) — replicates at ceiling**, 45/45 asks on
  the U-construction slices, fourth consecutive replication of
  that construction's numbers.
- **AE-H4 (the loop closes) — PASSES at absolute ceiling: 135/135
  resumed-solved.** Every model asked, integrated the answered
  value from plain conversational text (no view re-attachment, no
  id restated in a view), and produced the exactly-correct patch:
  zero re-asks, zero wrong integrations, zero correction rounds
  needed after the answer. The ask path is not a dead end; it is a
  reliable two-turn solve.

**Decision rule outcome: the interpretation table's H2-fails row,
with a tier annotation the table did not anticipate.** For the
shipped tier (opus), the hatch now covers BOTH failure classes —
absence and ambiguity — and the full ask → answer → patch loop is
measured at ceiling, so the v3.191.0 ask path graduates from
"measured at the boundary" to "measured across the ladder." For
sub-frontier tiers, the shipped sentence does NOT catch referent
ambiguity: silent unilateral resolutions survive (edit-both on
sonnet, coin-flip on gemini), and app-side disambiguation (unique
references, selection grounding, `selectNodes` enumeration) remains
the only defense. An amended hatch sentence covering multiplicity
("if the request matches more than one node, ask which") is the
obvious follow-up — it is NOT shipped guidance until a registered
test passes it, per the AA lesson about prompt clauses that look
obviously right. Cache audit re-run: zero cache reads across all
585 ladder/resume records; token figures are cache-free.

## Addendum (2026-07-16): Study AH — memo saturation (perfect to the cap; at the cap, the goals die)

Pre-registered in [docs/BRIEF-AH.md](docs/BRIEF-AH.md): the
session-notes memo — the series' most load-bearing shipped mechanism
— had only ever been measured at 3–6 notes, while the shipped
implementation caps it at `MAX_SESSION_NOTES = 20` with a
`normalizeSessionNotes` clamp that silently drops the excess. Study
AH measured the memo at scale: recall and unprompted rule
application against a FULL 20-note memo (position-stratified,
needle-validated), full-replace integrity as the list grows, and
the unspecified behavior at the cap edge. 270 cells, three models,
zero harness errors, ≈ $6; tables in
`results/analysis-study-ah.txt`.

| Arm | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| Recall, N=20 (positions first/middle/last) | **15/15** | **15/15** | **15/15** |
| Unprompted rule application, N=20 | **15/15** | **15/15** | **15/15** |
| Full-replace integrity, K=10 and K=19 | **20/20 clean** | **20/20 clean** | **20/20 clean** |
| Cap edge K=20: cells that lost a note | 10/10 | 10/10 | 10/10 |

- **AH-H1/H2/H3 — THE STUDY GATE PASSES at absolute ceiling.**
  Recall from a full memo is perfect at every position (no burial
  anywhere — first, middle, and last notes all 15/15), unprompted
  rule application from a 12-rule memo is perfect with ZERO
  contamination events (the block-scoped rule construction held:
  models applied exactly the one covering rule and never a
  neighbor's needle), and the agent's full-replace is lossless
  wherever the update fits: 60/60 clean updates at K=10 and K=19,
  every old needle preserved, every new declaration recorded, with
  the requested edit landing 90/90 alongside. Below its cap, the
  shipped memo is validated end to end at scale.
- **AH-H4 — at the cap, a note dies every time, and it is ALWAYS a
  goal.** All 30 cap-edge cells (a 21st declaration arriving at a
  full memo) lost exactly one note. The loss modes differ by model
  — opus sent 21 notes all 10 times and let the shipped clamp
  choose the victim; gemini mostly pruned deliberately (8/10);
  sonnet mixed (7 over-cap, 3 prunes) — but the victim never
  varied: **30/30 lost notes were goal notes.** The mechanism is
  structural: the shipped block renders facts → rules → goals, so
  the goals section is the tail of every reconstruction, and both
  the clamp (which keeps the FIRST twenty) and the models' own
  pruning instincts eat from the tail. Study V measured that goals
  are the one thing ONLY the memo can carry; at its cap, the memo
  silently sacrifices exactly that class first. No error, no
  warning, and in the over-cap cases not even a model decision —
  the clamp chose.

**Decision rule outcome: the interpretation table's second row —
the mechanism holds, the cap is a shipped footgun.** The fix is
app-side, not prompt-side: surface the cap to the user, or evict
deterministically with a policy that protects goals (evict the
oldest FACT first, never the goals tail), or both — filed for the
replicator with the measured loss mode. Note-count also becomes a
monitorable budget: the memo is provably safe to 20, so the only
hazard is the edge itself. Cache audit re-run: zero cache reads
across all 270 records; token figures are cache-free.

## Addendum (2026-07-16): Study AI — the multiplicity hatch (a large fix that helps exactly where we don't ship)

Pre-registered in [docs/BRIEF-AI.md](docs/BRIEF-AI.md): Study AE's
obvious fix — one added sentence covering requests that "could
match MORE THAN ONE node" — measured before anyone ships it, per
the twice-learned lesson about obvious clauses (AA's meta-rule,
AF's restate ceremony). Two arms over the full calibration ladder
(the amended sentence vs the shipped sentence re-run
contemporaneously), three models, 450 cells, zero harness errors,
≈ $5; tables in `results/analysis-study-ai.txt`.

| L3 ambiguous referent: asked | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| AI-control (shipped sentence) | 3/15 | 0/15 | 15/15 |
| AI-rule2 (+ multiplicity clause) | **15/15** | 11/15 | 15/15 |

- **AI-H1 (the rescue) — SPLITS, and the registered gate FAILS on
  gemini by one ask.** Sonnet is completely rescued: 3/15 → 15/15
  (McNemar p = 5×10⁻⁴), every ask naming both candidate ids.
  Gemini improves enormously — 0/15 → 11/15 (p = 10⁻³) — but 11/15
  misses the registered ≥ 12 detection bar (one-sided binomial vs
  0.5, p = 0.059), and its four residuals all silently edited BOTH
  matches. Notably the clause transformed gemini's failure mode:
  the control arm's coin-flips (11 guessed) disappeared entirely;
  what survives is the defensible-but-wrong apply-to-all reading.
- **AI-H2 (no new tax) — PASSES everywhere at zero.** 0/90 false
  asks on clear requests, solve rates identical to control on all
  three models. The clause costs nothing where requests are
  unambiguous.
- **AI-H3 (boundaries) — PASSES everywhere** (L4 at ceiling on all
  models; opus L3 undisturbed at 15/15). One DISCLOSED whisper
  outside the gates: on L2 discretionary requests ("make it
  punchier"), opus's ask rate rose from 2/15 to 5/15 under the
  amended sentence (n.s., p = 0.25, level registered as
  descriptive) — the multiplicity framing appears to make the
  frontier tier slightly more willing to interrogate vague VALUE
  requests it previously just did.
- Control-arm replication: AE's tier split reproduced (opus 15/15,
  sonnet 3/15 vs AE's 1/15, gemini 0/15 vs 1/15 — the sub-frontier
  ask rate stays in the noise floor it came from).

**Decision rule outcome: the study gate fails as registered, and
the practical reading is sharper than a pass would have been.** The
clause is strictly beneficial at the ambiguity level on sub-frontier
tiers and free on clear requests — but it does not RELIABLY close
the gap (gemini retains a 4/15 silent edit-both residue), and on
the tier the downstream surfaces actually ship it adds nothing at
L3 (already perfect) while directionally increasing discretionary
interrogation at L2. Recommendation to the downstream ask rules:
**do not ship the clause on opus surfaces** (no measurable benefit
where it would run; a whisper of cost); for any sub-frontier
deployment it is a large, free improvement that still requires
app-side disambiguation as the actual guarantee. AE's capability
framing survives intact: prompting moved the mid tiers most of the
way, but only the frontier tier treats ambiguity as reliably
ask-worthy, clause or no clause. Cache audit re-run: zero cache
reads across all 450 records.

## Addendum (2026-07-16): Study AG — the anaphora hatch (the discourse gap closes; the visibility clause bites)

Pre-registered in [docs/BRIEF-AG.md](docs/BRIEF-AG.md) (the AG
letter was skipped earlier by a since-corrected miscommunication —
see BRIEF-AI's dated note): does the SHIPPED NEED-INFO sentence
fire on Study X's anaphora construction, where "undo that" against
a carrier-less editor failed 0/144 with every failure a silent
guess? Three arms over X's corpus verbatim — the carrier-less
control, carrier-less plus the shipped hatch, and echo plus hatch
(the shipped-stack tax check) — three models, 1,296 session steps,
zero harness errors, ≈ $16; tables in
`results/analysis-study-ag.txt`.

| Anaphora cells (48/model) | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| Control: silent wrong patches | 48/48 | 48/48 | 48/48 |
| Carrier-less + hatch: asked | **47/48** | **43/48** | **48/48** |
| Echo + hatch: asked / solved | 34 / 14 | 36 / 12 | 33 / 15 |

- **AG-H1 — PASSES on every tier, at or near ceiling.** The
  control replicated X to the digit (0/144 solved, every failure
  silent), and the shipped sentence converted 138 of those 144
  silent guesses into questions. Unlike ambiguity (AE/AI), the
  discourse gap is letter-covered — a dangling "that" is a node
  "not stated in the request" — and the asks show genuine anaphora
  recognition: "the request refers to 'that same node' from a
  prior instruction, but no such node is identified." Every tier,
  including the ones that failed ambiguity, protects itself here.
- **AG-H3 — PASSES at zero everywhere.** 0/288 false asks on
  ordinary steps, solve rates identical to control. Where the view
  contains the target, the hatch stays silent — as in AC and AE.
- **AG-H2 — FAILS on every model, and the ask texts locate the
  mechanism precisely.** With the last-edit echo supplying the full
  referent (id, key, old and new values), models still asked on
  ~70% of anaphora cells — and their asks PROVE the echo worked:
  they cite the exact node id and the intended change, then refuse
  to proceed because "the text-atom with id n58 is not visible in
  the current view." This is not hatch-echo confusion; it is the
  shipped sentence's VISIBILITY clause colliding with X's skeleton
  views. An anchored patch needs only the id (X-lastedit solved
  48/48 under the same views with no hatch), but the rule's letter
  says a node that is not visible warrants NEED-INFO, so a
  fully-specified, solvable edit becomes a question. AE never saw
  this because its views always contained the target (zero false
  asks); the same models produced zero false asks on this study's
  ordinary steps for the same reason.

**Decision rule outcome: H1's row and H2's row together.** The
practical guidance sharpens into a dependency statement: **the
hatch's zero-tax guarantee is CONDITIONAL on the focus-ids
contract.** On surfaces whose views cover every node a request
mentions (Study U's contract, the shipped configuration), the
hatch is free and now covers absence AND discourse gaps on every
tier. On skeleton- or outline-style protocols where edit targets
are legitimately out of view, the visibility clause will
interrogate solvable requests — there, either the view protocol
must carry targets, or the surface needs a self-serve view tool
(the shipped template-chat has `get_template_view`; the bench
arms deliberately did not), or the hatch text needs a re-scoped
variant measured before shipping. The echo remains the better UX
where it ships (zero questions, 48/48); the hatch behind it now
has a mapped interaction rather than an assumed one. Cache audit
re-run: zero cache reads across all 1,296 records.

## Addendum (2026-07-17): Study AJ — the correction loop in isolation (the error message didn't matter)

Pre-registered in [docs/BRIEF-AJ.md](docs/BRIEF-AJ.md): the one
shipped mechanism never measured as a variable — returning barkup's
structured issues verbatim, a design commitment in every arm of
thirty-five studies, playbook guideline 01's closing instruction,
and standing digest guidance. The isolation: seed the loop by
injecting a registered corruption of the known-correct patch as the
assistant's prior turn (45 cells, kind × class matrix over the
size-extension corpus, every corruption validated to fail the
shipped applier), then send exactly ONE feedback message — the
shipped structured issues, issue codes only, or a bare "the patch
was invalid" — and grade the single reply. 405 cells, three models,
zero harness errors, ≈ $4; tables in
`results/analysis-study-aj.txt`.

| Single-shot recovery (45 cells) | structured | codes only | bare |
|---|---|---|---|
| sonnet-4.5 | 45/45 | 44/45 | 42/45 |
| gemini-3.5-flash | 42/45 | 42/45 | 42/45 |
| opus-4.8 | **45/45** | **45/45** | **45/45** |

- **AJ-H1 — FAILS at parity, and parity is the finding.**
  Structured feedback beat bare significantly on ZERO of three
  models. Opus recovered every seeded failure from the bare
  sentence alone. Gemini's three misses are the SAME three cells in
  every arm (zero discordant pairs — feedback quality changed
  nothing). Sonnet shows the only gradient (45 > 44 > 42,
  structured-only 3, p = 0.25, n.s.) — a whisper, not a load-bearing
  wall. Told only that a patch was invalid, models re-derive the
  correct patch from the task and the tree at 93–100%.
- **AJ-H3 — the classes are almost all trivial to self-diagnose.**
  Dangling ids, missing fields, malformed op kinds, and unknown
  attributes recover at 96–100% in every arm. The only class with
  real difficulty is bad-anchor (15/14/14 of 18 pooled), and even
  there the structured paths bought one cell.
- **AJ-H4 — bare fails SAFER, not worse.** Valid-but-wrong is 3 in
  every arm; bare's extra failures are still-invalid — visible to
  the application, not silent. Thin feedback does not push models
  toward plausible wrong fixes.

**Decision rule outcome: the interpretation table's parity row.**
The verbatim-issues commitment is developer UX, not model recovery:
it costs nothing, it makes logs and debugging humane, and models at
these tiers recover either way — so the shipped guidance softens
honestly from "keep returning the structured issues verbatim
[because models need them]" to "return them because they cost
nothing and help humans; the loop is robust regardless." Caveats
carried loudly: seeded single-op corruptions are a constructed
proxy for organic errors (whose distribution differs), recovery was
single-shot (the shipped loop allows three rounds, which would
only close the gap further), and one grammar as ever. No regression
gate is filed — a mechanism that measures as non-load-bearing does
not need standing protection. Cache audit re-run: zero cache reads
across all 405 records.

## Track 2 addendum (2026-07-11): Study V — qualitative rewrites (JUDGE-GRADED)

**This section is judge-graded, not deterministically graded.** It is
the series' first Track 2 study (pre-registered in
[docs/BRIEF-V.md](docs/BRIEF-V.md)); its numbers must never be pooled
with the deterministic claims above. The judge protocol: pairwise
forced choice vs the in-instruction control, same task, same editor
model, both presentation orders at temperature 0, verdict only on
order-consistency; primary judge `openai/gpt-5.4`, sensitivity judge
`anthropic/claude-haiku-4.5`, both non-editors. **The judges passed
their own pre-registered gate flawlessly** (30/30 known pairs, 10/10
identity ties, 10/10 length probes — both judges) before any scored
editing call.

The question: does the T/U context guidance survive *qualitative*
goals ("rewrite this paragraph to focus on our central thesis")?
Corpus: 30 seeded About pages with a planted off-thesis paragraph
(`corpus/rewrite.json`; domain vocabularies disjoint on thesis words —
the guard caught two real collisions during authoring). Five arms for
where the goal lives. 300 edits (all 300 mechanically valid), 480
judged comparisons per judge; ≈ $12 including a voided first editing
run (protocol notes below).

| Win/Loss/Tie vs control, primary judge | sonnet-4.5 | gemini-3.5-flash |
|---|---|---|
| V-doc-view1 (goal in doc, target-only view) | 0/30/0 | 0/30/0 |
| V-doc-view2 (goal's node IN the view) | **0/30/0** | **0/30/0** |
| V-conv-memo (goal in the T memo) | 10/2/18 | 8/11/11 |
| V-conv-nomemo (goal said earlier, no memo) | 0/30/0 | 0/30/0 |

- **V-H1 (silent off-goal prose) — CONFIRMED, with a twist.** The
  blind arms lose all 120 comparisons, and the failure mode is not
  invention but *oblivious polishing*: the models tidied the planted
  off-topic paragraph (thesis-word coverage delta +0.00) without ever
  flagging that they could not know the goal. Mechanically valid,
  fluent, and useless — the qualitative sibling of Study U's silent
  invention.
- **V-H2 (the fixes carry over) — GATE FAILS, and the split is the
  finding.** The **memo carries a goal perfectly**: V-conv-memo ties
  or beats control (sonnet 10–2 in its favor under the primary judge,
  p = 0.039; gemini 8–11, n.s.; haiku judge: both n.s.) with proxy
  coverage +1.00, identical to control. But **reading the goal from
  the document does not equal being told it**: V-doc-view2 models
  demonstrably read the mission node (proxy +0.75/+0.66 vs +0.00
  blind) and wrote on-topic prose, yet lost 117 of 120 comparisons —
  their rewrites orbit the topic where the control's anchor the
  thesis. Goals are not values: Study U's view fix moves *data*
  perfectly; it moves *intent* only partway.
- **V-H3 (proxy triangulation) — agrees.** The keyword proxy ranks
  the arms exactly as the judges do (1.00 / 0.75 / 0.00 tiers), and
  the two judges agree on 83.3% of comparisons (kappa 0.53, above the
  70% raw floor; haiku is more tie-prone but flips no conclusion).

**Decision rule outcome: the interpretation table's "mixed by arm"
row.** The practical guidance for qualitative rewrites: **restate the
goal explicitly** — in the instruction or in the application memo,
which are measurably equivalent. Showing the model the node where the
goal lives is far better than nothing (it reads it) but measurably
worse than saying it, so for goal-directed edits the memo/instruction
is the recipe and the view remains the recipe for *data* the edit
must read (Study U). One sentence for builders: views carry values,
memos carry goals.

Protocol notes, disclosed: (1) the first editing run was voided
before any judge verdict was scored — a Layer-1 grader bug
(JSON.stringify key-order sensitivity vs the shipped applier's
canonicalized output) false-positived every cell; fixed with a
structural comparison and a regression test (6482cf7), all 300 cells
re-run. (2) One arm-favoring significant result (sonnet V-conv-memo
beating control) is reported as found; the gate's "indistinguishable"
criterion counts it as a failure even though the difference favors
the arm. (3) Judge and calibration records are not protocol
TaskRunRecords and are excluded from the cache audit's per-call
invariant (their tokens are recorded in their own JSONL).

## Track 2 addendum (2026-07-15): Study AF — restate-before-rewrite (JUDGE-GRADED; the inferred clause, measured)

**Judge-graded; never pooled with the deterministic claims.**
Pre-registered in [docs/BRIEF-AF.md](docs/BRIEF-AF.md): Study V's
one shipped-but-inferred clause — *"restate a goal from the memo in
your own words before a goal-directed rewrite"* — measured at last,
in the shipped memo configuration and in the view-side extension
that would have closed V's 117/120 gap if self-restatement were the
active ingredient. Corpus and judge protocol are V's verbatim; both
judges re-passed the full calibration gate (50/50 each) before any
scored verdict; 270 contemporaneous edits (all 270 mechanically
valid), 360 judged comparisons; ≈ $8; tables in
`results/analysis-study-af.txt`.

| vs contemporaneous control (primary judge, W/L/T) | sonnet-4.5 | gemini-3.5-flash | opus-4.8 |
|---|---|---|---|
| AF-memo-restate (the shipped configuration) | 6/5/19 | 3/10/17 | 2/9/19 |
| AF-view-restate (the extension hope) | **0/29/1** | **0/30/0** | **0/20/10** |

- **AF-H1 (does restatement rescue the view?) — FAILS on every
  editor, without a single win.** Zero wins in 90 comparisons
  pooled (0/79 decisive, p ≈ 3×10⁻²⁴), replicated by the
  sensitivity judge. And the failure is NOT non-compliance: GOAL-line
  compliance was 30/30 in every cell — every model read the
  mission node, restated the thesis in its own words, and then
  wrote the measurably-less-focused paragraph anyway (proxy
  coverage +0.53 to +0.88 vs control's +1.00). **Verbalization is
  not the active ingredient. Where the goal COMES FROM is.** A goal
  the model read, even one it just repeated aloud, anchors worse
  than a goal it was told. V's slogan hardens into a mechanism
  claim: views carry values, memos carry goals, and no prompt
  ceremony converts one into the other.
- **AF-H2 (does the shipped clause keep the memo's parity?) —
  PASSES on all three editors under the registered primary judge**
  (no significant control preference; sonnet 6/5, gemini 3/10
  p = 0.09, opus 2/9 p = 0.07). **Sensitivity dissent, disclosed
  loudly:** under the haiku judge the memo-restate arm is
  significantly control-favored on gemini (1/13, p = 0.0018) and
  opus (5/15, p = 0.0414), and V's bare-memo arm had BEATEN control
  on sonnet (10–2) where memo+restate merely ties (6/5) — a
  non-contemporaneous comparison, labeled as such. The registered
  gate passes; the honest synthesis is that mandated restatement
  does no measurable good on the memo path and directionally trends
  toward a whisper of harm.

**Decision rule outcome: the interpretation table's fails/passes
row, downgraded by the dissent.** The view-side hope dies: do not
extend "restate before rewriting" to goals the model reads from
documents — restating is theater; put the goal in the memo or the
instruction, period. And the shipped clause itself is now measured
as neutral-at-best where it applies: the benchmark's recommendation
to the downstream prompt rule is to REMOVE the restate clause (its
motivating benefit is refuted, its measured effect ranges from
nothing to mildly negative under the sensitivity judge), keeping
the memo itself — whose goal-carriage parity replicated
contemporaneously here — untouched. Protocol notes: judge agreement
66.7% raw (tie-heavy arms; the sensitivity judge flips no H1
verdict and two H2 verdicts, both toward harm — reported above);
Study V's original calibration records preserved under a `-v1`
suffix, with the fresh 100/100 calibration pass recorded in
`results/analysis-judge-calibration.txt`; judge records excluded
from the cache-audit invariant as in V.

## Addendum (2026-07-17): Study AK — eviction validation (the fix works where it can, and the frontier tier invented consolidation)

Pre-registered in [docs/BRIEF-AK.md](docs/BRIEF-AK.md): the Study AB
standard applied to the Study AH injury — the replicator's v3.213.0
goal-preserving eviction (`applySessionNotesUpdate`: evict the
oldest FACT, then RULE, never a goal, before the registered clamp)
had only ever been unit-tested. AK measured it at the injury site:
the AH integrity corpus reused verbatim (seed 20260718), the tool
handler as the ONLY variable (control = registered clamp alone at
K=20; eviction = the v3.213.0 pipeline, its eviction notice echoed
back to the agent, at K ∈ {10, 19, 20}). 120 cells, three models,
zero harness errors, zero cache reads, ≈ $3; analysis in
[results/analysis-study-ak.txt](results/analysis-study-ak.txt).

**STUDY GATE PASSES — all three registered hypotheses.**

- **AK-H1 (mechanical guarantee): 19/19 over-cap cells were
  designed evictions.** Every time a model sent more than 20 notes,
  the pipeline admitted the new note, evicted only non-goal notes
  (the oldest fact in every case), and preserved every goal. Zero
  violations — the shipped code honors its contract end-to-end.
- **AK-H2 (injury closure at K=20): goal-safe went 0/10 → 10/10 on
  opus (p = .0020), 0/10 → 6/10 on sonnet (p = .0313), 0/10 → 4/10
  on gemini (p = .1250, n.s. as predicted).** The control arm
  replicated AH nearly to the digit (opus over-cap-lost-old 10/10;
  sonnet 7 over-cap + 3 prunes exactly matching AH; gemini 7+3 vs
  AH's 8+2), and control goal-safe was 0/30 — every clamp victim
  was still a goal.
- **AK-H3 (no new damage): 60/60 clean updates at K=10 and K=19.**
  The eviction pipeline is a strict no-op where the update fits.

**The disclosed boundary held exactly as pre-registered:** benefit
is bounded by each tier's over-send rate. The residue is entirely
the client-prune pathway — sonnet pruned 4/10 and gemini 6/10
before the app ever saw the list, and every prune victim was again
a goal. The app cannot restore what it never receives; the
interpretation table's follow-up candidate (a prompt-side "send the
COMPLETE list, the app decides evictions" fence) is filed as a
future measurement, not shipped untested.

**One unregistered observation, reported descriptively:** on one
opus cell the model sent 20 notes, then 21 (drawing the eviction
notice), then responded to the notice with a third call — an
11-note memo carrying ALL 21 needles by consolidating facts into
fewer sentences. The frontier tier, told the memo was full, invented
compression rather than accept a loss. No other model reacted to
the notice at all (multi-call 1/120, re-adds 0). Consolidation-on-
notice is a real behavior worth knowing about, not a mechanism we
measured.

**Decision rule outcome: the interpretation table's all-pass row.**
The eviction upgrade moves from "designed" to "measured" in both
downstream digests; goal preservation on the clamp pathway is now
an app guarantee, not a prompt hope. Per the same row, the
memo-scale regression gate is extended to the eviction pipeline
(eviction-arm K=20 goal-safe on the opus baseline, where over-send
is the dominant pathway).

## Prior art

Aider's edit-format benchmarks (whole-file vs diff formats measurably
change success rates — consistent with our E-vs-rewrite results) and
the Berkeley Function-Calling Leaderboard (granular tool-call
reliability varies sharply by model — a phenomenon our correction
suggests should itself be audited for history-construction artifacts).
