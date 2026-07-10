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

## Prior art

Aider's edit-format benchmarks (whole-file vs diff formats measurably
change success rates — consistent with our E-vs-rewrite results) and
the Berkeley Function-Calling Leaderboard (granular tool-call
reliability varies sharply by model — a phenomenon our correction
suggests should itself be audited for history-construction artifacts).
