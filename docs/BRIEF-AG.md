# Addendum brief — Study AG: the anaphora hatch (does NEED-INFO fire on "undo that"?)

**Pre-registration, committed before any scored AG run.** (Lettering
note: AG was skipped when AH/AI ran, due to a since-corrected
miscommunication documented in BRIEF-AI; this study takes the free
letter.) Study X built the series' other validated silent-failure
factory: follow-ups that point at the previous edit ("also set that
same node's…", "apply the same change to X", "actually, undo that")
against a carrier-less editor fail 0/144, every failure a valid
silently-guessed patch. The shipped fix is the app-side last-edit
echo. But the ask path has never been pointed at this construction,
and it arguably COVERS it: an anaphoric referent is "not visible in
the view and not stated in the request" — the exact scope of the
shipped NEED-INFO sentence. Study AE showed the mid tiers apply that
sentence's letter (they failed on visible-but-ambiguous referents);
an anaphoric referent satisfies the letter. So the open question
cuts both ways: either the hatch fires here on every tier (absence-
shaped gap, letter-covered), or models do not register "that" as a
gap at all — and the ask-path map gains its final border either way.

## Corpus and machinery: reused, not regenerated

`corpus/sessions-anaphora.json` verbatim (Study X: 12 sessions × 12
steps per model, 48 anaphora cells across kinds that/same/undo, the
rest self-contained ordinary steps). Study X's session runner
unchanged except the registered arm additions below; skeleton views
on anaphora steps as in X (the carrier under test must supply
target, key, AND value — here the "carrier" is the model's option
to ask).

## Arms (3), full sessions each

- **X-stateless** — Study X's carrier-less arm verbatim, re-run
  contemporaneously (the 0/144 anchor).
- **AG-stateless-hatch** — the carrier-less arm plus the shipped
  `ASK_RULE`, verbatim and unamended (Study AI measured the
  multiplicity variant; this study tests the SHIPPED text). A
  first-round reply starting `NEED-INFO:` ends the step as `asked`
  (the tree does not advance; later steps proceed as constructed —
  ordinary steps are self-contained).
- **AG-echo-hatch** — the last-edit echo (X-lastedit's registered
  note, verbatim) PLUS the shipped `ASK_RULE`: the shipped-stack
  configuration. With the referent supplied by the echo, asking is
  a false ask; this arm is the tax check.

**Models (3):** sonnet-4.5, gemini-3.5-flash, opus-4.8.
3 arms × 12 sessions × 12 steps × 3 models = **1,296 step records**
(432 anaphora cells). Protocol X's verbatim: temperature 0, ≤3
correction rounds, session-resume unit, resumable JSONL
`results/raw/studyag-<model>.jsonl`, cache audit re-run.

## Pre-registered hypotheses and gates

- **AG-H1 (the hatch fires on anaphora):** per model,
  AG-stateless-hatch anaphora cells: asked ≥ 31/48 (one-sided exact
  binomial vs 0.5, p < 0.05 — AC's detection standard at n=48).
  **Gate: passes on all three models.** The control arm anchors the
  anatomy (X measured 0/144 silent guesses; asks without a hatch
  were 0 everywhere in the series).
- **AG-H2 (no tax under the shipped stack):** per model,
  AG-echo-hatch: false asks on anaphora cells ≤ 4/48 AND anaphora
  success ≥ 45/48 (X-lastedit measured 48/48/48; the regression
  suite's band) AND false asks on ordinary cells ≤ 5/96.
- **AG-H3 (ordinary steps undisturbed):** per model,
  AG-stateless-hatch ordinary cells: false asks ≤ 5/96 AND success
  not significantly below the contemporaneous X-stateless control
  (McNemar, p > 0.05, or hatch-favoring).
- **The study gate: AG-H1, AG-H2, and AG-H3 all pass.**
- **AG-H4 (descriptive):** asks by anaphora kind (that / same /
  undo); ask-quality heuristic (the ask references the previous
  edit or request history — contains "previous" or "last" or
  "earlier"); tier comparison; what the residual guesses look like
  under the hatch; control-arm replication of X's 0/144.

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| All pass | The ask path covers the discourse gap too: on surfaces without an echo (or before one ships), the shipped sentence converts silent anaphora guesses into questions — the echo remains the better UX (zero questions), the hatch its seatbelt |
| H1 fails | Anaphora joins ambiguity as a capability-shaped gap: models do not register a dangling referent as missing information even when the rule's letter covers it — the echo is the ONLY defense, on every tier |
| H1 splits by tier | The AE pattern extends: gap recognition is the capability, the rule text is secondary — report which tiers protect themselves |
| H2 fails | The hatch and the echo interfere (asking despite a supplied referent) — do not combine them without the echo; investigate before shipping guidance |

## Protocol notes, registered up front

- An `asked` step does not advance the session tree; the corpus
  guarantees ordinary steps are self-contained, so subsequent
  grading is unaffected by construction. Anaphora steps whose
  PREDECESSOR was asked lose their referent legitimately — those
  cells still grade as constructed (the model was never shown the
  predecessor's edit), and the count is reported.
- The shipped ASK_RULE is tested verbatim (not the AI amendment) —
  this is the sentence running on production surfaces today.
- Ask detection is the registered NEED-INFO line-start sentinel,
  identical to AC/AE/AI.

**Expected spend $10–18** (1,296 session steps across three tiers);
abort past $40. Honesty rules unchanged: this brief is committed
before the first scored call; results publish whatever they show.
