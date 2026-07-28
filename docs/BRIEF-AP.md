# Addendum brief — Study AP: the off-catalog fork (empty vs nearest-general vs mint — what ships for topics the catalog doesn't cover?)

**Pre-registration, committed before any scored AP run.** Study AO
left one registered protocol lesson: its "clean" definition required
non-empty tags, but on off-catalog topics opus produced EMPTY tag
lists in 12/12 uncovered cells (sonnet 7, gemini 9) rather than
stretch general canonical tags onto them — defensible editorial
behavior the brief's "nearest general canonical tags" prescription
mis-scored. AO's verdict filed the successor explicitly: "a successor
study should register empty-vs-nearest as an explicit fork." Two
replicator product decisions are gated on that fork and are on file
as register-before-shipping items: (a) what off-catalog guidance text
(if any) to add to the `tags_list` surface, and (b) whether a scoped
`tag_create` MCP tool can be shipped without inviting the drift the
catalog feature exists to prevent. AP measures the fork and both
candidates.

## What AO already settled (not re-measured here)

Bare-arm drift is total (0/36 clean everywhere); the shipped stack's
catalog read is the mechanism (tags_list consulted 36/36 unprompted,
traps 12/12 canonical on all tiers); warnings alone are insufficient.
AP therefore carries NO bare arm and NO warnings-only arm. The
shipped stack is the control.

## Abstraction (registered honestly)

Same isolation as AO: tasks ask the model to PROPOSE FRONTMATTER
TAGS for a described article (title + summary), replying with a
single JSON object `{"tags": [...]}`. Same trade: determinism and
~20× less cost than full body drafting; body-drafting realism
remains a follow-up if numbers land near a gate boundary.

## Corpus (hand-authored, committed — reproducible by construction)

`corpus/tag-steering-ap.json`: the AO 40-name fixture catalog copied
VERBATIM, and **48 tasks** in four registered classes of 12:

- **covered** — reused verbatim from AO (natural tags exist in the
  catalog verbatim);
- **trap** — reused verbatim from AO (natural phrasing suggests a
  case/format variant of a canonical name);
- **adjacent** (NEW) — the article's specific subject has no catalog
  tag, but one or more GENERAL canonical tags are genuinely relevant
  (e.g. a GraphQL pagination piece under a catalog with no `GraphQL`
  tag but with `Software Engineering`). Each task registers an
  `acceptableTags` set — the canonical names a reasonable editor
  would accept for it — authored with the task, before any run.
- **foreign** — reused verbatim from AO's uncovered class (sourdough,
  beekeeping, …): topics wholly outside the catalog's domain, where
  NO canonical tag is even generally relevant.

The empty-vs-nearest fork of AO's single "uncovered" class is thus
registered as a class split: adjacent is where nearest-general is
right; foreign is where empty is right. That judgment is itself part
of the pre-registration — the classes encode the editorial position
the candidate guidance text takes.

## Machinery

AO's runner design: single call + at most ONE warning round
(warnings fire on the shipped lint, ported verbatim — exact
membership, slug-equivalent did-you-mean). Temperature 0, three
models (gemini-3.5-flash, sonnet-4.5, opus-4.8), resumable JSONL
`results/raw/studyap-<model>.jsonl`. All arms carry the `tags_list`
tool under the shipped description verbatim (AO showed the catalog
read is the mechanism). Scoring is mechanical, extracted to
`src/grading/tag-steering-ap.ts` with unit tests.

In the tool arm, `tag_create` is modeled AS IT WOULD SHIP — the
server owns the invariant: parameters `{name, category}` with
category one of `capability | industry | other`; the guard rejects
empty/whitespace names, names over 40 characters, and any name
slug-equivalent to an existing canonical tag (error:
`"X" is slug-equivalent to canonical tag "Y" — use "Y" instead.`).
Accepted mints join the cell's catalog immediately (subsequent lint
and scoring accept them); rejected attempts are recorded. Registered
tool description, verbatim:

> Create a new canonical tag in the organization's catalog. Use ONLY
> after checking tags_list and finding no canonical tag that fits —
> never create a tag when an existing canonical tag (or a
> casing/format variant of one) covers the topic. Match the
> catalog's naming style (e.g. Title Case for general topics, exact
> brand casing for products). Tags you create become canonical and
> reusable by the whole org.

## Arms (4)

Each arm's guidance is a candidate SHIP TEXT, registered verbatim;
whichever passes ships character-for-character or not at all.

- **AP-shipped** — the v3.246.0 stack exactly as AO ran it
  (tags_list + one warning round, no off-catalog guidance). Control:
  replicates AO's foreign-class behavior and anchors the adjacent
  class under the current product.
- **AP-fork** — shipped + this text appended to the `tags_list` tool
  description: *"If no specific canonical tag fits the article,
  choose the nearest GENERAL canonical tags that are still genuinely
  relevant (a niche technique still belongs to its field's general
  tag). If nothing in the catalog is even generally relevant, return
  an empty tags list — do not stretch unrelated tags and do not
  invent new ones."* The two-branch candidate: nearest-general on
  adjacent, empty on foreign.
- **AP-empty** — shipped + this text appended instead: *"Only use
  tags that genuinely fit the article. If no canonical tag genuinely
  fits, return an empty tags list — do not stretch loosely-related
  tags and do not invent new ones."* The empty-preference candidate;
  its registered risk is suppressing legitimate adjacent-class
  generalization.
- **AP-tool** — shipped + the `tag_create` tool (guarded, above),
  with no off-catalog prose beyond the tool's own description. The
  give-the-model-a-tool-not-a-rule candidate.

48 tasks × 4 arms × 3 models = **576 primary cells** (+ warning
rounds where fired).

## Scoring (registered, mechanical)

- **canonical-clean**: final tags non-empty and every tag an exact
  catalog name (AO's definition). In AP-tool, the catalog for a cell
  is the fixture catalog plus that cell's accepted mints.
- **empty**: final tags `[]`.
- **invented**: any final tag neither canonical nor an accepted mint.
- **Conformance by class** (the per-cell success bit):
  - covered / trap: canonical-clean; in AP-tool additionally zero
    mint attempts in the cell (minting when a canonical tag fits is
    the failure the guard cannot catch).
  - adjacent: non-empty, zero invented, and every non-minted tag ∈
    the task's `acceptableTags`; mints are permitted (and counted
    descriptively) in AP-tool only.
  - foreign: by arm intent — AP-fork and AP-empty: empty. AP-tool:
    empty OR (≥1 accepted mint and zero invented). AP-shipped:
    NO conformance bit; both readings (empty-rate, canonical-
    generalization-rate, invention-rate) reported descriptively —
    this is the fork being measured, not a behavior under test.

## Pre-registered hypotheses and gates

- **AP-H1 (replication anchor, shipped tier):** AP-shipped foreign
  empty cells ≥ 10/12 on opus. If this fails, AO's uniform-empty was
  provider weather and the fork is less loaded than filed — report
  and continue (H1 is a gate on the STORY, so it stays in the study
  gate; its failure reading is in the table).
- **AP-H2 (the fork text steers both branches, shipped tier):**
  AP-fork on opus: adjacent conformant ≥ 10/12 AND foreign empty
  ≥ 10/12.
- **AP-H3 (no discipline regression — every model × every arm):**
  covered + trap conformant ≥ 22/24 per model per arm. New guidance
  or tooling must not damage what AO validated.
- **AP-H4 (tool discipline — every model):** in AP-tool: zero
  invented tags in final answers across all 48 cells, AND covered +
  trap cells with ≥ 1 mint attempt (accepted or rejected) ≤ 1/24.
- **AP-H5 (descriptive, the deciding contrast if H2 fails):**
  AP-empty adjacent behavior on opus — empty-rate ≥ 6/12 reads as
  "the empty-preference text suppresses legitimate generalization"
  (its registered cost); conformant-rate is compared against
  AP-fork's adjacent branch.
- **AP-H6 (descriptive):** mint anatomy (names as minted, casing
  style vs catalog conventions, categories chosen, slug-collision
  rejections and what followed them), tags_list call rates, warning-
  round usage per arm, foreign-class behavior distribution in
  AP-shipped by model, token cost.
- **The study gate: AP-H1, AP-H2, AP-H3, and AP-H4 pass.**

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| All pass | The AP-fork text ships into the `tags_list` description (product decision on timing); `tag_create` is discipline-safe and its ship decision falls to mint QUALITY (H6 anatomy), not drift risk; AO's uncovered anomaly is resolved as a class split the guidance now encodes |
| H1 fails | AO's 12/12 empty was weather, not disposition; the fork text may still pass H2 on its own merits — evaluate H2–H4 as registered and note the weaker replication anchor in the report |
| H2 fails on the adjacent branch (models stay empty despite the text) | Empty-bias is robust to instruction: accept empty as the correct off-catalog behavior, do NOT ship nearest-general prose; AP-empty becomes the reference text if its own foreign branch held |
| H2 fails on the foreign branch (the text induces stretching onto sourdough) | The nearest-general affordance is actively harmful; ship the AP-empty text instead if it passed; the fork resolves toward empty |
| H3 fails | The candidate text/tool taxes core canonical discipline — nothing ships; v3.246.0 stands unchanged and the off-catalog fork stays app-side (human tag curation) |
| H4 fails | `tag_create` invites front-door drift even with the server guard — the tool does not ship; the catalog stays human-managed in Org Settings → Tags |

## Cost fence

576 primary cells, single call + ≤ 1 warning round, tool arm capped
at 4 steps; projected ≈ 1.5–2× AO's spend (AO: 0.24M in + 86K out) —
order **$3–10**. Authorized 2026-07-28 ("proceed with AP").
