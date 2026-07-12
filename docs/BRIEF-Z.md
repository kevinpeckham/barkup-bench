# Addendum brief — Study Z: does standing context work? (the brand pack, measured)

**Pre-registration, committed before any scored Z run.** Replicator's
doc surfaces ship a standing context block with every request —
company, solutions, clients, styleguide — now assembled static→dynamic
with the v3.185.0 cache layout. Nobody has measured whether the model
actually USES it: whether a styleguide rule buried in a 4k-token block
gets applied unprompted, whether a client fact gets copied exactly or
replaced with a plausible near-miss from a sibling client, and whether
shipping everything beats shipping the relevant slice. The series'
priors cut both ways: U says missing context yields silent invention;
V says context that is merely PRESENT gets under-used for goals.
Study Z measures the standing-context mechanism, with the shipped
cache layout ported verbatim, and a caching appendix on the side.

## Shipped artifacts (ported verbatim from slx-replicator v3.185.0, commit 34c942f)

- `buildCachedSystem(staticBlock, dynamicBlock)` — the system-array
  cache layout (static block carries the Anthropic `cacheControl`
  breakpoint; dynamic tail follows), character-identity tested.
- The ORDER contract: static-per-org → dynamic tail; nothing
  per-request in the static block.

Disclosed as in Study W: Z tests the standing-context mechanism under
the bench's measured single-turn editing protocol (condition-F
anchored patches, focused views), not doc-chat's full prompt stack.
The pack occupies the same static-segment position as production's
brand context.

## Corpus: seeded org packs with planted obligations

`corpus/standing.json`, seed **20260720**: **12 org packs × 3 tasks
each = 36 tasks** (12 fact, 12 rule, 12 combined), over small barkup
documents (~12 nodes) with named slots (headline, CTA button,
tagline, footer contact). Each pack (~3–5k tokens, registered
skeleton): About prose (filler pools) → Solutions → **four clients**
(one target + three distractors, each with the same fact schema:
contact email, phone, tagline, product name, city) → **Styleguide of
12 numbered rules** (2 governing machine-checkable rules per rule/
combined task at controlled positions — head slots 1–2, middle 6–7,
tail 11–12, balanced — among 10 registered filler rules).

**The registered machine-checkable rule types** (each rule/combined
task governed by exactly two):
- R-tm: `Product names always carry the ™ mark: write "{Product}™"
  on every mention.` → grader: the planted product name appears
  suffixed ™.
- R-cta: `Calls to action always read exactly "Get Started".` →
  grader: CTA slot content equals "Get Started".
- R-style: `Headlines always use the textStyle "display-serif".` →
  grader: attribute equality.
- R-end: `Taglines always end with the phrase "Built to Endure."` →
  grader: endsWith.
- R-contact (combined tasks): `Contact lines always follow the form
  "{email} | {city}".` → grader: exact email + " | " + city.

**Task templates, verbatim** (slot refs are id-bearing; grounding is
solved; the needed VALUES and RULES are never in the instruction):
- fact: `Set the "content" attribute of {slotRef} to {ClientName}'s
  contact email, exactly as our records have it.` (or phone /
  product name / tagline)
- rule: `Write the headline for {ClientName}'s launch page in
  {slotRef}, mentioning their product {ProductName}.` (and CTA /
  tagline variants per the governing rules)
- combined: `Set the footer contact line for {ClientName} in
  {slotRef}, using our standard contact format.`

Validation (unit-tested): the needed fact appears exactly once in
the pack (target client's section), never in the instruction or
tree; every distractor client carries a same-schema near-miss;
governing-rule tokens absent from instructions; graders pass planted
compliant outputs and fail planted violations (including near-miss
contamination fixtures).

## Arms (3): how much context, and where?

- **Z-full** — the shipped shape: the whole pack as the static
  block. `buildCachedSystem(benchPatchPrompt + pack, "")`.
- **Z-slice** — oracle relevance: only the target client's section
  and the two governing rules. Does less beat more?
- **Z-memo** — the V-informed fix, additive: the whole pack PLUS the
  two governing rules distilled into the shipped session-notes block
  (`formatSessionNotesBlock`, rule kind) in the DYNAMIC tail. Does
  distillation rescue buried rules?

Models: sonnet-4.5, gemini-3.5-flash, opus-4.8. 36 × 3 × 3 =
**324 cells**, plus the caching appendix below.

## Grading

Layer 1 mechanical (patch applies; only the target slot changed),
then the registered deterministic obligation graders. A cell
succeeds iff every obligation passes. **Contamination** is counted
separately: any distractor client's corresponding value appearing in
the output is a flagged event, whatever else passes.

## Pre-registered hypotheses

- **Z-H1 (the shipped config is validated — the gate):** Z-full is
  statistically indistinguishable from Z-slice per model (McNemar
  over the 36 shared tasks, p > 0.05, all three models) AND Z-full
  records **zero contamination events**. Passing = ship-everything
  works at these pack sizes; failing on either clause names the
  production risk precisely.
- **Z-H2 (distillation, secondary):** Z-memo vs Z-full on rule and
  combined tasks per model. The V prior predicts memo ≥ full; if
  distillation significantly beats the buried styleguide, "distill
  the applicable rules per request" becomes the guidance.
- **Z-H3 (position, descriptive):** rule compliance by governing-rule
  position (head / middle / tail of the styleguide). No gate.
- **Secondary:** fact vs rule vs combined splits; near-miss anatomy
  (silent contamination is predicted to be the failure mode if any).

## Caching appendix (engineering measurement, no gate)

All arms run the shipped `buildCachedSystem` layout. Tasks are
grouped by pack and run consecutively per model, so the static block
repeats within the 5-minute TTL and real hit rates are observable in
the recorded `cacheReadTokens`. Reported: per-arm cache read/write
totals, effective input-cost reduction vs uncached price, and a
10-cell neutrality spot-check (sonnet Z-full re-run with a plain
string system, temperature 0) with any output divergence disclosed
descriptively.

## Interpretation table (pre-registered)

| Z-full vs Z-slice | Contamination | Reading |
|---|---|---|
| ties | zero | Standing context works as shipped; caching numbers become the optimization story |
| ties | > 0 | Accuracy survives but silent cross-client bleed exists — the fix is slice-by-client, not less context |
| slice wins | zero | Dilution is real; ship the relevant slice (cheap-model selection à la N-ground2 is the recipe) |
| slice wins | > 0 | Both failure modes live; slice-by-client becomes mandatory guidance |

Z-memo grafts onto whichever row obtains: if distillation rescues
rules, it ships as guidance regardless.

## Decision rule

The obtaining row lands in barkup's docs and the Replicator digest,
with the caching appendix numbers attached either way.

## Protocol

Single-turn cells as Studies U/V: `maxOutputTokens: 60000`,
temperature 0, ≤3 correction rounds, resumable JSONL
`results/raw/studyz-<model>.jsonl`, `cacheReadTokens` recorded per
call, cache audit re-run, pack-grouped execution order. **Expected
spend $40–70**; abort past $120.

Honesty rules unchanged: this brief, the pack pools and skeleton, the
task templates, the obligation graders with their fixture tests, the
verbatim `buildCachedSystem` port, and all three arm constructions
are committed before the first scored call; results publish whatever
they show.
