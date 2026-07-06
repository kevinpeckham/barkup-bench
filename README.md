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
JSON Patch collapses on large trees. [BRIEF.md](BRIEF.md) is the
pre-registration (hypotheses, conditions, protocol, honesty rules).

MIT © Kevin Peckham
