# Addendum brief — Study AO: canonical-tag steering (does advisory lint keep agent tags on the catalog?)

**Pre-registration, committed before any scored AO run.** Replicator
v3.246.0 shipped a three-part assumption on its MCP publishing
surface: agents drafting articles will (a) call `tags_list` because
the tool description tells them to, (b) copy catalog tag names
exactly as spelled, and (c) self-correct when warn-only
`schemaWarnings` come back with did-you-mean suggestions. None of
this is measured, the org just spent a cleanup pass normalizing 469
drifted tag instances, and external agents are actively drafting
through this surface. If advisory steering fails, drift returns
through the front door and the fix is harder gating; if it works,
the warn-only philosophy is validated for this surface class.

## Abstraction (registered honestly)

Tasks ask the model to PROPOSE FRONTMATTER TAGS for a described
article (title + summary supplied), replying with a single JSON
object `{"tags": [...]}` — the tag-selection subtask isolated from
body drafting. This under-weights whatever attention pressure a full
draft adds; the trade is determinism and ~20× less cost. Body-drafting
realism is a follow-up if AO's steering numbers land near a gate
boundary.

## Corpus (hand-authored, committed — reproducible by construction)

`corpus/tag-steering.json`: a 40-name fixture catalog modeled on the
Lightning Jar shapes (mixed-case names, hyphenated names, stylized
brands like `barkup`/`npm`/`eCommerce`, near-collision pairs like
`LLMs`, `Front-End`, `Open Source`) and **36 tasks** in three
registered classes of 12:

- **covered** — the natural tags exist in the catalog verbatim;
- **trap** — the topic's natural phrasing suggests a case/format
  VARIANT of a canonical name (`llm`, `frontend`, `open-source`,
  `wordpress`, …);
- **uncovered** — no specific catalog tag fits; correct behavior is
  nearest general canonical tags, NOT inventing new ones.

## Machinery

Single-call runner plus at most ONE feedback round (the shipped
flow: warnings come back on save; the agent may revise once).
Temperature 0, three models (gemini-3.5-flash, sonnet-4.5,
opus-4.8). The lint is the shipped algorithm ported verbatim: exact
name membership; slug-equivalent variants get
`"X" is not a canonical tag — did you mean "Y"?`; unknowns get
`"X" is not a canonical tag — pick from tags_list, or add it in
Org Settings → Tags`. The `tags_list` tool (arms 2 only) returns the
fixture catalog as `{count, tags:[{name, category}]}` under the
shipped description verbatim: "The organization's canonical tag
catalog. ALWAYS pick article frontmatter tags from this list (exact
names — casing matters); non-canonical tags trigger schema warnings
on save. Tags are managed by humans in Org Settings → Tags."

## Arms (3)

- **AO-bare** — no tool, no warnings. Anchors natural drift.
- **AO-shipped** — `tags_list` available + the one warning round.
  The v3.246.0 stack.
- **AO-warnings-only** — no tool; the warning round only. Isolates
  whether the lint alone suffices (relevant to surfaces that get
  warnings but no catalog read).

36 tasks × 3 arms × 3 models = **324 primary cells** (+ feedback
rounds where warnings fire). Resumable JSONL
`results/raw/studyao-<model>.jsonl`.

## Pre-registered hypotheses and gates

A cell is **clean** when its FINAL tags are non-empty and every tag
is an exact catalog name.

- **AO-H1 (drift is real):** AO-bare clean rate ≤ 28/36 per model
  (if unguided models already land exact canonical casing, the
  feature answers a non-problem — report and stop).
- **AO-H2 (the shipped stack steers — the gate, shipped tier):**
  AO-shipped on opus-4.8: clean ≥ 33/36, with trap-class clean
  ≥ 10/12. Sub-frontier reported as a tier map.
- **AO-H3 (the correction loop closes — shipped tier):** among
  AO-shipped and AO-warnings-only opus cells whose FIRST attempt
  drew warnings: final clean ≥ 90% (the AJ correction band).
- **AO-H4 (no steering-induced omission — all models):** in steered
  arms, empty-tags cells ≤ 2/36 per model per arm.
- **AO-H5 (descriptive):** unprompted `tags_list` call rate;
  warnings-only vs shipped delta (is the tool load-bearing or the
  lint?); uncovered-class behavior (invention vs generalization);
  per-model drift anatomy in AO-bare; token cost.
- **The study gate: AO-H1, AO-H2, AO-H3, and AO-H4 pass.**

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| All pass | Warn-only advisory steering is validated for this surface class: the v3.246.0 design stands, no hard gating needed |
| H1 fails | Models natively canonical: the catalog lint is belt-and-suspenders; document, keep (zero cost), stop measuring |
| H2 fails, H3 passes | The tool description under-steers but the lint recovers: consider returning warnings pre-save (validate-first flow) rather than hard gating |
| H3 fails | Advisory lint does not close the loop on the shipped tier: escalate to hard gating (reject non-canonical tags on save) as a product decision |
| H4 fails | Steering suppresses tagging itself — the warning text needs a "pick the nearest canonical tags" affordance before any wider rollout |

## Cost fence

Single-call cells, ≤ 1 feedback round; projected well under Study
AN — order $3–8. Authorized 2026-07-23 ("proceed with the study").
