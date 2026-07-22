# Addendum brief — Study AN: ask or act (does tool availability dissolve the visibility-clause tax?)

**Pre-registration, committed before any scored AN run.** Study AG's
H2 failed on every model and located the mechanism precisely: with a
complete last-edit echo in hand (id, key, both values), models still
replied NEED-INFO on ~70% of anaphora cells under skeleton views,
citing that the target node "is not visible in the current view" —
the shipped ask sentence's VISIBILITY clause colliding with views
that legitimately omit the target. An anchored patch needs only the
id (X-lastedit solved 48/48 under the same views with no hatch), so
these asks are pure tax.

The shipped surface this lands on (replicator template-chat in
outline mode, ≥300 nodes) differs from AG's arms in one decisive
way: it HAS `get_template_view`. The correct behavior there is
fetch-then-patch, not ask. AG could not see whether models do that,
because its arms carried no tools. The replicator fence filed the
follow-up explicitly: a "prefer fetching over asking" priority
clause is the obvious fix and is UNMEASURED — register a test before
shipping. A production scan (2026-07-22) found zero NEED-INFO in 78
logged sessions, but also zero exposure: only two template-editor
sessions exist, both pre-dating the ask rules and neither in outline
mode. This study is forward-protection, not bug confirmation.

## Corpus and machinery: reused, plus one tool

`corpus/sessions-anaphora.json` verbatim (Study X: 12 sessions × 12
steps per model, 48 anaphora cells per arm-model, the rest
self-contained ordinary steps). Study X/AG's session runner and
protocol unchanged (temperature 0, ≤3 correction rounds, session as
the resume unit, skeleton views on anaphora steps) except the
registered arm additions below.

**The tool (registered here):** `get_template_view` — input
`{ nodeId: string }`; returns the same focused view the shipped
surface serves (the bench's `buildView` around the requested id on
the CURRENT session tree, the Study I/J machinery), or a plain
"no node with id <id>" line for unknown ids. Tool-loop arms run
under the AI SDK loop with a hard cap of 6 steps
(`stopWhen: stepCountIs(6)`); the final text reply is graded exactly
as in X/AG (patch, NEED-INFO, or neither).

**The clause (registered here, appended to the shipped `ASK_RULE`,
which stays byte-identical — the MULTIPLICITY_CLAUSE precedent):**

> ` Before asking, check your tools: if an available tool can fetch
> what is missing (for example a view of a node you need to see),
> CALL THE TOOL and continue instead of replying NEED-INFO. Ask only
> when neither the request, the view, nor any available tool can
> supply the missing information.`

## Arms (4), full sessions each

- **AN-echo-hatch** — AG-echo-hatch verbatim, re-run
  contemporaneously: echo + shipped ASK_RULE, no tools. The ~70%
  false-ask anchor.
- **AN-tools** — AN-echo-hatch plus `get_template_view`. Measures
  whether tool AVAILABILITY alone dissolves the visibility-clause
  tax (the shipped surface's actual configuration).
- **AN-tools-clause** — AN-tools plus the registered clause. The
  candidate prompt fix.
- **AN-noecho-tools-clause** — the PROTECTION arm: NO echo
  (AG-stateless-hatch's construction), tools AND clause present. The
  anaphoric referent lives in discourse history, not the tree — no
  tool can supply it, so genuine asks must survive the clause.

**Models (3):** sonnet-4.5, gemini-3.5-flash, opus-4.8.
4 arms × 12 sessions × 12 steps × 3 models = **1,728 step records**
(576 anaphora cells). Resumable JSONL
`results/raw/studyan-<model>.jsonl`; cache audit re-run.

## Pre-registered hypotheses and gates

- **AN-H1 (the anchor replicates):** AN-echo-hatch anaphora cells:
  asked ≥ 24/48 per model (AG measured ~34/48; ≥50% allows
  provider-snapshot drift while preserving the injury).
- **AN-H2 (availability suffices — a fork, gated per model):**
  AN-tools anaphora cells: success ≥ 45/48 AND asks ≤ 4/48
  (X-lastedit's 48/48 band + AC's false-ask standard). Passing on
  all three models means the shipped surface never had the exposure
  and NOTHING ships.
- **AN-H3 (the clause closes it):** AN-tools-clause anaphora cells:
  success ≥ 45/48 AND asks ≤ 4/48 per model.
- **AN-H4 (genuine asks survive — the safety gate):**
  AN-noecho-tools-clause anaphora cells: asked ≥ 31/48 per model
  (AG-H1's detection standard) AND silent wrong patches not
  significantly above AG-stateless-hatch's residue (exact binomial
  band reported); tool-call counts described (flail check).
- **AN-H5 (ordinary steps undisturbed):** every arm, per model:
  false asks ≤ 5/96 on ordinary cells AND success not significantly
  below the AN-echo-hatch control (McNemar, p > 0.05, or
  arm-favoring).
- **The study gate: AN-H1, AN-H4, and AN-H5 pass, AND at least one
  of AN-H2 / AN-H3 passes on all three models.**
- **AN-H6 (descriptive):** per-arm tool-call distributions; whether
  models fetch the view or patch directly from the echo'd id (both
  are correct — patch-direct is cheaper); ask-text quality in the
  protection arm; tier map; input-token cost of the tool loop.

## Interpretation table (pre-registered)

| AN-H2 | AN-H3 | AN-H4 | Reading |
|---|---|---|---|
| pass | — | pass | Tool availability alone dissolves the visibility-clause tax: the shipped surface (which has the tools) was never exposed; the replicator watch item CLOSES with no prompt change, and the clause stays unshipped |
| fail | pass | pass | The clause is the fix: eligible to ship into template-chat/doc-chat ask rules (app decision, AB's point-of-injury surface class); without it, tool-bearing surfaces pay the AG tax |
| fail | fail | pass | The prompt path is dead: models neither use tools unprompted nor when told to prefer them — the lever is app-side (attach a fetched view of the echo'd referent to the request, the U focus-ids contract extended to discourse) |
| — | — | fail | The clause is UNSAFE regardless of efficacy: it erodes genuine asks (converts unanswerable gaps into tool flailing or guesses) — do not ship any wording; document and fall back to app-side levers |

Sub-frontier divergence on H2/H3 with an opus pass is reported as a
tier map (the shipped tier governs shipping; the AE/AI precedent).

## Cost fence

Opus in 4 arms dominates spend; projected AG-class ×1.3 plus
tool-loop input inflation — order $15–30. Authorized 2026-07-22
("proceed with study"). Abort-and-report if projected overrun
exceeds 2× at the first model checkpoint.
