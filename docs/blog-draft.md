# We Benchmarked It: What Held Up in "HTML as a Native Data Format for LLMs" — and What Didn't

*Companion to [HTML as a Native Data Format for LLMs](https://www.lightningjar.com/blog/ast-as-html). Draft.*

Six months ago I made an argument and a promise. The argument: typed
trees should be authored as an HTML dialect and edited by whole-tree
rewrite, because models are fluent in markup and because granular
mutation tools invite granular failure. The promise: we'd benchmark
it, publish the design before running it, and share the findings
either way, good or bad.

The findings are in. Some of the argument survived contact with the
data. Some of it didn't. And the part that survived isn't quite the
part I expected.

## The short version

**The whole-tree rewrite strategy wins. The HTML format, by itself,
doesn't.**

Across 8,000 scored runs — 200 procedurally generated tasks, five
conditions, four models from three vendors, two prompt regimes, every
prompt and seed committed before the first scored call — rewriting the
whole artifact beat granular mutation tools by 5 points overall and by
**33 points** on multi-turn tasks where the agent had to reference a
node from its own earlier output. But a scrupulously fair JSON twin of
our setup — same grammar, same validator strictness, same error
quality — rewrote trees just as accurately as the HTML dialect did.
The win belongs to the *strategy*. The format is a wash on accuracy,
and earns its keep elsewhere.

That's a mixed result for the article, and exactly the kind we
committed to publishing.

## How we kept it honest

A benchmark like this is easy to rig by accident. The conventional arm
gets a lazy validator, terse error messages, a schema the model has to
guess at — and the "novel" approach wins by forfeit. So the JSON twin
was built as the single most important fairness artifact in the
project: a validator exactly as strict as barkup's, emitting the same
issue codes, the same message wording, the same human-readable paths,
cross-checked against an independently compiled JSON Schema in the
test suite. The mutation-tool arm got real tools with realistic
errors. The JSON Patch arm got a battle-tested RFC 6902 implementation
so it could never lose to a bug in our patch engine.

Five conditions, one grammar semantics: **A** HTML + whole-tree
rewrite (the barkup approach), **B** JSON + whole-tree rewrite, **C**
JSON + granular mutation tools (the textbook approach), **D** HTML +
the same tools, **E** JSON Patch. Hypotheses, prompts, corpus seeds,
and grading were pre-registered by commit. Graders have their own unit
tests. Models: claude-sonnet-4.5, gpt-5.4, gemini-3.5-flash,
claude-haiku-4.5, temperature 0. Total damage: about $225 of API
spend.

## Claim by claim

**"LLMs have deep, pre-trained fluency in HTML" — true, but no longer
discriminating.** First-pass validity was ≥ 99.3% in every arm of
every model, HTML and JSON alike. In 2026, frontier and mid-tier
models emit both formats essentially perfectly at these sizes. Format
fluency is real; it just stopped being a moat.

**"Ask for an inventory of an HTML tree and it reads the labels" —
not supported.** On exact-answer structural reading questions, HTML
and JSON serializations tied: 87.1% vs 87.9%. The labels-on-the-
outside intuition did not show up as measurable reading accuracy, at
least up to ~190-node trees.

**"Granular tools invite granular failure" — strongly supported, with
a mechanism I didn't predict.** Whole-tree rewrite beat mutation tools
+5.3pp overall (p < 0.0001) and +33pp on the multi-turn reference
tasks. Here's the surprise: we logged *zero* stale-id failures. The
referenced ids always survived. What actually happened, in every one
of the 110 failures we audited, is that the smaller models simply
never executed the follow-up edit — they made unrelated tool calls,
or inserted a duplicate node instead of mutating the one they'd just
created, and then declared the job done. Multi-turn tool-calling is
where small models quietly fall apart. A whole-artifact rewrite never
exposes that surface: the edit is coherent or it's rejected, exactly
as the article argued — for a reason the article didn't know about.

**And the crossover never came.** I expected rewrite to win on small
trees and lose to tools as trees grew and rewriting got expensive and
error-prone. It didn't reverse. Rewrite led at every size we tested,
up to ~190 nodes. The gap narrowed at the top of the range, so a
crossover may exist somewhere beyond it — but we didn't find it.

**"Fewer tokens burned" — supported, with an asterisk.** Rewrite
solved small and medium tasks with 4–5× fewer total tokens than tools
(which re-send a growing conversation on every call). At 150 nodes
it was still ahead. The asterisk: rewrite tokens are output tokens,
which cost ~5× more each, and providers increasingly cache the tool
arms' repeated inputs — so the *dollar* gap is narrower than the
token gap. Here, finally, the format itself matters: the HTML
dialect's terse attribute encoding made A about 30% cheaper than
JSON rewrite on large trees (15.6k vs 23k tokens per solved task).

**One finding we weren't even looking for:** JSON Patch — the common
middle ground — held its own through medium trees and then collapsed
to 69.6% success at 150 nodes. Index-based paths (`/children/3/
children/0/attributes/…`) are exactly the kind of positional
arithmetic you shouldn't make a language model do at scale.

**Who needs this advice?** The rewrite-vs-tools gap is a small-model
phenomenon. gpt-5.4 and claude-sonnet-4.5 handled granular tools
about as well as rewrite. claude-haiku-4.5 and gemini-3.5-flash were
10–11 points worse with tools than with rewrite. If your agents run
on frontier models, either interface works today. If cost pressure
ever pushes you down-tier — and it always eventually does — the
rewrite interface is the one that degrades gracefully.

## So why are we still authoring in HTML?

Because accuracy was never the only budget, and the benchmark showed
the format costs nothing on the budgets it measured.

The article's core claim about legibility — "legibility for the human
author and fluency for the model are the same property" — was only
half testable, and the measurable half tied. What the benchmark can't
score is the half we feel daily: a designer can read
`<div data-type="text-atom" data-name="headline" data-max-length="60">`
in a diff, in a code review, in a CMS debug view, without
reconstructing a bracket stack in their head. One artifact serves the
person and the agent. JSON-with-a-good-validator matches HTML for the
model; it does not match it for the human standing next to the model.

Add the measured 30% token savings on large trees, identical accuracy,
identical validity, and the guarantees a purpose-built codec gives you
for free — byte-for-byte id preservation, round-trip identity,
structured issues designed to be pasted back into a correction loop —
and HTML-as-AST comes out of the benchmark not vindicated as magic,
but validated as a sound default with zero measured downside and one
unmeasured, decisive upside: people can read it.

What I'd say differently after the data: don't sell HTML as making
your agents smarter. Sell whole-artifact rewrite as making your
pipeline robust — especially below the frontier — and HTML as making
the same artifact legible to everyone who has to live with it.

## The receipts

Everything is open: pre-registered brief, corpus generators (seeded,
committed), the fairness twin with its parity tests, the harness, raw
analysis, and the report — [github.com/kevinpeckham/barkup-bench](https://github.com/kevinpeckham/barkup-bench).
One command regenerates the corpus; one re-runs the matrix; one
re-grades. If you run it on other models or bigger trees — the
crossover question past 190 nodes is genuinely open — I'd love to see
the numbers, whichever way they point.
