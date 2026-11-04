# Queued work, with triggers (not calendar guesses)

Items the bench owes when a named condition fires. Check this file at
the start of any bench session; remove items when delivered.

## 1. Follow-up article: "Three Agents, One Rule" (working title)

**Trigger:** BOTH of —
- the customer portal ships its FK plan (version 0.37.1 in
  slx-customer-portal's CHANGELOG; the plan is
  `_handoffs/2026-11-03-customer-portal-foreign-keys-PLAN.md` on the
  bench VM), AND
- Replicator lands its steps 1–3 (metadata CI guard, env-audit
  behavior probe, the 14 low-fan-out parent handlers; its proposal is
  `_handoffs/2026-11-03-replicator-fk-durable-fix-PROPOSAL.md`).

**The story, written with receipts rather than plans:** three agents on
three codebases independently measured the same platform fact
(Study AW + the 2026-11-03 correction), contradicted and corrected each
other across a handoff directory, and converged on one shared rule —
with the evidence being the shipped artifacts: drift tests that go red
when a schema adds an unhandled FK, three repos' fk-probes reporting
identical five-key outputs, orphan scans clean, and the bench's weekly
fk-watch guarding the platform signals. Angle: multi-agent engineering
coordination as practiced, not as demoed. Credits each agent's
contribution by name (the portal's non-reproduction catch and reference
implementation; Replicator's sweep-source argument and mock hazard;
stem-shovel's cascade.ts as the pattern everyone converged on).
Authority doc to cite: `2026-11-03-fk-coordinated-response.md` (also
committed in stem-shovel docs/). Banked anecdote: the floor rule's
first live firing (the portal demo census, 2026-11-03 evening) — a
CLEAN database that still exited 1 because ten unexamined edges are
not zero findings; before Amendment 1 the same run printed clean. Blog mechanics: via the replicator
MCP (the lj-website agent), never direct-DB scripts. Also add the
forward-resolution lines to the dashboard AW entry in the same pass
(the Study 12/15 precedent: a sentence noting the remediation landed,
linking forward).

## 2. Study AX: re-measure the engine pragma surface on the settled build

**Trigger:** EITHER —
- barkup-bench's fk-watch opens an issue with a probe-movement SIGNAL
  (the engine's behavior flipped again — register and run immediately,
  the flip is the corpus), OR
- two consecutive quiet weekly fk-watch probe readings after
  2026-11-10 (the rollout settled — register the re-measurement of the
  cells the Correction dated: the batch/transaction pragma arms and
  the persistence axis, expected now to read as PR #11095 semantics).

**Shape:** small zero-spend registered study, AW's instrument and
harness reused (scripts/run-aw.ts arms subset), new brief
(docs/BRIEF-AX.md) with gates stated against the CORRECTED
expectations; results join the dashboard (new entry + stats bump) and
the REPORT. Note the fk-watch CI probe only runs if the TURSO_*
secrets are configured on the repo; until then quiet weeks are
established by running `bunx varlock run -- bun scripts/fk-watch.ts`
locally.

## 3. Study AY: thinking effort on the guarded surfaces

**Origin:** Replicator's proposal
`_handoffs/2026-11-04-replicator-thinking-effort-PROPOSAL.md` and the bench
reply `…-REPLY.md` (2026-11-04). Phase 0 is already answered from the
committed 2026-10-21 fable-5.1 gate baseline at zero cost: thinking fired on
42/852 calls, 9,459/98,449 output tokens (10%), concentrated in the
precedence (71%) and standing-pack (54%) gates — the spec-conflict behaviors.
Small lever, worst possible place to cut. So AY waits for a trigger instead
of running on priors.

**Trigger:** EITHER —
- Replicator ships per-turn `thinking_tokens` telemetry in chat-logs (the
  providerMetadata path; suggested in the reply) and it shows a guarded
  surface spending materially on thinking in production, OR
- the next model/tier swap: the swap's gate run carries an `effort: low` arm
  in the same pass (one extra suite of marginal cost; Kevin's go-ahead per
  the spend gates).

**Shape:** the regression-gate suite on `claude-fable-5-1` at
`effort: low` (and `medium` if low reds), thresholds unchanged, paired
against the committed default-effort baseline; any red gate keeps that
surface on the default. PDF pipeline is a separate, costlier arm (AS/AT
frozen corpus) and only runs if the chat tier clears.

**Design notes (measured 2026-11-04):** `temperature` is IGNORED on Claude
5-family models through the gateway (AI SDK warning observed) — the runner's
`temperature: 0` is inert there, so run-to-run variance includes sampling +
thinking-length variance; power the arms accordingly. Thinking attribution:
ai v7 maps `outputTokenDetails.reasoningTokens` correctly (fable-5.1 probe:
867 out / 862 reasoning); ai v6 reads 0 there and only
`providerMetadata.anthropic.usage.output_tokens_details.thinking_tokens` is
true. Any study depending on thinking counts must include an instrument
cell: a known thinking-triggering prompt must read > 0 before arms run.

## 4. Housekeeping riding along with either item

- DONE 2026-11-03 (rode along with Study 16b's downstream, lj-website
  b1362ba): "scored model runs" → "scored runs" in five places; the
  static historical claim in about.json left as-is deliberately.
