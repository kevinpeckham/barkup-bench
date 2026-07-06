# Agent prompt — slx-replicator: fold the benchmark findings into docs + memory

Copy everything below the line into an agent session running in
`~/newdev/slx-replicator`.

---

You are working in the slx-replicator repository, which uses
`@kevinpeckham/barkup` in production (template grammar in
`src/lib/utils/templateBarkupGrammar.ts`; templating docs under
`docs/`). The barkup approach has now been benchmarked
(barkup-bench, July 2026). Your job is to fold the findings into this
repo's documentation and agent memory so future design decisions here
are made with the data, not the folklore.

Authoritative source: `~/newdev/barkup-bench/REPORT.md`. Verify every
number you write against it. Do not paraphrase numbers from this
prompt without checking.

## The findings that matter to THIS repo

1. **Whole-tree rewrite is validated as the agent-editing interface.**
   +5.3pp task success over granular mutation tools overall, +33pp on
   multi-turn edits that reference nodes from the model's own prior
   output (p < 0.0001), and no size at which tools overtook rewrite
   (tested to ~190 nodes). The current parse-validate-rewrite design
   is the measured best practice — keep it.
2. **Never migrate the template editor to granular mutation tools or
   JSON Patch without re-testing.** Tools fragility concentrates in
   smaller/cheaper models (haiku-4.5: 25% multi-turn success with
   tools vs 85% with rewrite; gemini-3.5-flash: 2.5% vs 77.5%) — the
   failure mode is the model silently not executing follow-up edits.
   JSON Patch collapses to ~70% on large trees. If cost pressure ever
   pushes the AI features down a model tier, the rewrite interface is
   the one that degrades gracefully.
3. **The HTML dialect is accuracy-neutral, not accuracy-magic.**
   Against an equal-strictness JSON twin, HTML and JSON tied on
   validity (≥99%), editing success, and reading accuracy. The
   justification for HTML here is human legibility, ~30% fewer tokens
   than JSON rewrite on large trees, and barkup's codec guarantees —
   not model fluency. Docs should not claim models are "better at"
   HTML.
4. **The correction loop earns its keep.** First-pass validity is
   ≥99% and the issues-verbatim retry loop recovered most of the rest;
   keep returning barkup's structured issues to the model unedited.

## Task 1 — update the docs

Read `docs/templating-system.md`, `docs/ai-chat.md`,
`docs/doc-editor-roadmap.md`, and `docs/blog-draft-ast-as-html.md`
first, then:

- Where any of them justify or explain the barkup/whole-tree-rewrite
  design, add a short "benchmarked" note with the relevant numbers and
  a link to https://github.com/kevinpeckham/barkup-bench (REPORT.md).
  Fit the surrounding style; a few sentences per doc, not an essay.
- If `doc-editor-roadmap.md` (or any doc) floats granular mutation
  tools or JSON Patch as a future direction, annotate it with finding
  2 rather than deleting it — the roadmap should record why that path
  is now known to be risky below the frontier tier.
- `docs/blog-draft-ast-as-html.md` is a stale local draft of the
  now-published article; add a one-line header pointing to the live
  article and the benchmark, or remove it if git history makes it
  redundant — your call after looking at it.

## Task 2 — update agent memory (as appropriate)

- Add a concise entry to `CLAUDE.md` (the durable, versioned memory
  for agents in this repo) under an appropriate heading — e.g. a
  two-to-four-line "Template editing: benchmarked design decisions"
  note capturing findings 1–3 and the do-not-migrate-without-retesting
  rule. CLAUDE.md is read on every session, so keep it tight.
- If this session has a persistent memory directory configured, store
  the same facts there per its conventions (type: project). If not,
  CLAUDE.md alone is correct — do not invent a memory system.

## Rules

- Numbers must match `~/newdev/barkup-bench/REPORT.md`.
- Don't restructure existing docs; annotate them.
- Run the repo's checks before committing (`bun run check`,
  `bun lint`, `bun run test` — see CLAUDE.md).
- Conventional commits; never mention AI assistance in commits.
