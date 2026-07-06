# Addendum brief — Condition F: id-anchored patches

**Pre-registration for a sixth condition, committed before any scored
F run.** Motivated by the main study's finding that JSON Patch (E)
collapses on large trees (69.6% success at ~150 nodes) while being the
cheapest condition at medium sizes — and by the hypothesis that the
collapse is caused by *positional path arithmetic*, not by the patch
concept itself.

## The condition

**F — JSON serialization + anchored patch.** The model replies with a
JSON array of operations that address nodes exclusively by **id**
(which the corpus trees carry on every node, and which barkup
preserves byte-for-byte):

```json
[
  {"op": "set-attribute", "id": "n7", "key": "featured", "value": true},
  {"op": "set-name", "id": "n7", "name": "hero"},
  {"op": "remove-attribute", "id": "n7", "key": "minLength"},
  {"op": "remove", "id": "n9"},
  {"op": "insert", "node": {"type": "block", "id": "b1"}, "after": "n7"},
  {"op": "insert", "node": {"type": "page", "id": "p9"}, "parentId": "n0"},
  {"op": "move", "id": "n3", "before": "n5"}
]
```

Placement grammar for `insert`/`move`: `before: <sibling id>` or
`after: <sibling id>` (parent derived from the sibling), or
`parentId: <id>` alone (append as last child). No indexes exist
anywhere in the dialect.

Application semantics (mirrors E): the patch is applied atomically to
a clone of the base tree — any failing operation rejects the whole
patch with a structured issue naming the operation index; the patched
tree then passes the same twin validation as conditions B, C, and E.
Correction rounds re-patch the ORIGINAL base, per the standard loop
(1 attempt + ≤3 corrections, issues verbatim).

## Pre-registered hypotheses

- **H6a (reliability):** F's task success exceeds E's on the l bucket
  (~150 nodes), where E collapsed; paired McNemar over the identical
  tasks.
- **H6b (economy):** F's tokens per solved task are within ~20% of
  E's (i.e., anchoring does not forfeit the patch cost advantage).
- **H6c (parity with rewrite):** F's overall success is within a few
  points of A's; direction unspecified. Secondary: F vs A on the
  reference family (id-anchoring should be a natural fit).

## Protocol (unchanged from the main study)

Same corpus (`corpus/main.json`, seed 20260706), same models
(claude-sonnet-4.5, gpt-5.4, gemini-3.5-flash, claude-haiku-4.5),
temperature 0, both prompt regimes, same correction loop, same
graders. F's parity prompt follows the established five-bullet
structure; its best-effort prompt receives the same three uniform
additions as A–E. Comparisons against A and E use the EXISTING scored
records — only F cells are newly run (~1,600 cells; expected spend
$30–50).

Honesty rules apply unchanged: this file is committed before the
first scored F call; results publish whatever they show.
