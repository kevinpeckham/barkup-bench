# Study AZ — the slot-sizing static block (template-chat, v3.334.0)

**Pre-registration, committed before any scored run.** Date: 2026-11-07.
Trigger: the Replicator agent's ask
(`~/projects/_handoffs/2026-11-07-replicator-template-chat-slot-sizing-prompt-ASK.md`);
Kevin's go-ahead ("we'll want to run that next if it hasn't been run
already") covers registration and the fence below.

## The question, and a premise correction

Replicator v3.334.0 (dev, not yet shipped) changes the template-chat
STATIC BLOCK in one place: `buildGrammarDigest` now lists `slotHeightPx,
slotSpan` on the widget-slot row (new defaultAttributes in
template-node-config.json). The prose line about widget-slots is
unchanged and still advertises `data-required-widget-width` — an
attribute the release REMOVES, so a model that follows that line writes
a silent no-op. The ask: gate Arm A (ship as is) and Arm B (plus a
corrected prose line) with `scripts/regress.ts`.

**Premise correction, stated up front:** the 13 regression gates do not
consume the template-chat static block — they run the bench's own
registered constructions (bench grammar, bench prompt stacks) that
PROTECT those surfaces. Running the suite twice under the two arms would
spend ~2x a full suite and measure nothing about this text change. The
honest instrument is the dedicated slice the ask itself anticipated in
its deliverable 3, registered here.

## Materials (committed, provenance pinned)

- `corpus/az-slot-sizing/static-arm-a.txt` — the REAL static block,
  built by replicator's own `buildTemplateEditorPromptSegments` at dev
  commit `14e05af` (v3.334.0), mode `page`, over the fixture markup
  below. Extracted via a throwaway in-repo script (untracked, deleted);
  the bench edits no app code.
- `corpus/az-slot-sizing/static-arm-a0.txt` — main's text (`856656d`),
  constructed by removing `", slotHeightPx, slotSpan"` from the digest's
  widget-slot row. Exact because `git diff main..dev` touches only
  template-node-config.json among the builder's model-facing sources;
  identity pinned by test.
- `corpus/az-slot-sizing/static-arm-b.txt` — Arm A with the widget-slot
  prose line replaced by the ask's proposed wording VERBATIM (the bench
  registers it unimproved; if B fails, rewording is a new registration).
  Identity (one-line delta only) pinned by test.
- `corpus/az-slot-sizing/dynamic.txt` + `markup.html` — the dynamic
  block over a 9-node fixture template with three widget-slots
  (slot-hero, slot-feature-a, slot-feature-b). Small template = full
  markup embed, so the slice isolates the TEXT variable from the view
  machinery.
- `corpus/az-slot-sizing/tasks.json` — 18 single-turn requests in three
  buckets: **S** (6 sizing-explicit; expected ops registered), **D** (6
  ordinary edits near slots; required ops registered), **T** (6
  legacy-width-constraint requests in the removed attribute's
  territory; no "correct" answer registered — the census below is the
  grade).

## Protocol

One call per (arm, task): system = staticBlock + dynamicBlock (the
builder's canonical full-prompt form), user = the request, tools = a
verbatim port of template-chat's `apply_template_patch` definition
(description + input schema, replicator `+server.ts:238-263` @
`14e05af`) with no execute — the first tool call is the artifact.
Model `anthropic/claude-fable-5.1` (the shipped tier per the ask and the
2026-10-21 manifest), temperature 0 (standing registered deviation; the
gateway ignores it on this model — recorded 2026-11-04), maxRetries 4,
maxOutputTokens 8000. 3 arms x 18 tasks = 54 calls.

**Registered deviation:** the tool surface is reduced to
apply_template_patch alone, identical across arms; absent tools are
absent in every arm, and no task needs a view, a search, or a widget id.

## Mechanical grades (src/studyaz/grade.ts, unit-tested)

- **S:** ops set exactly equals the registered expected set (order-free;
  numeric values compared as trimmed strings). A reply without a tool
  call fails.
- **D:** every required op present AND zero writes to the sizing family
  {data-slot-span, data-slot-height-px, data-required-widget-width},
  including attributes smuggled in via insert nodes.
- **T:** census of writes to the REMOVED `data-required-widget-width`
  ("dead writes" — silent no-ops in the app), plus the full written-key
  list for the report.

## Gates — the ship decision

- **AZ-G1 (Arm A safe to ship):** on Arm A, D pass count >= A0's D pass
  count, zero sizing-family writes in D, and T dead writes <= A0's.
  (The digest change must not cause invention or make the stale-prose
  harm worse; A's S bucket is reported, not gated — nothing teaches the
  attributes yet and the ask makes no claim that it does.)
- **AZ-G2 (Arm B green):** S >= 5/6 exact, D pass count >= A0's with
  zero sizing-family writes, and T dead writes = 0/6.

A0 is the reference arm (what ships today) and carries no gate. No
re-thresholding after data exists; a defective grader or fixture means
stop, fix, re-register, re-run.

## Spend fence

**$5.** 54 fable-5.1 calls at ~3.5k input / small output each; expect
well under $1.50.

## Predictions (scored in the report)

1. AZ-G1 passes — two untaught names appended to a digest leaf row move
   nothing on the frontier tier.
2. AZ-G2 passes, with S = 6/6 (the enum is in the prose and the span
   values are named).
3. The stale prose does real harm where it is advertised: A0 and A each
   write the dead attribute on >= 2 of 6 T tasks; B writes it 0 times.
4. Spend <= $1.50.

## Disclosure

Analyst Claude Fable 5; measured model claude-fable-5.1 (same family;
tolerable because every grade is mechanical and committed first). The
PDF pipeline embeds the same digest (pdfWidgetBuild.ts:109,
correctPipelinePage.server.ts:114 — Studies AS/AT surfaces); this slice
measures the digest delta in the TEMPLATE-CHAT context only, and the
reply will say so rather than extrapolate.
