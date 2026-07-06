# CLAUDE.md

Guidance for agent sessions in this repository.

## Mission

**Read `BRIEF.md` first — it is the mission and the pre-registration
document for this benchmark.** Start with Phase 0 (the 20-task pilot) and
STOP at the gate it describes before spending on the full matrix.

## What this is

barkup-bench — a benchmark measuring the barkup approach (HTML dialect +
whole-tree rewrite) against conventional approaches (JSON + granular
mutation tools) for LLM agents editing typed trees. Companion to
`@kevinpeckham/barkup` (sibling checkout at `~/newdev/barkup`; read its
`docs/architecture.md`). Author: Kevin Peckham. MIT.

## Hard rules

- **Scientific integrity beats a good story.** Publish what the data
  shows. Never tune prompts/conditions after looking at scored results —
  prompts are pre-registered by commit before the first scored run.
- **The JSON twin must be as good as the barkup side** (validator
  strictness AND error-message helpfulness). If in doubt, over-invest in
  the twin.
- **Spend gates:** pilot ≈ a few dollars is fine; the full matrix (a few
  hundred dollars of API spend) requires Kevin's explicit go-ahead.
- **Graders get unit tests.** A benchmark with an unvalidated grader
  measures nothing.
- Corpus generation is seeded and committed — every result must be
  reproducible from the repo alone (plus an API key).

## Commands & conventions

Bun + TypeScript strict + Biome (tabs) + fallow + varlock — mirror the
sibling repos (`~/newdev/barkup` is the cleanest reference). `bun test`
before every commit. Conventional commits; never mention AI assistance in
commits. Env: `AI_GATEWAY_API_KEY` in `.env.local` (gitignored — never
commit env files; note the gitignore's glob patterns exist because a
leading-space filename once evaded an exact match in a sibling repo).
