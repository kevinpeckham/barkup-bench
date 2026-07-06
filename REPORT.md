# barkup-bench — Findings

**TL;DR: The whole-artifact rewrite strategy wins; the HTML dialect
itself is neither an advantage nor a handicap.** Against an
equal-quality JSON twin, rewrite-style editing (HTML or JSON) beats
granular mutation tools by ~5–7 points overall and by 33 points on
multi-turn id-referencing tasks — but the effect comes from the
*strategy*, not the *format*: JSON + whole rewrite (condition B)
matches or slightly exceeds HTML + whole rewrite (condition A)
everywhere. The predicted large-tree reversal never appeared. JSON
Patch collapses on large trees. Granular tools are reliable for
frontier models and fragile for smaller ones.

This is a pre-registered benchmark (BRIEF.md, committed before any
scored run). Mixed results are published as found.

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

## Prior art

Aider's edit-format benchmarks (whole-file vs diff formats measurably
change success rates — consistent with our E-vs-rewrite results) and
the Berkeley Function-Calling Leaderboard (granular tool-call
reliability varies sharply by model — consistent with our H4
mechanism).
