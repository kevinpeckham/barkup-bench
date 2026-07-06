# Agent prompt — barkup: update the README with benchmark findings

Copy everything below the line into an agent session running in the
barkup package repository (local checkout `~/newdev/barkup`; if the
repo you're in is named differently, e.g. barkdom, the README
structure is the same — adapt paths only).

---

You are working in the barkup repository. Your job is to update
`README.md` to reveal the findings of the barkup-bench benchmark and
make the honest case for the approach. The benchmark's authoritative
numbers are in `~/newdev/barkup-bench/REPORT.md` — verify every figure
you write against it.

Hard rules:
- Publish what the data shows. The benchmark found the whole-tree
  rewrite STRATEGY wins and the HTML FORMAT is accuracy-neutral vs an
  equal-quality JSON twin. Do not spin that into "HTML makes models
  more accurate" — it doesn't, and the README must not claim it.
- Keep the README's existing voice (short, concrete, no hype) and its
  structure; you are adding one section and adjusting one paragraph.
- `bun test` before committing. Conventional commits; never mention AI
  assistance in commits.

## Edit 1 — temper one sentence in the intro

The intro paragraph currently ends:

> HTML labels the outside of every container and closes each one by
> name — which is why LLMs are already fluent in it, and why a
> whole-tree "rewrite the markup" edit is reliable where a dozen
> granular mutation calls are not.

Replace that sentence with:

> HTML labels the outside of every container and closes each one by
> name — legible to the humans who maintain it, and the natural
> carrier for the whole-tree "rewrite the markup" edit that
> benchmarks show is reliable where a dozen granular mutation calls
> are not.

(Rationale: "LLMs are already fluent in it" implied a fluency edge
over JSON; the benchmark measured fluency parity. The rewrite
reliability claim is now measured fact and stays.)

## Edit 2 — add a "Benchmarked" section

Insert the following new section AFTER "## The four guarantees" and
before "## Quick start":

```markdown
## Benchmarked

We benchmarked the pattern instead of asserting it:
[barkup-bench](https://github.com/kevinpeckham/barkup-bench) is a
pre-registered benchmark — HTML vs an equal-strictness JSON twin ×
whole-tree rewrite vs granular mutation tools vs JSON Patch — run
across four models from three vendors (8,000 scored runs, seeds and
prompts committed before the first scored call). It publishes what it
found:

- **The whole-tree rewrite strategy wins.** +5 points task success
  over granular mutation tools overall and +33 points on multi-turn
  edits referencing nodes from the model's own earlier output
  (p < 0.0001). The tool failures concentrate in smaller models,
  which silently fail to execute follow-up edits in multi-turn tool
  conversations — a surface the rewrite interface never exposes.
- **No crossover.** Tools never overtook rewrite at any size tested
  (up to ~190 nodes). JSON Patch collapsed to 70% success on large
  trees.
- **The HTML dialect is accuracy-neutral.** Against a JSON twin with
  identical validator strictness and error quality, HTML and JSON
  rewrite tied on validity (≥99%), editing success, and reading
  accuracy. Format fluency is no longer a moat — modern models write
  both formats near-perfectly.
- **HTML is the cheaper serialization at scale**: ~30% fewer tokens
  per solved large-tree task than JSON rewrite, and rewrite overall
  used 4–5× fewer tokens than tools on small/medium trees.

Why HTML, then, if accuracy ties? Because the tie is the point: the
format costs nothing on the budgets the benchmark measures, wins the
token budget as trees grow, and keeps the one advantage no benchmark
scores — the same artifact is readable by the designer in a diff, the
reviewer in a PR, and the model in a prompt. barkup's guarantees (id
preservation, round-trip identity, structured issues built for
correction loops) are what make the winning rewrite strategy safe to
operate in production.
```

## Edit 3 — "Used in production" / closing pointer (optional, judgment)

If the "Used in production" or credits section links the article, add
a sibling link to the benchmark repo and the results write-up
(https://www.lightningjar.com/blog/barkup-bench-results — confirm the
slug exists before linking; if the post isn't live yet, link the
benchmark repo's REPORT.md instead).

## Verify before committing

- Every number matches `~/newdev/barkup-bench/REPORT.md`.
- `bun test` passes; README renders cleanly (check heading levels).
- Suggested commit: `docs: add benchmark findings to README`
