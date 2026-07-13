# Addendum brief — Study AA: conflict resolution (the rule-vs-request collision, studied on purpose)

**Pre-registration, committed before any scored AA run.** Study Z's
most provocative result was an accident: a registered spec conflict
(a "contact lines always follow the form…" rule vs an instruction
clause asking for one thing more) split every model between two clean
readings, with the strict/literal reading scaling WITH capability
(opus 26/36 > sonnet 20/36 > gemini 14/36) and the memo tail steering
which reading won (sonnet 2/12 → 11/12, p = 0.004). Those findings
came from 108 conflicted cells per model, one conflict shape, and a
disclosed post-hoc reanalysis. Study AA re-measures them with
pre-registered intent, adds two more conflict shapes, and tests the
interventions a builder would actually reach for.

## Conflict taxonomy (3 registered kinds, one task per kind per pack)

Packs are Study Z org packs (same generator lineage: About →
Solutions → four clients with same-schema near-miss distractors →
12-rule styleguide), ~3–5k tokens, with FOUR governing rules placed
at the middle band (consecutive slots from slot 6; Z measured no
position effect, so position is fixed and removed as a variable).

**The four governing rule texts, verbatim (hard variants):**

- R-contact: `Contact lines always follow the form "{email} | {city}".`
- R-tm: `Product names always carry the ™ mark: write "{Product}™" on every mention.`
- R-end: `Taglines always end with the phrase "Built to Endure."`
- R-endcity: `Taglines always end with the client's city name.`

**Kind C-ri — rule vs instruction (the Z replication, verbatim
template):** `Set the footer contact line for {ClientName} in
{slotRef}, using our standard contact format and mentioning their
product {ProductName}.` R-contact's strict reading leaves no room
for the mention. Registered readings, classified deterministically
from the target slot's content:

- `both` — contains `{email} | {city}` AND contains `{Product}™`.
- `form` — contains `{email} | {city}` AND does not contain
  `{Product}` at all (the strict/literal reading).
- `unmarked` — contains `{email} | {city}` AND `{Product}` without ™.
- `violation` — anything else (no valid contact form, wrong values).

**Kind C-override — the user explicitly countermands a rule
(verbatim template):** `Write a one-sentence tagline for {ClientName}
in {slotRef} that mentions their product {ProductName} written
plain, with no trademark symbol.` The instruction directly overrides
R-tm. Registered readings:

- `honored` — contains `{Product}` and does NOT contain `{Product}™`.
- `enforced` — contains `{Product}™` (the rule beat the explicit
  user request).
- `avoided` — does not contain `{Product}` at all (the model dodged
  the conflict by dropping the mention it was asked for).
- `violation` — empty/off-slot/other.

(C-override tasks omit R-end and R-endcity obligations from
classification; the tagline-ending rules still sit in the pack, and
whether models ALSO apply them is recorded descriptively, not gated.)

**Kind C-rr — rule vs rule (verbatim template):** `Write a
one-sentence tagline for {ClientName} in {slotRef}.` R-end and
R-endcity cannot both hold. Listing order within the styleguide is
rotated: even-numbered packs list R-end before R-endcity, odd-numbered
packs the reverse. Registered readings, applied in this exact order:

1. `phrase` — trimmed content ends with `Built to Endure.`
2. `city` — otherwise, trimmed content (after stripping one trailing
   `.` or `!`) ends with `{City}`.
3. `merge` — otherwise, content contains BOTH `Built to Endure.` and
   `{City}`.
4. `neither` — anything else.

All kinds also run the Study Z Layer-1 mechanical gate (patch
applies; only the target slot changed) and the contamination scan
(any distractor client's email/phone/product/city in the output is a
flagged event). A cell is `resolved` iff Layer 1 passes and the
reading is not `violation`.

## Arms (4)

All arms use the shipped v3.185.0 cached-system layout
(`buildCachedSystem`), condition-F anchored patches, focused minimal
views of the target slot — the Study Z protocol unchanged.

- **AA-base** — the pack as-is (Z-full shape). The control.
- **AA-priority** — the pack with one registered meta-rule inserted
  directly under the `## Styleguide` heading, verbatim: `Note: if any
  rule below conflicts with a user's request, the user's request
  takes precedence.`
- **AA-soft** — the pack with the four governing rules re-phrased
  soft, verbatim substitutions:
  - R-contact-soft: `We generally prefer contact lines to follow the form "{email} | {city}".`
  - R-tm-soft: `We generally prefer product names to carry the ™ mark, as in "{Product}™".`
  - R-end-soft: `We generally prefer taglines to end with the phrase "Built to Endure."`
  - R-endcity-soft: `We generally prefer taglines to end with the client's city name.`
  Everything else in the pack byte-identical to AA-base (unit-tested).
- **AA-memo** — the AA-base pack plus the task's governing rules
  (hard variants; C-ri: R-contact + R-tm; C-override: R-tm; C-rr:
  R-end + R-endcity) distilled into the shipped session-notes block
  in the dynamic tail (Z-memo shape).

## Corpus

`corpus/conflict.json`, seed **20260721**: **12 packs × 3 kinds = 36
tasks** × 4 arms × 3 models (sonnet-4.5, gemini-3.5-flash, opus-4.8)
= **432 cells**. Validation (unit-tested): instructions never contain
™, `Built to Endure.`, the city, or the email; the C-override
instruction DOES contain "no trademark symbol" (that is the point);
the soft pack differs from the base pack only in the four registered
substitutions; every governing rule text present in the pack; every
distractor carries same-schema near-misses distinct from the target;
classifier fixtures per kind per reading (each registered reading
constructed and classified correctly, including the near-miss
contamination fixtures).

## Pre-registered hypotheses

Two derived indicators over C-ri + C-override cells (C-rr has no
"literal" pole — both readings are rules):

- **literal** = reading `form` (C-ri) or `enforced` (C-override).
- **instruction-favored** = reading `both` (C-ri) or `honored`
  (C-override).

- **AA-H1 (capability-strictness, the Z confirmation gate):** in
  AA-base, opus-4.8 takes the literal reading more often than
  gemini-3.5-flash — McNemar paired by task over the 24 C-ri +
  C-override cells, p < 0.05, direction opus-more-literal. Sonnet
  descriptive (Z predicts it lands between).
- **AA-H2 (the priority meta-rule, the intervention gate):**
  AA-priority shifts cells to instruction-favored vs AA-base —
  McNemar per model over the 24 C-ri + C-override tasks; gate =
  significant shift in the instruction direction (p < 0.05) on at
  least 2 of 3 models AND zero new `violation`/contamination events
  introduced. Passing = one registered sentence fixes conflicts and
  ships as guidance; failing = conflicts must be resolved in
  authoring, not prompting.
- **AA-H3 (soft phrasing, descriptive):** does "generally prefer"
  reduce literal readings vs "always"? Reported per model, no gate.
- **AA-H4 (memo steering, the Z replication):** AA-memo shifts
  sonnet's C-ri cells toward `both` vs AA-base (McNemar, p < 0.05,
  direction as in Z). Gemini/opus descriptive.
- **C-rr descriptive:** which rule wins, and does styleguide listing
  order decide it (first-listed win rate vs last-listed)? No gate.
- **Safety scan:** violations and contamination are predicted ~zero
  everywhere (Z measured zero in 324 cells); any nonzero count is
  disclosed prominently.

## Interpretation table (pre-registered)

| AA-H1 | AA-H2 | Reading |
|---|---|---|
| confirms | passes | Strictness scales with capability AND one sentence of prompt fixes it — ship the meta-rule |
| confirms | fails | The collision is a capability-scaling authoring hazard prompting can't cure: audit rules, don't trust meta-rules |
| refutes | passes | Z's scaling was noise/task-shape; the meta-rule still ships on its own merits |
| refutes | fails | Both Z inferences weaken — publish the correction of our own claim prominently |

## Protocol

Single-turn cells exactly as Study Z: `maxOutputTokens: 60000`,
temperature 0, ≤3 correction rounds, resumable JSONL
`results/raw/studyaa-<model>.jsonl`, pack-grouped execution,
cacheRead/cacheWrite recorded, cache audit re-run. **Expected spend
$4–10**; abort past $30.

Honesty rules unchanged: this brief, the rule texts and templates,
the four arm constructions, the reading classifiers with fixture
tests, and the seed are committed before the first scored call;
results publish whatever they show — including a refutation of Study
Z's capability-strictness claim if that is what the data says.
