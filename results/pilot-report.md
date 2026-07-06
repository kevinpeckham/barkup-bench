# Phase 0 pilot report

**Gate document** (BRIEF.md Phase 0): pilot results, harness/design
problems found, and the full-matrix cost projection. The full matrix has
NOT been run — it awaits explicit approval.

- Date: 2026-07-06
- Subject model: `anthropic/claude-sonnet-4.5` (via Vercel AI Gateway),
  temperature 0
- Describer (construction specs): `xai/grok-4.3` (held-out vendor family)
- Conditions: A (HTML dialect + whole-tree rewrite) vs C (JSON +
  granular mutation tools), parity prompts
- Corpus: `corpus/pilot.json`, seed 20260705, 20 tasks
  (8 transformation / 4 construction / 4 reference / 4 reading), all
  pre-registered before any scored call
- Raw records: `results/raw/pilot-anthropic_claude-sonnet-4.5.jsonl`
  (gitignored; regenerate with `bun run pilot`)
- Pilot spend: ≈ $1.70 subject + ≈ $0.20 describer/audit

## Headline numbers

| Condition | Success | pass@1 | First-pass validity | Tokens (in+out) | Latency |
|---|---|---|---|---|---|
| A (HTML + rewrite) | 17/20 (85% [64,95]) | 17/20 | 16/16 | 71,428 + 37,869 | 375 s |
| C (JSON + tools)   | 18/20 (90% [70,97]) | 18/20 | 16/16 | 270,219 + 7,348 | 172 s |

Paired: both=16, A-only=1, C-only=2, neither=1 → McNemar exact p = 1.0.
**No condition difference is detectable at n=20; the pilot's job was
validating the pipeline, and it did.**

Full per-family and per-bucket tables: run
`bun run report results/raw/pilot-anthropic_claude-sonnet-4.5.jsonl`.
Notable cells: transformation A 7/8 vs C 8/8; reading 8/8 overall
(includes the 177-node tree in both formats); reference 3/4 in each arm;
construction 3/4 in each arm (same task failed both — see below).

## Failure autopsy (all five failures audited)

1. **`const-s-4`, both arms — bad task, not model failure.** The
   held-out describer hallucinated on a 17-node tree: its spec claims
   the document has "exactly four direct children" (it has two) and
   invents a fifth subtree duplicating an existing one. Both subjects
   were graded against the true target and correctly failed. **Design
   fix required before the full matrix** (see below).
2. **`trans-s-4` × A and `refer-s-1` × A — genuine model failures, one
   shared signature.** In both, the model *invented an attribute* on
   the node it was asked to insert (`aspectRatio:"16:9"` on a bare
   image-atom; `layoutSize:"standard"` on a bare page). Reproduced
   byte-identically on re-run at temperature 0. Early signal that the
   rewrite arm's failure mode is unrequested embellishment of new
   nodes — worth watching at full scale (it is exactly what the drift
   metric family is about).
3. **`refer-m-4` × C — nondeterminism.** The original run failed
   phase 2; an identical audit re-run passed. Temperature 0 does not
   make provider inference deterministic. The full matrix should expect
   a small flake rate in both arms and report it.

## Pipeline findings (what the pilot caught)

- **Harness bug (fixed):** `passAt1` was computed before `success` was
  assigned for reference tasks, under-reporting pass@1 (0/4 instead of
  3/4 per arm). Fixed in the runner; the report now derives pass@1 from
  the per-call log, so existing JSONL reports correctly.
- **Observability gap (fixed):** records didn't store final trees, so
  failures couldn't be audited from the log. Runner now logs
  `detail.finalTree` (and phase trees for reference tasks);
  `scripts/audit.ts` re-runs single cells with a graded diff.
- **Describer reliability (open — must fix before full matrix):** one
  of four specs (25%) was unfaithful at only 17 nodes. Planned fix: a
  mechanical spec audit at corpus time (names, attribute values, and
  child counts in the spec checked against the target; regenerate on
  mismatch), which is legitimate pre-registration work since it runs
  before scoring. Construction sizes should stay ≤ s-bucket.
- **Drift metric blind spot (documented):** drift counts changes to
  source nodes and new-node count mismatches, but not wrong *content*
  on new nodes (success catches that; both A failures had drift 0).
  Fine for the full matrix if documented, or extendable.
- **Token asymmetry worth designing around:** C consumed 3.8× A's
  input tokens (tool loops re-send context each step) but 5× less
  output; at Sonnet pricing the arms cost nearly the same (A $0.78 vs
  C $0.92) while C was 2.2× faster wall-clock. Prompt caching (gateway
  reports cached-input pricing at 10%) would change C's economics
  materially — the full matrix must either enable it for all arms or
  count it explicitly, and report cost both ways.

## Hypothesis signals at n=20 (not evidence, direction only)

- H1 (format fluency): no signal — first-pass validity 16/16 in both.
- H2 (strategy): no size crossover visible; both arms solved all l-bucket tasks.
- H3 (cost): raw total tokens favor A (109k vs 278k); dollar cost is ~even; latency favors C.
- H4 (reference stability): 3/4 both arms; zero id-reference failures.
- H5 (reading): 8/8 both formats — questions may be too easy; consider harder question kinds at full scale.

## Full-matrix cost projection

Pilot unit economics (Sonnet 4.5 at $3/M in, $15/M out): $0.043 per
task×condition cell average ($0.039 rewrite, $0.046 tools).

Full matrix per BRIEF: ~200 tasks × 5 conditions × 2 regimes ×
3–4 models ≈ 6,000–8,000 cells:

| Scenario | Cells | Est. cost |
|---|---|---|
| 3 models, all Sonnet-tier pricing | 6,000 | ≈ $260 |
| 4 models, mixed tiers (1 frontier ≈ 3×, 1 small ≈ 0.3×) | 8,000 | ≈ $400–650 |

Plus describer for ~50 construction targets (≈ $5–10), a ~15% buffer
for flakes/retries, and reference tasks' second phase (already in the
per-cell average). **Realistic total: $350–750** depending on the model
roster — consistent with the BRIEF's "few hundred dollars" gate.

## Recommended before full matrix

1. Implement the mechanical describer-spec audit (corpus-time, pre-registered).
2. Decide the prompt-caching policy and count cached tokens in cost metrics.
3. Harden reading tasks (add count-type-under and deeper questions to the mix).
4. Pick the model roster and re-confirm gateway ids + snapshot dates for the report's limitations section.
5. Implement conditions B, E (required) and D (strongly preferred) plus the best-effort prompt regime, with tests, and pre-register the tuned prompts by commit before any scored run.
