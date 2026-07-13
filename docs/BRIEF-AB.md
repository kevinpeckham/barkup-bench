# Addendum brief — Study AB: does the shipped precedence clause stop the memo from trampling the user?

**Pre-registration, committed before any scored AB run.** Study AA
measured the memo's edge: with a standing rule restated in the
session-notes tail, models enforced the rule AGAINST a request that
explicitly countermanded it (opus 12/12, sonnet 9/12; every base-arm
cell honored the countermand 36/36). Replicator v3.188.1 (commit
ce06373) shipped a mitigation the same day — a precedence sentence
INSIDE the memo block header, adjacent to the notes it governs. It is
the same intervention class AA-H2 measured as statistically useless
(a meta-sentence about priority), with two distinguishing features:
placement at the point of injury rather than buried in a styleguide,
and AA-H2's own detail that the meta-rule moved things in the right
direction and never backfired. The clause shipped as flagged,
untested insurance. Study AB tests it verbatim.

## Shipped artifact (ported verbatim from slx-replicator v3.188.1, commit ce06373)

`formatSessionNotesBlock` v3.188.1 — identical to the v3.183.0
formatter Studies W/Y/Z/AA used except the block header now ends with
the precedence clause, verbatim:

> `PRECEDENCE: a direct, explicit instruction in the current request
> overrides any note here for that request — the memo carries
> standing intent, not vetoes (a one-off override is not a
> retraction; keep the note unless the user retracts it).`

Ported as `formatSessionNotesBlockV2` in `src/shipped/session-notes.ts`
(the v3.183.0 export is untouched — W/Y/Z/AA identity is preserved),
character-identity tested against the replicator source when the
sibling checkout is present.

## Design

**Corpus: reused, not regenerated.** The Study AA conflict corpus
(`corpus/conflict.json`, seed 20260721) — specifically its 12
`override` tasks (the countermand cells where the injury shows) and
its 12 `ri` tasks (where the memo's measured BENEFIT shows). The 12
`rr` tasks are excluded (no countermand, no steering gate; disclosed).

**Arms (2):**

- **AB-memo** — Study AA's AA-memo construction verbatim (v3.183.0
  block formatter). A contemporaneous replication of the injury,
  so the comparison does not lean on AA's recorded cells across a
  model-snapshot boundary.
- **AB-clause** — identical except the dynamic tail is built with the
  v3.188.1 formatter (the shipped precedence clause, nothing else
  changed).

24 tasks × 2 arms × 3 models (sonnet-4.5, gemini-3.5-flash,
opus-4.8) = **144 cells**. Protocol otherwise exactly Study AA:
condition-F anchored patches, focused minimal views, the shipped
cached-system layout, `maxOutputTokens: 60000`, temperature 0, ≤3
correction rounds, resumable JSONL `results/raw/studyab-<model>.jsonl`,
pack-grouped execution, cacheRead/cacheWrite recorded, cache audit
re-run. Readings classified by Study AA's registered classifiers,
unchanged.

## Pre-registered hypotheses

- **AB-H1 (protection — the gate):** on the override cells,
  AB-clause honors the countermand (reading `honored`) more often
  than AB-memo — McNemar paired by task per model, and the gate is
  **opus** (AA's 12/12 trampling): p < 0.05 in the honored direction,
  AND zero violations/contamination introduced. Sonnet (AA: 9/12
  trampled) same test, reported; gemini is at floor (AA: 0/12
  trampled) and is a no-regression check only.
- **AB-H2 (steering preserved — the co-gate):** on the ri cells,
  AB-clause's satisfy-both rate is not significantly BELOW AB-memo
  per model (McNemar, p > 0.05 or clause-favoring). The clause must
  not buy protection by destroying the memo's measured benefit
  (AA-H4: sonnet 2/12 → 11/12).
- **Replication check (descriptive):** AB-memo should reproduce AA's
  injury (opus trampling near 12/12). If it does not, the
  AA-vs-AB-memo drift is disclosed and the paired AB comparison
  stands on its own.

## Interpretation table (pre-registered)

| AB-H1 (opus) | AB-H2 | Reading |
|---|---|---|
| passes | passes | The clause is validated protection — ships as measured, digest upgraded from "insurance" to "proven" |
| passes | fails | Protection costs steering — the tradeoff ships documented, builder chooses per surface |
| fails | passes | The clause is insurance-only, as flagged — authoring/app-side separation remains the real fix |
| fails | fails | Remove-the-clause territory — disclosed either way |

## Decision rule

The obtaining row lands in barkup's docs and the Replicator digest
(upgrading or demoting the shipped clause's status), plus a REPORT
addendum. **Expected spend $1–3**; abort past $10.

Honesty rules unchanged: this brief, the verbatim v3.188.1 port with
its identity test, and both arm constructions are committed before the
first scored call; results publish whatever they show.
