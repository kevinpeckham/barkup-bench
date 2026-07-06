# Agent prompt — lj-website: publish benchmark results into the article

Copy everything below the line into an agent session running in
`~/newdev/lj-website`.

---

You are working in the lj-website repository (SvelteKit). Your job is
to update the published article **"HTML as a Native Data Format for
LLMs"** (`src/lib/content/blog/ast-as-html.md`, live at
`/blog/ast-as-html`) with the results of the barkup-bench benchmark,
and to publish the companion results post.

Context you can read on this machine:
- Benchmark findings: `~/newdev/barkup-bench/REPORT.md` (authoritative
  numbers) and `~/newdev/barkup-bench/results/analysis-main.txt`.
- Companion post draft: `~/newdev/barkup-bench/docs/blog-draft.md`.
- Figures, ready to embed: `~/newdev/barkup-bench/docs/img/` — three
  charts (`crossover-success`, `reference-stability`,
  `tokens-per-solved`), each as SVG and 2× PNG in `-light` and `-dark`
  variants. Prefer the SVGs if the site supports them; serve the
  light/dark pair via `<picture>` + `prefers-color-scheme` (or the
  site's own theme mechanism). Place the crossover chart and the
  reference-stability chart in the companion post at minimum; the
  tokens chart fits the cost section. Regenerate anytime with
  `bun run scripts/render-charts.ts` in barkup-bench.

Hard rules:
- Scientific integrity beats a good story. Do not soften, round up, or
  spin any number. Every claim you add must match REPORT.md exactly.
- Do not rewrite the original article's voice or restructure it; the
  original text stands as the historical argument. You are adding an
  update and lightly annotating claims the data spoke to.
- Match the site's existing markdown/frontmatter conventions (look at
  the file and one other post before editing).
- Conventional commits; never mention AI assistance in commits.

## Task 1 — add an update section to the article

Insert a new section immediately AFTER the section "A Note on
Evidence" (which promised the benchmark), titled:

### Update (July 2026): the benchmark results are in

Content (adapt heading level/formatting to the file's conventions, keep
the text substantively as written):

> We ran the benchmark we promised — pre-registered, five conditions
> (HTML vs an equal-strictness JSON twin, whole-tree rewrite vs
> granular mutation tools vs JSON Patch), four models from three
> vendors, 8,000 scored runs, every prompt and seed committed before
> the first scored call. Full report and code:
> [barkup-bench](https://github.com/kevinpeckham/barkup-bench).
>
> What held up: **whole-tree rewrite beat granular mutation tools** —
> +5.3 points overall (p < 0.0001) and +33 points on multi-turn tasks
> where the agent edits a node it created earlier. The failures were
> not stale ids; smaller models simply failed to execute follow-up
> edits in multi-turn tool conversations. The predicted "tools win on
> big trees" crossover never appeared up to ~190 nodes. JSON Patch
> collapsed to 70% success on large trees. And rewrite solved
> small/medium tasks with 4–5× fewer tokens than tools.
>
> What didn't: **the HTML dialect itself was accuracy-neutral.**
> Against a JSON twin with identical validator strictness and error
> quality, HTML and JSON tied on first-pass validity (≥99% everywhere
> — modern models write both formats essentially perfectly), tied on
> editing success, and tied on reading accuracy. The one place the
> format measurably mattered: cost — HTML's terser encoding was ~30%
> cheaper than JSON per solved large-tree task.
>
> So the honest, post-data version of this article's thesis: the
> *strategy* — whole-artifact rewrite over a validating codec — is
> what makes agent editing robust, especially below the frontier
> tier. The HTML dialect costs nothing on accuracy, saves tokens at
> scale, and keeps its unmeasured, decisive advantage: the same
> artifact stays legible to the humans who review, diff, and debug
> it. We'd still choose it. We'd just sell it differently — and now
> we can say why with numbers. Longer write-up:
> [We Benchmarked It](/blog/barkup-bench-results).

## Task 2 — three inline annotations

Make these minimal edits where the listed claims appear. Keep each
original sentence; append the bracketed update in the article's
established aside/footnote style (if the article has no such style,
use an italicized parenthetical starting with "*Update, July 2026:*").

1. Where the article says models reconstruct JSON inventories but
   "read the labels" of HTML trees → append: *Update, July 2026: this
   one didn't survive the benchmark — measured reading accuracy tied
   across formats (87.1% vs 87.9%).*
2. Where the article says "granular tools invite granular failure" →
   append: *Update, July 2026: measured at +33 points for rewrite on
   multi-turn reference edits — though the mechanism was models
   failing to execute follow-up tool calls, not stale references.*
3. Where the article claims fewer tokens burned / one-pass authoring →
   append: *Update, July 2026: 4–5× fewer tokens than mutation tools
   on small/medium trees; ~30% cheaper than JSON rewrite on large
   trees.*

## Task 3 — publish the companion post

Create a new blog post from
`~/newdev/barkup-bench/docs/blog-draft.md` (title: "We Benchmarked It:
What Held Up in 'HTML as a Native Data Format for LLMs' — and What
Didn't"), slug `barkup-bench-results`, following the same frontmatter
conventions as existing posts. Cross-link both directions (the update
section above already links to it).

## Verify before committing

- Run the site locally and load both `/blog/ast-as-html` and the new
  post; check headings render, links resolve, and no frontmatter
  errors.
- Run the repo's lint/check scripts if present.
- Confirm every number against `~/newdev/barkup-bench/REPORT.md`.
