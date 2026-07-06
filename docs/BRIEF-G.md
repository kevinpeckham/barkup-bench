# Addendum brief — Study G: multi-turn tool-instruction dropout

**Pre-registration, committed before any scored G run.** Motivated by
the main study's H4 mechanism finding: on multi-turn reference tasks,
smaller models (haiku-4.5, gemini-3.5-flash) failed 95–97% of
follow-up edits in the tools arms by *silently not executing them* —
while executing the identical operation type perfectly in turn one,
and while frontier models showed no such gap. Related literature
(LLMs-get-lost, Multi-IF, MT-Eval, ToolSandbox, premature-termination
taxonomies) documents multi-turn degradation broadly but has not
isolated this minimal pair: same conversation, same trivially simple
instruction type, deterministic grading, interface-controlled.

## Questions and pre-registered hypotheses

- **G-H1 (dose-response):** follow-up execution rate in the tools
  interface declines as conversation depth grows; the decline is
  steeper for small models than frontier models.
- **G-H2 (history is the cause):** issuing the identical follow-up
  edit in a FRESH conversation (current state shown, no history)
  recovers most of the small-model deficit.
- **G-H3 (cheap mitigations):** re-serializing current tree state
  into the follow-up message, and/or requiring the model to restate
  the instruction before acting, each recover a substantial fraction
  of the deficit at bounded token cost.
- **G-H4 (interface control):** the whole-artifact rewrite interface
  shows no comparable depth effect on the same tasks.

## Design

**Task family "followup"** (new corpus, seeded, committed): for each
task — (1) a phase-1 insert of a distinctively named node; (2) N
filler turns, each a simple set-attribute edit on a DIFFERENT,
pre-existing node (deterministic, unambiguous, id-referenced); (3) the
final follow-up edit: set one attribute on the phase-1 node,
referenced by the id from the model's own output/tool result. Primary
outcome: the final edit was applied (attribute present with the exact
value on the surviving node). Secondary: filler-turn completion,
any-tool-call-in-final-turn, wrong-action classification, tokens.

Grading is deterministic (tree inspection; no judges). Standard
validity correction loop only (semantic feedback is never given);
temperature 0; single attempt per cell (k = 1 — run-to-run
reliability is out of scope here and noted as a limitation).

**Arms** (protocol variants over the SAME tasks):

| Arm | Interface | History | Variation |
|---|---|---|---|
| G1 | tools (condition-C flow) | continuous | baseline — replicates the effect |
| G2 | tools | fresh conversation at final turn | current tree shown, no prior turns (tests G-H2) |
| G3 | tools | continuous | final message re-serializes current tree (tests G-H3) |
| G4 | tools | continuous | final message requires one-sentence restatement before acting (tests G-H3) |
| G5 | whole-tree rewrite (condition-A flow) | continuous | interface control (tests G-H4) |

**Depth sweep:** N ∈ {0, 2, 6} filler turns for G1 and G5
(dose-response); mitigation arms G2–G4 run at N = 2 only.

**Corpus:** 40 tasks (20 s-bucket, 20 m-bucket trees; fresh seed;
6 pre-generated filler edits per task, arms use the first N).
Construction mirrors the main study's reference family; filler edits
never touch the phase-1 node or each other's targets.

**Models (6, three vendors × two tiers, gateway ids verified before
running):** anthropic/claude-sonnet-4.5, anthropic/claude-haiku-4.5,
openai/gpt-5.4, openai/gpt-5.4-mini, google/gemini-3.5-flash,
google/gemini-2.5-flash-lite.

**Cells:** G1/G5: 40 × 3 depths each; G2–G4: 40 each → 360 per model,
2,160 total (each cell is N+2 model calls). Expected spend $60–150.

**Statistics:** paired McNemar per arm-vs-G1 and per depth-vs-N=0
within model; Wilson intervals; effect sizes as risk differences.

## Phase A (before Phase B): classify the existing failure corpus

Instrument the runner to capture compact transcripts (flag-gated);
re-run the main-study reference-family cells for haiku-4.5 and
gemini-3.5-flash × conditions C and D (parity prompts) with
transcripts; classify every phase-2 failure deterministically from
the transcript: no-tool-call / wrong-tool / duplicate-insert /
right-tool-wrong-args. Phase A informs interpretation but does not
alter Phase B's design (this file is committed first).

## Honesty rules

Unchanged from BRIEF.md: no tuning after scored results; publish
whatever it shows; corpus, prompts, and seeds committed before the
first scored call; graders unit-tested.
