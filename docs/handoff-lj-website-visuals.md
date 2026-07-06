# Agent prompt — lj-website: add the benchmark figures to the blog

Copy everything below the line into an agent session running in
`~/newdev/lj-website`.

---

You are working in the lj-website repository (SvelteKit). Your job is
to embed the barkup-bench result figures into the blog. There are
three figures, each available in four files under
`~/newdev/barkup-bench/docs/img/`:

| Figure | Files | Shows |
|---|---|---|
| `crossover-success` | `-light.svg/.png`, `-dark.svg/.png` | Task success by tree size, 5 conditions — rewrite leads everywhere, JSON Patch collapses at ~150 nodes |
| `reference-stability` | same | Multi-turn reference-edit success per model — tools arms collapse for haiku/gemini |
| `tokens-per-solved` | same | Mean tokens per solved task by size — tools 4–5× dearer on small trees; HTML rewrite ~30% cheaper than JSON rewrite at ~150 nodes |

The figures are self-attributing (title, method line, legend, and n
baked into the image), so captions should add context, not repeat it.

## Where each figure goes

Work with whatever state the repo is in:

- If the companion post (`barkup-bench-results`, from an earlier
  handoff) exists: put `crossover-success` right after "The short
  version", `reference-stability` inside the "Claim by claim" section
  next to the granular-tools discussion, and `tokens-per-solved` next
  to the "Fewer tokens burned" discussion.
- In the original article (`src/lib/content/blog/ast-as-html.md`): put
  `crossover-success` and `reference-stability` inside the "Update
  (July 2026)" section (after its first and second paragraphs
  respectively). If that section doesn't exist yet, stop and report —
  the text handoff must land first.
- Do not embed the same figure twice in one page.

## How to embed

1. Copy the needed files into the site's static-assets location,
   following wherever existing blog images live (check how other posts
   reference images before inventing a path).
2. Prefer the SVGs (small, crisp). Use the PNGs only if the site's
   markdown/image pipeline mishandles SVG.
3. Serve the light/dark pair with the site's own theme mechanism if it
   has one; otherwise:

   ```html
   <picture>
     <source srcset="/blog/img/crossover-success-dark.svg" media="(prefers-color-scheme: dark)" />
     <img src="/blog/img/crossover-success-light.svg" alt="…" width="960" height="584" loading="lazy" />
   </picture>
   ```

   Set explicit width/height (960×584 for the line charts, 960×476 for
   `reference-stability`) so the page doesn't shift while loading.
4. Alt text, verbatim:
   - crossover-success: "Line chart: task success rate versus tree
     size for five conditions. Whole-tree rewrite conditions stay on
     top at every size; JSON Patch drops to 69.6% at about 150 nodes."
   - reference-stability: "Dot plot: multi-turn reference-edit success
     for four models across five conditions. gpt-5.4 and sonnet-4.5
     score high everywhere; haiku-4.5 and gemini-3.5-flash drop to
     2.5–32.5% in the mutation-tool conditions."
   - tokens-per-solved: "Line chart: mean tokens per solved task by
     tree size. Mutation-tool conditions cost four to five times more
     on small trees; at about 150 nodes HTML rewrite uses 15.6k tokens
     versus 23k for JSON rewrite."
5. One-line captions in the site's caption style (write them fresh,
   short, non-duplicative — e.g. for the crossover chart: "Pooled over
   four models, parity prompts; whiskers are Wilson 95% intervals.").

## Rules

- Numbers in captions/alt text must match
  `~/newdev/barkup-bench/REPORT.md`. Do not restyle, recolor, or crop
  the figures.
- Match existing frontmatter/component conventions for images; don't
  introduce a new image component if one exists.
- Conventional commits; never mention AI assistance in commits.

## Verify before committing

- Run the site locally; check both affected pages in light AND dark
  mode (toggle the site theme if it has one, plus OS preference).
- Confirm no layout shift, no horizontal overflow on mobile width
  (~375px), images lazy-load, and alt text is present.
