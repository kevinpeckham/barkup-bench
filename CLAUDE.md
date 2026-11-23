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


## Fallow (a report, never a reason)

`bun run dead-code`, `bun run dupes`, `bun run health` and `bun run audit`
run Fallow (`.fallowrc.json` names the scripts and tests as entry points).
Read what it says about shared code in `src/`. It is never grounds to change
anything a study registered: prompts, conditions, corpus and graders are
fixed by their commit, and the duplication Fallow reports between study
scripts is each study carrying its own copy. Nothing gates on Fallow here.

## Agent tooling

What an agent gets in this repository is declared here, not in anyone's
personal Claude Code settings:

- `.mcp.json`: MCP servers: `varlock-docs-mcp` (Varlock's documentation: read it before changing `.env.schema` or how the environment is loaded)
- `.claude/settings.json`: the approval of those servers

Add or remove a tool by editing these files in a pull request.
