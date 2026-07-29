# Addendum brief — Study AP′: re-registering the adjacent answer key (re-score of AP's frozen results; no new test cells)

**Pre-registration of a RE-SCORING protocol, committed before any
elicitation pass or re-score runs.** Study AP's gate failed on its
adjacent branch, and the audit attributed the failure to the
registration, not the models: every non-conformant adjacent cell was
all-canonical, and the misses were extra, editorially arguable tags
beyond acceptable sets the analyst authored alone (`UX` on a
checkout-conversion piece, `CSS` on web components). The same lesson
class appeared in AO (the non-empty "clean" rule vs honest editorial
refusal). AP′ fixes the PROCESS: the adjacent answer key is
re-authored by independent editors who never see the model outputs,
and AP's frozen raw results are re-scored against it under the
UNCHANGED conformance rule.

## Epistemic status (registered honestly)

AP′ is a corrected measurement, not a fresh experiment. Its raw data
already exists (results/raw/studyap-*.jsonl, 576 cells, frozen), and
REPORT.md has published both the failure anatomy (including four
named example tags) and an exploratory anchored reading (144/144).
Full blindness is therefore impossible: Kevin has read the report,
and the analyst knows every model answer. The protocol mitigates
hindsight rather than eliminating it:

- The editor passes are FRESH model contexts given only the task
  text and the catalog — no report, no model answers, no class
  labels, no mention that any study exists.
- The analyst does not author, edit, or veto any set, and does not
  run the re-score until the key is locked.
- Kevin reviews the mechanically merged key before scoring; he has
  report exposure, so his review is registered as a STRIKE/ADD pass
  with a stated reason per change, published verbatim in the results.

## The elicitation (three independent passes)

Editors: `anthropic/claude-opus-4.8`, `anthropic/claude-haiku-4.5`,
`google/gemini-3.5-flash` — one context per editor per task, 24
tasks (the 12 adjacent AND the 12 foreign, unlabeled and shuffled
together; foreign tasks act as a validity probe of the class split
itself). Two editors overlap with models under test; haiku does not.
The overlap is a registered concern, mitigated by the different task
framing (editorial acceptance, not tag proposal), temperature 0, and
Kevin's review.

Prompt (registered verbatim, aside from the interpolated catalog and
task): the editor is the org's editor-in-chief; given the canonical
tag catalog and an article's title + summary, list EVERY catalog tag
they would accept a colleague applying to this article — generous
but defensible; exact names; the empty list if nothing in the
catalog genuinely applies. Reply `{"acceptable": [...]}`.

## Key assembly (mechanical, then reviewed)

1. A tag enters a task's candidate set when ≥2 of 3 editors list it
   (exact catalog names only; non-catalog strings discarded and
   reported).
2. Kevin's strike/add review produces the LOCKED key
   (`corpus/tag-steering-ap-acceptable-v2.json`, committed with
   per-editor votes and review notes preserved).
3. Foreign-task probe: for each foreign task, report the majority
   set. Majority-empty confirms the class split; any majority
   non-empty foreign set is published and that task's classification
   flagged as contested (it stays scored as registered in AP — the
   flag is for interpretation, not re-scoring).

## Re-scoring (the AP rule, unchanged, against the locked key)

The conformance definition is byte-identical to AP's: adjacent =
non-empty, zero invented, every non-minted tag ∈ the task's
acceptable set (mints permitted in AP-tool only). Covered, trap, and
foreign scoring are untouched; H1, H3, H4 carry over from AP
unchanged. Only the adjacent sets change.

- **AP′-H2 (the re-registered gate):** AP-fork on opus: adjacent
  conformant ≥ 10/12 AND foreign empty ≥ 10/12 (the foreign half
  already measured at 12/12 and cannot change).
- **AP′-H5 (descriptive):** the AP-empty vs AP-fork adjacent
  contrast under the locked key, all models; per-arm adjacent
  conformance deltas vs the v1 key; which v1 misses the new key
  absolves vs leaves standing.
- **The study gate: AP-H1 (carried, PASS), AP′-H2, AP-H3 (carried,
  PASS), AP-H4 (carried, PASS).**

## Interpretation table (pre-registered)

| Outcome | Reading |
|---|---|
| AP′-H2 passes | The AP interpretation stands corrected end-to-end: the fork text is validated on the shipped tier and becomes the ship candidate for the `tags_list` description (vs the empty text per the H5 contrast — product picks wording; both closed the foreign branch in AP); the solo-authoring lesson is confirmed as the sole cause of AP's FAIL |
| AP′-H2 fails with the locked key materially wider than v1 | The models' adjacent generalization genuinely exceeds what independent editors accept — a real steering gap, not a registration artifact; the guidance text does NOT ship; file a successor measuring tighter guidance ("at most N tags, only the clearly dominant fields") |
| AP′-H2 fails with the locked key ≈ v1 | Independent editors agree with the original sets and the anchored 144/144 was too permissive a reading; same consequence as above, plus the anchored definition is retired from future briefs |
| Foreign probe returns majority non-empty sets on ≥3 tasks | The adjacent/foreign split itself is unstable; the fork text's premise weakens — report prominently and require a class re-registration before any guidance ships |

## Cost fence

72 elicitation calls (24 tasks × 3 editors), single short completion
each — order **cents**. Zero test-cell spend. Authorized 2026-07-29
("Ok, proceed").
