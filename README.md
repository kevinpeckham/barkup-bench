# barkup-bench

A benchmark measuring the [barkup](https://github.com/kevinpeckham/barkup)
approach — HTML as an authoring dialect for typed trees, edited by
whole-tree rewrite — against conventional approaches (JSON + granular
mutation tools) for LLM agents.

Companion to the article
[HTML as a Native Data Format for LLMs](https://www.lightningjar.com/blog/ast-as-html)
and the [`@kevinpeckham/barkup`](https://www.npmjs.com/package/@kevinpeckham/barkup) package.

**Status: complete.** See [REPORT.md](REPORT.md) for the findings — TL;DR:
the whole-artifact rewrite strategy wins (+5–7pp over granular tools,
+33pp on multi-turn id-referencing tasks); the HTML dialect itself is
neither an advantage nor a handicap against an equal-quality JSON twin;
JSON Patch collapses on large trees — and the pre-registered addendum
condition F (id-anchored patches, [docs/BRIEF-F.md](docs/BRIEF-F.md))
matches rewrite reliability at the lowest cost measured, confirming the
collapse was positional path arithmetic. [BRIEF.md](BRIEF.md) is the
pre-registration (hypotheses, conditions, protocol, honesty rules).

<picture>
	<source srcset="docs/img/crossover-success-dark.svg" media="(prefers-color-scheme: dark)" />
	<img src="docs/img/crossover-success-light.svg" alt="Line chart: task success rate versus tree size for six conditions. Whole-tree rewrite and id-anchored patches stay on top at every size; RFC 6902 JSON Patch drops to 69.6% at about 150 nodes." width="960" />
</picture>

<picture>
	<source srcset="docs/img/reference-stability-dark.svg" media="(prefers-color-scheme: dark)" />
	<img src="docs/img/reference-stability-light.svg" alt="Dot plot: multi-turn reference-edit success for four models across five conditions. gpt-5.4 and sonnet-4.5 score high everywhere; haiku-4.5 and gemini-3.5-flash drop to 2.5–32.5% in the mutation-tool conditions." width="960" />
</picture>

## Reproduce

```sh
bun install                                  # needs AI_GATEWAY_API_KEY in .env.local
bun test                                     # graders, twin validator, corpus generators
bun run corpus                               # regenerate corpora from committed seeds (byte-identical)
bun run matrix                               # full matrix (~$225 of API spend); resumable
bun run scripts/analyze.ts results/raw/main-*.jsonl
```

Everything scored is reproducible from the committed corpus, prompts,
and seeds — see the reproduction section of [REPORT.md](REPORT.md).

MIT © Kevin Peckham
