# Study brief — Study AW: does Turso enforce foreign keys, and what decides it?

**Pre-registration, committed before any measurement.** Designed from the
handoff `~/projects/_handoffs/2026-10-30-turso-foreign-key-enforcement.md`
(the lj-website session, at Kevin's request). Zero model spend — this is a
database-behavior study with no LLM anywhere in it. **The run is BLOCKED
until Kevin supplies a Turso API token scoped to a sandbox organization
or group** (`TURSO_API_TOKEN`, `TURSO_SANDBOX_ORG`, `TURSO_SANDBOX_GROUP`);
the runner refuses to start without all three and never touches a
database it did not create.

## The question

Two production apps built real engineering on opposite answers. Stem
Shovel (September, `@libsql/client` 0.18.0): "Turso runs with
`PRAGMA foreign_keys = 0`, the schema's onDelete rules never fired" —
and shipped 441 lines of hand-written cascades plus an orphan sweep.
Replicator (October, 0.17.4, Turso engine databases): cascade, set-null
and violation-rejection all PASS with no pragma set anywhere — and 159
FK actions depend on that. At least one is wrong, or they measured
different things.

A verified inconsistency sharpens it: Replicator's own probe script
(docs/superpowers/plans/2026-10-24-db-env-separation.md, ~line 559) runs
`PRAGMA foreign_keys = ON` before testing the cascade, while its verdict
note says the cascade fired "with no pragma set". So pragma state is a
measured axis here, never an assumption.

## The instrument (committed, self-proving)

`src/aw/fkProbe.ts`: one connection-shaped probe that reads
`PRAGMA foreign_keys` FIRST, then measures three behaviors on its own
prefixed throwaway tables — ON DELETE cascade, ON DELETE set null,
violating-insert rejection — and reports whether the behaviors cohere
(all-or-none) and whether the pragma reading predicted them.
`tests/fk-probe.test.ts` proves the instrument detects BOTH states
(enforcing and non-enforcing) on a local file database with classical
SQLite semantics, under both client versions the apps pin, before it is
pointed at anything remote. The probe drops its tables and leaves
nothing behind.

## Factors

- **Database kind** — created with and without the engine flag; the kind
  of every created database is determined EMPIRICALLY (the
  `__turso_internal_mvcc_meta` marker), never assumed from the creation
  call. If only one kind can be created on today's platform, the axis
  collapses and is disclosed, not sampled around.
- **Client version** — `@libsql/client` 0.17.4 (Replicator's pin) and
  0.18.0 (Stem Shovel's pin, which IS the current npm release at
  registration), installed side by side as exact-pinned aliases.
- **Connection usage** — shared client with one `execute` per statement;
  a fresh client per statement; each statement as a one-statement
  `batch`; an interactive transaction per probe.
- **Pragma arm** — none; `foreign_keys = ON` in a prior execute on the
  same Exec; `OFF` in a prior execute. (Whether a prior-execute pragma
  sticks across libSQL's remote protocol is hypothesis 1 under test; in
  the fresh-client-per-statement usage the pragma lands on a different
  connection BY CONSTRUCTION, which is the measurement, not a bug.)
- **Repetition** — 3 repetitions per cell on fresh connections.
- **First-connection axis** — 6 fresh databases per kind; the probe runs
  on the very first connection ever made to each (no pragma), then on 3
  subsequent fresh connections, to separate Replicator's claimed
  cold-start artifact from a steady state.
- **Drizzle arm** — one cell per kind per client through
  `drizzle-orm/libsql` exactly as both apps wire it (drizzle 0.45.4,
  both apps' pin), so the result transfers.

## Gates (mechanical; computed from results/aw.json)

- **AW-G1 (coherence):** in every cell, the three behaviors agree — all
  enforced or none. A split (say, cascade fires but violations pass) is
  a fail and the study's headline, whatever else happens.
- **AW-G2 (the pragma predicts, steady state):** in every NON-first-
  connection cell, the `PRAGMA foreign_keys` reading predicts the
  observed behavior (1 ⇒ enforced, 0 ⇒ not). The first-connection axis
  is excluded from this gate and reported separately, because
  Replicator's quirk — reading 0 while the cascade fires — is exactly
  what P2 expects there.
- **AW-G3 (determinism):** within a cell, all repetitions agree. Flapping
  enforcement is worse than either steady answer and gets full weight.

## Registered predictions (scored in the report, not gates)

- **P1:** enforcement is ON in every steady-state cell with no pragma
  set, on every kind, client and usage — Replicator's steady-state claim
  holds, and Stem Shovel's claim is FALSE on today's stack (its
  hand-written cascades are redundant but harmless; its September
  orphans need another explanation — most plausibly its own maintenance
  scripts, which run `pragma foreign_keys = off` and copy data).
- **P2:** the first-connection artifact reproduces: at least one of the
  6 fresh engine databases reads pragma 0 on its first connection while
  the cascade nonetheless fires.
- **P3:** a pragma set in a PRIOR separate execute does not reliably
  carry to subsequent statements over the remote protocol (per-
  connection pragma over stateless HTTP), so the `off-prior-execute` arm
  does NOT disable enforcement in the shared-execute usage; inside an
  interactive transaction it does.
- **P4 (disclosed limit):** this study measures today's platform and
  cannot adjudicate what Stem Shovel's database did in September — the
  database kind at that time was never recorded. The verdict is about
  the stack as it stands.

## Safety and budget

Throwaway databases only, named `aw-fk-*`, created in the sandbox group
and destroyed in a `finally` block (plus `--destroy-only` cleanup for
crashes). Never a URL the runner did not create. Budget: at most 14
database create/destroy cycles per kind flavor, $0 in model spend.
Neither app's dev, staging or production database is ever touched.

## What each answer changes

Per the handoff: steady enforcement → Stem Shovel's cascades are
redundant-but-harmless and its orphans trace to hypothesis 5;
usage-dependent enforcement → both apps need a tested guarantee on the
connections that run deletes, and Replicator's 159 FK actions are at
risk; kind-dependent → the kind becomes a release-note-worthy fact.
Whatever the result: a FINDINGS entry for both app repos and likely a
blog article (Kevin's working title: "Our database ignored every
ON DELETE CASCADE we wrote").
