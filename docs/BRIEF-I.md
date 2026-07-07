# Addendum brief — Study I: focused views (partial-context anchored patches)

**Pre-registration, committed before any scored I run.** Every study
so far held the input constant (the full tree in the prompt) and
varied the output interface. Study H settled the output side: above
~300 nodes, id-anchored patches (F) are the only reliable interface.
The input side is now the binding constraint — a patch's output is
O(edit), so nearly all of its cost is input, the tree is resent every
turn in a multi-turn agent, and somewhere above 1000 nodes the full
tree stops fitting in context at all. Study I asks: **does an
anchored patch still land when the model sees only part of the
tree?** The answer gates a proposed `@kevinpeckham/barkup/view`
capability (render a focused partial view whose every visible id is a
valid patch target), so the views tested here are the candidate
contract for that API.

## Conditions

Both new conditions are condition F (id-anchored patch, applied via
the shipped `@kevinpeckham/barkup/patch`, protocol identical to Study
H's F cells) with one change: the tree shown in the prompt is a
**focused view** instead of the full serialization. The patch is
still applied to the **full** base tree, and grading is unchanged.

Let R be the set of node ids the task's ground-truth edit references
(set-attribute / set-name / remove-node: the target id; insert-node:
the parent id; move-node: the moved id and the new-parent id — the
same ids the instruction text names). Let the **spine** be every node
on a root-to-r path for r ∈ R, inclusive.

- **FV — focused view.** Spine nodes render fully (type, name, id,
  attributes). Children of spine nodes: a child on the spine recurses;
  every other child renders as a **placeholder** — a self-closing
  object `{"type", "name"?, "id", "collapsed": true, "childCount": N}`
  with no attributes and no children. Children of R nodes always
  appear (placeholder at minimum, in document order), so the child
  list any ordinal placement refers to is fully visible. Nothing below
  a placeholder is shown.
- **FT — minimal view.** As FV, except non-spine children of spine
  nodes that are NOT children of an R node are omitted entirely; the
  parent carries `"omittedChildren": N`. Children of R nodes keep the
  full placeholder list (ordinal placements stay resolvable). FT is
  the aggressive lower bound on context.

**Prompt.** The system prompt is F's parity prompt plus one
pre-registered block (identical for FV and FT), appended after the
editing rules:

```
View rules:
- You are shown a focused view of the tree, not the whole tree. The view is centered on the nodes the edit request references. Your patch is applied to the full tree, where every hidden node still exists.
- A node with "collapsed": true is a real node shown without its contents; "childCount" is how many children it actually has.
- A node with "omittedChildren": N has N additional children that are not shown at all.
- Every visible "id" is a valid patch target. Never use an id that is not visible in the view.
- Give every node you create a fresh id unlikely to exist anywhere in the full tree (e.g. with a random-looking suffix); if it collides with a hidden node's id, the patch is rejected with a duplicate-id issue and you can correct it.
```

The user message template is unchanged from F (maximum parity with
the baseline; the system prompt carries the view semantics).

## Baseline, corpus, models

The full-input baseline is **Study H's F cells, reused as-is** (45
tasks × 2 models, already run — no respend). Corpus:
`corpus/size-extension.json` unchanged (xl ~300 / xxl ~600 / xxxl
~1000, 15 transformation tasks each, seed 20260708). Models:
`anthropic/claude-sonnet-4.5` and `google/gemini-3.5-flash`. New
cells: 45 tasks × 2 view conditions × 2 models = **180 runs**.

## Pre-registered hypotheses

- **I-H1 (primary):** FV's task success is within noise of full-input
  F's (paired McNemar per model over the 45 shared tasks, plus pooled;
  prediction: no significant difference — "visible implies patchable"
  holds).
- **I-H2 (mechanical, measured not tested):** FV cuts input tokens per
  task by ≥70% at xxxl relative to full-input F.
- **I-H3:** FT also holds overall; any degradation concentrates in the
  placement-dependent edit kinds (insert-node, move-node) or in
  fresh-id collisions. Breakdown by edit kind is exploratory.
- **Exploratory:** duplicate-id collision rate in the view arms (issue
  scan) and whether the correction loop recovers them; rounds-to-pass
  vs baseline.

## Decision rule (feature gate for barkup /view)

If FV is non-inferior per model (success delta no worse than −5 pp
and McNemar p > 0.05), the `/view` proposal proceeds with FV's
content as the minimum contract (spine + sibling placeholders +
complete child lists of referenced nodes). If FT is also
non-inferior, the contract may be trimmed toward FT. If FV degrades,
the negative result is published and the feature is shelved.

## Protocol

Identical to Study H's F cells: `maxOutputTokens: 60000`, no
streaming (patch outputs are small), temperature 0, 1 attempt + ≤3
correction rounds with structured issues verbatim, deterministic
grading (equal-modulo-new-ids + drift), resumable JSONL
(`results/raw/studyi-<model>.jsonl`). Mechanical-failure rules as in
Study H: transient gateway errors are retried and never scored; a
task that twice produces no output is recorded as a mechanical
failure and reported as such. **Expected spend < $10** (view inputs
are a fraction of full-tree inputs; outputs are patch-sized); abort
and report if spend projects past $25.

Honesty rules unchanged: this file, the view-rendering code, and its
unit tests are committed before the first scored call; results
publish whatever they show. The view renderer is part of the grader
surface (it determines what the model can see), so it gets unit
tests like every grader.
