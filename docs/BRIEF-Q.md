# Addendum brief — Study Q: fan-out edits (does the shipped recipe survive multiple targets?)

**Pre-registration, committed before any scored Q run.** Every task
in Studies A through P edits one node. Real requests fan out: "set
maxLength to 80 on every text-atom inside the section named atlas."
Study N's search-then-patch recipe is now shipped and documented
with parameters tuned on single targets (top-5 search, one target
id per instruction), so fan-out is the sharpest external-validity
stress available: the search tool's 5-result cap can be *smaller
than the target set*, and a correct answer may require the model to
discover the winning strategy on its own (search the *container*,
read the target ids off its placeholder children) rather than
retrieve every target directly. Whether models find that strategy
is the study.

## Corpus (new, committed before any scored call)

`corpus/fanout.json`: 45 tasks (15 per size bucket, xl/xxl/xxxl)
built on the unchanged size-extension trees, seed **20260710**, two
pre-registered kinds:

- **set-attribute-all** — set one attribute to one value on every
  node of type T inside container C (types: text-atom, image-atom,
  block; attribute/value drawn from the bench grammar's declared
  attributes by seeded rng).
- **remove-all** — remove every node of type T inside container C
  (types restricted to text-atom, image-atom, widget-slot, which
  cannot nest in this grammar, so removals are order-independent).

The generator validates every task: container C is uniquely
describable by the Study L referring-expression machinery (resolver
proves uniqueness), the target set is every descendant of C with
type T, target count ≥ 2 (no cap; counts are a measured variable),
no target is an ancestor of another, and the instruction contains no
node ids (regex-checked). The expected tree is computed by a
committed, unit-tested fan-out applier. Instruction template:
`Set "<key>" to <value> on every <T> inside <container ref>.` /
`Remove every <T> inside <container ref>.`

## Conditions (all F patch dialect, shipped applier, id-free instructions)

- **Q-view** — the retrieval oracle: minimal JSON view focused on
  the container plus every target id, Study I's FT prompt. Isolates
  multi-op patch *mechanics* from retrieval.
- **Q-full** — the whole tree in the prompt (F parity prompt, as
  LG-full). The in-context grounding ceiling.
- **Q-search** — the shipped recipe exactly as benchmarked in Study
  N and shipped in barkup 0.4: minimal root view + `find_nodes`
  (top 5, zero-score exclusion, same 16-step budget), same search
  prompt. Deliberately NOT retuned for fan-out — the point is to
  test what we shipped.

## Grading (pre-registered, two levels)

- **Task success (primary):** `equalModuloNewIds` against the
  expected tree — all targets edited, nothing else touched.
- **Failure anatomy (secondary, offline):** per-task **coverage**
  (fraction of targets correctly edited in the final tree) and
  **collateral** (any non-sanctioned existing node changed, via the
  Study L changed-ids machinery). Failure classes: partial (some
  targets), collateral (wrong nodes touched), invalid (no valid
  patch). Analysis bins by target count (2–3, 4–6, 7+).

## Models and cells

`anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash`.
45 tasks × 3 conditions × 2 models = **270 runs**.

## Pre-registered hypotheses (held loosely)

- **Q-H1 (mechanics):** with retrieval solved (Q-view), multi-op
  anchored patches hold near Study I's single-edit levels, and
  success does not collapse with op count. If even Q-view degrades
  at 7+ targets, anchored-patch guidance gains an op-count boundary
  regardless of retrieval.
- **Q-H2 (the recipe under stress, primary comparison):** Q-search
  vs Q-full, paired McNemar per model. Directional prediction, held
  loosely: frontier models discover the container-search strategy
  and stay non-inferior; the named risk is the opposite — the top-5
  cap hides targets, producing partial edits, and the cheap model
  fails to adapt. Either result is publishable; one extends the
  0.4 docs, the other bounds them.
- **Q-H3 (failure shape):** where Q-search fails, partial coverage
  (missed targets) dominates over collateral — retrieval misses,
  not misgrounding. Search-call counts reported (single-target
  median was 1; fan-out should demand more).

## Decision rule

If Q-search is non-inferior to Q-full per model (delta no worse
than −5 pp, p > 0.05), the barkup 0.4 recipe docs extend their claim
to fan-out edits, citing this study. If it fails, the docs and
REPORT get an explicit fan-out boundary (with the coverage anatomy
and, if the container strategy is the differentiator, a documented
workaround: focus the view on the container, or raise the search
limit — as a *candidate* for a follow-up, not a tuned re-run). If
Q-view itself degrades with op count, that boundary attaches to
anchored patches generally, and ships too.

## Protocol

`maxOutputTokens: 60000`, temperature 0, 1 attempt + ≤3 correction
rounds (structured issues verbatim), resumable JSONL
(`results/raw/studyq-<model>.jsonl`), `cacheReadTokens` recorded,
mechanical-failure rules as in Study H. **Expected spend $15–30**
(one arm carries full trees); abort past $60.

Honesty rules unchanged: this brief, the corpus generator with its
uniqueness/non-nesting/id-leak validations, the fan-out applier and
its tests, and the coverage grader are all committed before the
first scored call; results publish whatever they show.
