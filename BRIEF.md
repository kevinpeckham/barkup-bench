# barkup-bench — Kickoff Brief

You are building **barkup-bench**: a rigorous, publishable benchmark that
measures whether the barkup approach (HTML-as-authoring-dialect +
whole-tree rewrite) actually outperforms conventional approaches (JSON +
granular mutation tools) for LLM agents editing typed trees — and under
what conditions each wins.

The claims under test come from this published article (read it first):
https://www.lightningjar.com/blog/ast-as-html

The package under test:
- npm: `@kevinpeckham/barkup` (use it as a dependency — including its
  `/testing` export)
- repo: https://github.com/kevinpeckham/barkup
- sibling checkout: `~/newdev/barkup` — read `docs/architecture.md` for a
  full file-by-file reference of the codec and its guarantees.

**Author: Kevin Peckham. License: MIT.** Honesty rule: this benchmark
publishes whatever it finds, including mixed or negative results. A
measured crossover ("whole-tree wins below N nodes, granular wins above")
is a MORE valuable outcome than a clean sweep. Never tune anything after
looking at scored results; prompts are pre-registered (committed) before
the first scored run.

---

## Pre-registered hypotheses (H1–H5)

1. **H1 (format fluency):** HTML-dialect output has a higher first-pass
   validity rate than equivalent JSON output, at equal prompt budgets.
2. **H2 (strategy):** whole-artifact rewrite achieves higher task success
   in fewer rounds than granular mutation tool-calling on small/medium
   trees; the advantage shrinks or reverses as tree size grows.
3. **H3 (cost):** the barkup approach solves tasks with fewer total tokens
   (prompt + completion, summed over rounds) on small/medium trees.
4. **H4 (reference stability):** follow-up edits referencing node ids from
   the model's own prior output succeed more often under HTML + rewrite
   than under JSON + tools.
5. **H5 (reading):** models answer structural questions about a tree more
   accurately from the HTML serialization than from JSON.

## Experimental conditions (factorial)

| | Whole-artifact rewrite | Granular mutation tools |
|---|---|---|
| **HTML dialect** | **A** (the barkup approach) | D |
| **JSON** | B (isolates the format variable) | C (the textbook approach) |

Plus **E**: JSON Patch (RFC 6902) — the common middle ground. A–C and E
are required; D completes the factorial and is strongly preferred.

All conditions share ONE grammar semantics:
- HTML side: a barkup grammar (`defineGrammar`) — parse/validate/issues
  come free.
- JSON side: build an **equal-quality twin** — a JSON Schema expressing
  the same node types/containment/attribute types, a validator whose
  structured errors are as strict AND as helpful as barkup's
  `GrammarIssue`s (same information: code, message, path). If the JSON
  arm gets worse error feedback, the benchmark measures our effort, not
  the approach. This twin is the single most important fairness artifact
  in the project — build and test it with the same care as the harness.
- Granular-tools side: implement the mutation API
  (`insertNode(parentId, type, index)`, `setAttribute(nodeId, key,
  value)`, `moveNode`, `removeNode`, `setName`) as real tools over the
  tree, with realistic failure responses (stale id → error result, etc.).

## Task corpus (procedurally generated — ground truth is free)

Use `treeArbitrary` from `@kevinpeckham/barkup/testing` (seeded fast-check
so the corpus is reproducible) over a fixed benchmark grammar — model it
on the document grammar in barkup's tests/helpers.ts (document → page →
block → text/image atoms, widget-slot with a json attribute), sized so
tasks are realistic.

Four task families:
1. **Construction** — sample a target tree; a HELD-OUT describer model
   writes a natural-language spec from it; subject models must produce a
   matching tree. Success = validator-pass + semantic equivalence
   (`nodesEqual` modulo generated ids). Note the describer-affinity
   limitation in the report (one describer family may phrase specs that
   favor its own family; use a describer from a different family than any
   subject model, and say so).
2. **Transformation** — given tree T (serialized per condition) and a
   described edit, produce T′. Ground truth = the edit applied
   programmatically. Also measures **drift**: count nodes changed that
   the edit did not call for (tree diff vs the minimal edit).
3. **Reference stability (multi-turn)** — edit 1, then edit 2 that
   references nodes by id from the model's own prior output.
4. **Reading** — exact-answer structural questions ("how many text atoms
   under the second page?", "what is the maxLength of the atom named X?").

Stratify tree sizes: ~5, 20, 60, 150 nodes. Finding the size crossover is
a headline result.

## Protocol

- **Correction loop:** up to 3 feedback rounds; failures return the
  condition's structured issues verbatim. Score pass@1 and
  pass-within-3.
- **Prompt regimes, both reported:** (a) *parity* — mechanically equal
  prompt budgets/structure across conditions; (b) *best-effort* — each
  condition gets its own tuned prompt, tuned on a dev split ONLY and
  committed (pre-registered) before any scored run.
- **Models:** 3–4 across tiers and vendors via the Vercel AI Gateway
  (`ai` SDK + `@ai-sdk/gateway`; model ids like "anthropic/...",
  "openai/...", "google/..."). Temperature 0 for scored runs; fixed
  seeds where supported.
- **Metrics per condition × model × size bucket:** first-pass validity;
  task success (pass@1, pass@3-rounds); rounds-to-success; drift rate;
  id-reference failure rate; invalid-intermediate-state count (tools
  arms); total tokens and wall-clock per solved task.
- **Statistics:** same tasks through every condition → paired
  comparisons. Wilson intervals per cell; McNemar's test for each
  condition pair per model; report effect sizes, not just p-values.

## Phase 0 — PILOT FIRST (hard gate)

Before any full matrix: corpus generator + grading pipeline + a
**20-task pilot** on conditions A and C, ONE model, parity prompts.
Purpose: validate the grading end-to-end, surface harness bugs, and
produce a real cost projection for the full matrix. Budget for the pilot:
a few dollars. **STOP after the pilot and report** (pilot results + cost
projection + any design problems found) before running the full matrix
(~200 tasks × conditions × 3–4 models × 2 regimes; expect a few hundred
dollars — that spend needs explicit approval).

## Repository shape

```
BRIEF.md                 (this file — the pre-registration document)
src/
  grammar.ts             benchmark grammar (barkup) + JSON-twin schema
  twin/                  JSON validator with GrammarIssue-equivalent errors
  corpus/                generators (trees, edits, descriptions, questions)
  conditions/            one module per condition A–E (serialize, prompt,
                         apply, feedback formatting)
  harness/               runner (gateway calls, correction loop, retries,
                         rate limiting, JSONL logging), resumable by task id
  grading/               validators, nodesEqual-modulo-ids, drift diff
  stats/                 Wilson, McNemar, report tables
corpus/                  generated task sets (committed — reproducibility)
prompts/                 pre-registered prompts per condition × regime
results/                 JSONL per run (raw/ gitignored; summaries committed)
REPORT.md                findings (written last)
```

## House conventions (match the sibling repos)

- Bun + TypeScript strict + Biome (tabs); `bun test` for unit tests
  (grading + twin validator + corpus generators all need tests — a
  benchmark with an unvalidated grader measures nothing).
- fallow for code health; varlock for env (`.env.schema` committed,
  secrets in `.env.local` — NOTE: gitignore already hardened with
  `*.env.local` glob patterns; a leading-space filename once evaded an
  exact-match pattern in a sibling repo. Never commit env files.)
- Env var: `AI_GATEWAY_API_KEY` (Vercel AI Gateway).
- Conventional commits (`type: description`); never mention AI assistance
  in commits. Commit at each working increment; run tests before commits.
- linkedom for the DOM adapter (devDependency), exactly as barkup's own
  tests do.

## Deliverables

1. Working pilot (Phase 0) + report-back with cost projection. **Gate.**
2. Full matrix run + `REPORT.md`: per-hypothesis verdicts with effect
   sizes and intervals, the size-crossover chart data, cost/latency
   tables, limitations section (describer affinity, model snapshot dates,
   prompt-tuning caveats), and a reproduction section (one command to
   regenerate corpus, one to re-run, one to re-grade).
3. Everything reproducible from the committed corpus + prompts + seeds.

Prior art to read and cite for framing: Aider's edit-format benchmarks
(whole-file vs diff formats measurably change success rates) and the
Berkeley Function-Calling Leaderboard (granular tool-call reliability).
