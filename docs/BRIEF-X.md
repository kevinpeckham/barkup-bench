# Addendum brief — Study X: edit-anaphora (requests that point at the previous edit)

**Pre-registration, committed before any scored X run.** Every
instruction in twenty-three studies has been self-contained, and the
conversation-dependence the series measured (T/W) covered *declared
facts*. The most common real-chat request is neither: "also make it
bold", "do the same to the footer", "actually, undo that" — anaphora
to the PREVIOUS EDIT. The stateless recipe fails this by
construction (there is no "that" without a carrier), the memo does
not obviously cover it (nothing was declared), and the minimal
sufficient carrier has never been measured. Replicator's own
guidance flags this exact clause as deliberately untested ("history
remains load-bearing for discourse"). Study X measures it.

## The task class (pre-registered exactly)

New corpus `corpus/sessions-anaphora.json`, seed **20260718**, 12
sessions (7 l, 5 xl) × 12 steps on a fixed schedule of
predecessor→anaphora pairs. Predecessors (steps 2, 5, 8, 11) are
scheduled self-contained `set-attribute` edits on pre-existing
nodes; each is immediately followed by an anaphora step (distance 1,
pre-registered) of one of three kinds:

- **amend** (steps 3 and 12): `Also set the "{key2}" attribute of
  that same node to {value2}.` — a different attribute of the node
  just edited. The target is never named.
- **repeat** (step 6): `Apply the same change to {refB}.` — the
  predecessor's key AND value applied to a different named node of
  the same type. The key and value are never restated.
- **undo** (step 9): `Actually, undo that last change.` — restore
  the predecessor target's attribute to its prior value. Target,
  key, and prior value are all unstated.

Steps 1, 4, 7, 10 are ordinary self-contained edits (set-name,
insert, move, remove — kinds fixed for coverage). Validation
(unit-tested): anaphora instructions contain no ids, keys, or values
of their referents; repeat's target differs from the predecessor's
and the value differs from its current one; the generator's chain
applies end to end.

**Views:** ordinary steps get the standard per-turn minimal view
(oracle focus). Anaphora steps get a ROOT SKELETON view only — the
application cannot know the focus without resolving the anaphora
itself, so an oracle-focused view would leak the answer. This makes
the failure structural: target, key, and value must come from the
carrier under test.

**Undo semantics (pre-registered):** the expected edit restores the
value the node had in the MODEL'S OWN tree immediately before the
predecessor step was attempted (runner-snapshotted), so grading
stays per-step-fair even after earlier divergence. If the
predecessor step produced no valid artifact, undo's expected state
equals the current tree.

## Arms (4): what carries "that"?

- **X-history** — full conversation history (the ceiling; the
  predecessor's user message contains the pre-change view, so undo's
  prior value is visible).
- **X-window2** — the last 2 completed exchanges only (Study M's
  window machinery; at distance 1 the referent is always inside it).
- **X-lastedit** — stateless + the two worked examples + an
  APP-MAINTAINED last-edit note appended to every user message from
  step 2 on, format verbatim:
  `Previous edit (applied by the app): set "{key}" from {oldValue}
  to {value} on {nodeRef}.` — the automatic sibling of the T memo:
  the application always knows what it just applied, so this carrier
  costs no agent judgment at all. For non-set-attribute predecessors
  the note names the operation analogously (registered in the
  implementation).
- **X-stateless** — stateless + worked examples, no carrier. The
  by-construction control.

Editor models: `anthropic/claude-sonnet-4.5`,
`google/gemini-3.5-flash`, `anthropic/claude-opus-4.8`.
12 × 12 × 4 × 3 = **1,728 step records**; 48 anaphora cells per
arm-model.

## Grading

Standard session protocol (per-step ground truth from the model's
own pre-step state, `equalModuloNewIds`, ≤3 correction rounds,
empty-reply marker, session as resume unit). Anaphora cells flagged
in detail with their kind.

## Pre-registered hypotheses

- **X-H1 (structural failure):** X-stateless fails anaphora cells
  near-totally (it cannot know the target, key, or value; with a
  skeleton view it cannot even address the node). Reported with
  failure anatomy: silent guess vs no valid artifact.
- **X-H2 (the app-side carrier — the gate):** X-lastedit is
  statistically indistinguishable from X-history on anaphora cells
  per model (McNemar over shared (session, step) keys, p > 0.05, all
  three models). Passing = the session recipe gains its final
  automatic clause: the app echoes its last apply, and discourse
  stops requiring a transcript.
- **X-H3 (minimal window, descriptive):** does window-2 suffice at
  distance 1? Study M found it inadequate for placements; anaphora
  at distance 1 is its natural home turf. No gate; reported per kind.
- **Secondary:** per-kind splits (amend vs repeat vs undo — undo is
  predicted hardest, needing the prior value), ordinary-step parity
  across arms, cost per arm.

## Interpretation table (pre-registered)

| X-stateless | X-lastedit | Reading |
|---|---|---|
| fails | ties history | Discourse needs an echo, not a transcript; the last-edit note joins the memo in the recipe |
| fails | falls short | Anaphora genuinely needs conversational history; the guidance keeps a window for discourse and says exactly why |
| survives | — | Models infer referents from skeleton + patch dialect alone; audit for leakage before claiming (corpus validation should preclude this) |
| mixed by kind | mixed | Publish the split; per-kind guidance (undo may need the from-value that only richer carriers hold) |

## Decision rule

Whatever passes cheapest at history-parity becomes the documented
discourse clause in barkup's session guidance and Replicator's
digest, with failure anatomy stated honestly.

## Protocol

As Studies T/S/W: `maxOutputTokens: 60000`, temperature 0, resumable
JSONL `results/raw/studyx-<model>.jsonl`, `cacheReadTokens` recorded,
cache audit re-run, mechanical-failure rules as in Study H.
**Expected spend $25–50**; abort past $80.

Honesty rules unchanged: this brief, the generator with its
no-leakage validation, the note format, and all four arm
implementations are committed before the first scored call; results
publish whatever they show.
