# barkup-bench

An ongoing, pre-registered benchmark series on a narrow question with
broad consequences: **what is the most reliable way to let an LLM
agent edit typed trees** (page layouts, document templates, CMS
content)? It began as a single study comparing the
[barkup](https://github.com/kevinpeckham/barkup) approach — HTML as
an authoring dialect, edited by whole-tree rewrite — against JSON +
granular mutation tools, and grew into thirty-two studies covering
interfaces, tree size, partial context, retrieval, session memory,
multi-target edits, and (in a separately-graded track) qualitative
rewrites. Every utility in the
[`@kevinpeckham/barkup`](https://www.npmjs.com/package/@kevinpeckham/barkup)
package traces back to a study here.

**Status: active research series.** The main matrix and Studies F–AF
are complete and published in [REPORT.md](REPORT.md); new studies are
added as results demand. Every study is pre-registered by commit
before its first scored run ([BRIEF.md](BRIEF.md) plus per-study
`docs/BRIEF-*.md`), gates are stated in advance, and results publish
whatever they show — the series so far includes two major corrections
and three self-refutations, kept deliberately.

The findings also run as standing infrastructure: the
[regression-gate suite](docs/REGRESSION.md) packages the series'
sharpest shipped-guardrail constructions as ten pass/fail gates
re-runnable against any gateway model id
(`bun run scripts/regress.ts --model <id>`, ≈$1–13 depending on
tier) — model-swap CI for teams shipping the measured stack.
Validated 10/10 green against claude-opus-4.8, the downstream
surfaces' shipped tier.

## The arc, in one paragraph

With correct conversation history, every id-stable editing interface
(whole-tree rewrite, mutation tools, id-anchored patches) performs
within a few points of the others at benchmark sizes — the dramatic
gaps we first reported were manufactured by a silent SDK history
defect (Study G, [vercel/ai#16840](https://github.com/vercel/ai/issues/16840)).
Above ~300 nodes only **id-anchored patches** hold for both model
tiers (H). Patches barely need to see the tree: a ~1.5k-token
**focused view** matches full-tree accuracy when the app knows the
target ids (I/J) — provided the focus covers **every node the
request mentions**: an edit that must read a second node against a
target-only view never errors, it silently invents the value (U:
0/90, all failures plausible guesses; both-nodes views are perfect
at 25× less input than the full tree), a fresh view per turn keeps 12-edit sessions from
drifting (K), and when the app doesn't know the ids, a skeleton view
plus one **content-search tool call** grounds human-style requests at
oracle-level accuracy (L/N — navigation and off-the-shelf embeddings
both fail there). Sessions turn out not to need memory at all: two
canned **worked examples** in the system prompt replace conversation
history outright (M/O/P), a result that holds through 36-edit
sessions at 5 to 6× less input than keeping history (S) — with one
measured boundary: requests that reference earlier conversation
("the codename we settled on") fail stateless by construction, and
an app-maintained **memo** of declared facts restores full
history-parity at 1.02× stateless cost (T) — and the AGENT can be
trusted to write that memo itself: delegated extraction ties the
oracle on all three models tested, retractions included, with no
laziness even when a history window makes the memo redundant (W). The
last discourse gap closed the same way: follow-ups that point at the
previous edit ("undo that") fail carrier-less editors 0/144 with
silent guesses, and a one-line app-side **last-edit echo** restores
history-parity at half the cost, beating history outright on the
production tier (X). And the memo mechanism survives contact with
human speech: casually phrased declarations, buried rules, and
conversational retractions extract at exact parity with announced
ones, with zero false notes from 432 chatter baits (Y). Standing
context — the brand pack shipped with every request — simply works at
production sizes: exact facts copied past three same-schema
distractors, styleguide rules applied unprompted at any position,
zero contamination in 324 cells, and the shipped cached-system layout
cutting effective input cost by a quarter to nearly half; the one
production hazard found is **spec conflict** — models never break a
conflicted spec, they pick a reading (Z) — and the pre-registered
follow-up refuted our own first take on it: strictness is NOT a
capability gradient (the confirmation study inverted it), a priority
meta-rule does not reliably fix conflicts, softening "always" to
"generally prefer" does, and restating a rule in the memo steers
interpretation so hard it can trample the user's explicit
countermand (AA) — a footgun closed the next day: one precedence
sentence INSIDE the memo block, at the point of injury, restored
every trampled countermand (opus 0/12 → 12/12) at zero steering
cost, where the same sentence class buried in a styleguide had
moved nothing (AB). For qualitative goals the
split sharpens to a slogan: **views carry values, memos carry goals**
(V, judge-graded) — a model shown the node where a goal lives reads
it but writes measurably less focused prose than one told the goal
outright — and no prompt ceremony converts one into the other:
forced to restate the read goal in its own words before rewriting,
every model complied perfectly and then orbited the goal anyway,
zero wins in ninety judged comparisons (AF, judge-graded), so where
a goal comes from matters more than whether the model says it
aloud. And the series' recurring villain — the silent guess — turned out
to be a protocol defect, not a model property: offered a registered
escape hatch (one NEED-INFO sentence, or an ask_user tool), every
model asked on every provably-unsolvable cell and never once asked
on a solvable one, 810/810, naming the exact missing node each time —
the models always saw the gap; nothing had ever told them asking was
allowed (AC). The whole core stack was then re-run on the tier the
downstream surfaces actually ship, claude-opus-4.8, and every gate
passed at or above the top of the prior bands — with one new fact:
the frontier tier needs no worked examples at all (bare stateless
sessions 240/240), so the examples block is insurance for the tiers
below it (AD). The honest boundary is **fan-out** ("change
every X inside Y"): one prompt asking for N edits delivers roughly
half of N under every strategy tested — opus raises the floor to
80–89% but still leaves one in nine bulk edits incomplete (AD) — so
the fix is app-side **decomposition** into single-target edits,
which measured 90/90 tasks with 674/674 subtasks (Q/R).

## Study index

| Study | Question | Answer | Brief |
|---|---|---|---|
| Main (A–E) | Rewrite vs tools vs patches, HTML vs JSON | Parity under corrected history; format is accuracy-neutral | [BRIEF.md](BRIEF.md) |
| F | Id-anchored patches | Match rewrite at the lowest cost measured | [BRIEF-F](docs/BRIEF-F.md) |
| G | The original gaps | An SDK history footgun, not the interfaces | [BRIEF-G](docs/BRIEF-G.md) |
| H | 300–1000 nodes | Crossover found: anchored patches only | [BRIEF-H](docs/BRIEF-H.md) |
| I/J | Focused views (JSON/HTML) | Free when ids are known; scale with depth, not size | [BRIEF-I](docs/BRIEF-I.md) · [BRIEF-J](docs/BRIEF-J.md) |
| K | 12-edit sessions | Fresh view per turn: no drift, cheapest policy | [BRIEF-K](docs/BRIEF-K.md) |
| L | Grounding without ids | Full-tree read costs 7–9 pp; navigation is a trap; lexical floor 60% | [BRIEF-L](docs/BRIEF-L.md) |
| M | Stateless sessions | Refuted — history contributed something | [BRIEF-M](docs/BRIEF-M.md) |
| N | The retrieval ladder | One search-tool call = oracle-level grounding; embeddings add nothing | [BRIEF-N](docs/BRIEF-N.md) |
| O | Positional views | Positions don't rescue statelessness — not arithmetic | [BRIEF-O](docs/BRIEF-O.md) |
| P | Synthetic history | Two worked examples replace the whole conversation | [BRIEF-P](docs/BRIEF-P.md) |
| Q | Fan-out edits | Break every strategy, even oracle retrieval; models invert | [BRIEF-Q](docs/BRIEF-Q.md) |
| R | Fan-out fixes | Prompt tricks fail; decomposition is perfect (90/90, ⅓ cost) | [BRIEF-R](docs/BRIEF-R.md) |
| S | 36-edit sessions | Both surviving recipes hold; stateless wins at 5–6× less input | [BRIEF-S](docs/BRIEF-S.md) |
| T | Conversation-carried context | Stateless fails all 160 callbacks; a memo restores history-parity at 1.02× cost | [BRIEF-T](docs/BRIEF-T.md) |
| U | Document-carried dependencies | Target-only views silently invent values (0/90); both-nodes views are perfect at 25× less input | [BRIEF-U](docs/BRIEF-U.md) |
| V | Qualitative rewrites (judge-graded) | Views carry values, memos carry goals: the memo ties explicit instructions; reading the goal from the view loses 117/120 | [BRIEF-V](docs/BRIEF-V.md) |
| W | Who writes the memo? | Agent-maintained extraction ties the oracle (recall 36/36, zero noise); the laziness hypothesis is refuted; first Opus tier data | [BRIEF-W](docs/BRIEF-W.md) |
| X | Edit-anaphora | "Undo that" fails carrier-less editors 0/144, all silent guesses; a one-line last-edit echo ties history at half the cost | [BRIEF-X](docs/BRIEF-X.md) |
| Y | Naturalistic extraction | The memo survives human speech: casual phrasing at exact parity, zero false notes from 432 chatter baits | [BRIEF-Y](docs/BRIEF-Y.md) |
| Z | Standing context | The brand pack works: facts and rules 216/216 per arm, zero contamination; cached layout −25 to −43% input cost; conflicted specs resolve into clean readings (strictness claim corrected by AA) | [BRIEF-Z](docs/BRIEF-Z.md) |
| AA | Conflict resolution | Z's strictness-scales-with-capability claim refuted (opus LEAST literal, 0/24); meta-rule fails, soft phrasing works, memo steering replicates but tramples explicit user countermands | [BRIEF-AA](docs/BRIEF-AA.md) |
| AB | The precedence clause | Validated: one sentence inside the memo block ends countermand trampling (opus 0/12 → 12/12, p = 0.0005) at zero steering cost — placement, not phrasing, is why styleguide meta-rules fail | [BRIEF-AB](docs/BRIEF-AB.md) |
| AC | Ask versus guess | Silence is a protocol defect: with an escape hatch, 270/270 asks on unsolvable cells (vs 0/270 base), zero false asks, zero solve cost — every ask names the exact missing node | [BRIEF-AC](docs/BRIEF-AC.md) |
| AD | The Opus confirmation | The core stack transfers to the shipped tier: dialect 194/200 (best F ever), views 90/90, search at the oracle bound, sessions perfect — and bare-stateless is ALSO perfect, so worked examples are sub-frontier insurance; fan-out floor rises to 80–89% but the decomposition fence stands | [BRIEF-AD](docs/BRIEF-AD.md) |
| AE | Hatch calibration + resume | Zero interrogation tax on clear requests (0/90 false asks) and the ask→answer loop closes 135/135 — but ambiguity detection is a TIER SPLIT: opus asks 15/15 on two-referent requests naming both ids; sonnet edits both, gemini coin-flips, 1/15 asks each — the shipped hatch catches absence, not ambiguity, below the frontier | [BRIEF-AE](docs/BRIEF-AE.md) |
| AF | Restate-before-rewrite (Track 2, judge-graded) | The inferred clause, measured: forced restatement does NOT rescue view-read goals (0 wins in 90, compliance perfect, models restate the thesis then orbit it anyway) — where a goal comes from beats saying it aloud; the shipped memo keeps parity, the clause itself measures neutral-to-whisper-negative and is filed for removal | [BRIEF-AF](docs/BRIEF-AF.md) |

The blog series narrates the arc for humans, and
[The Builder's Playbook](https://www.lightningjar.com/research/barkup-bench/playbook)
distills the findings into ten action items with code examples for
teams shipping document-editing agents. The current capstone is
[Hand It Everything It Needs](https://www.lightningjar.com/blog/hand-it-everything-it-needs)
(the full architecture at twenty-three studies); the historical hub is
[Stable IDs Are All You Need](https://www.lightningjar.com/blog/stable-ids-are-all-you-need),
and it all began with
[HTML as a Native Data Format for LLMs](https://www.lightningjar.com/blog/ast-as-html).

<picture>
	<source srcset="docs/img/crossover-success-dark.svg" media="(prefers-color-scheme: dark)" />
	<img src="docs/img/crossover-success-light.svg" alt="Line chart: task success rate versus tree size for six conditions. Whole-tree rewrite and id-anchored patches stay on top at every size; RFC 6902 JSON Patch drops to 69.6% at about 150 nodes." width="960" />
</picture>

<picture>
	<source srcset="docs/img/reference-stability-dark.svg" media="(prefers-color-scheme: dark)" />
	<img src="docs/img/reference-stability-light.svg" alt="Dot plot: multi-turn reference-edit success for four models across five conditions. gpt-5.4 and sonnet-4.5 score high everywhere; haiku-4.5 and gemini-3.5-flash drop to 2.5–32.5% in the mutation-tool conditions." width="960" />
</picture>

*(Charts are from the corrected main matrix; per-study tables live in
`results/analysis-*.txt` and the REPORT addenda.)*

## Reproduce

```sh
bun install                                  # needs AI_GATEWAY_API_KEY in .env.local
bun test                                     # graders, twin validator, corpus generators, worked examples
bun run corpus                               # regenerate corpora from committed seeds (byte-identical)
bun run matrix                               # full main matrix (~$225 of API spend); resumable
bun run scripts/run-study-<x>.ts             # any addendum study (resumable; a few dollars each)
bun run scripts/analyze-study-<x>.ts         # its committed analysis
```

Everything scored is reproducible from the committed corpora,
prompts, and seeds; graders are unit-tested (277 tests); scored runs
are resumable JSONL keyed by (task, condition, model). See the
reproduction section of [REPORT.md](REPORT.md), which also documents
the correction, the audits, and every disclosed protocol note. If you
reproduce, extend, or refute any of this, we want the issue.

MIT © Kevin Peckham
