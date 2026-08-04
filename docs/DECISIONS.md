# DECISIONS.md — the decision ledger

**Rules (ruling 26):** append-only. One line per ruling: number, date, tag, decision, amends-pointer if any, context link. Amendments are NEW entries pointing back — never edits. When any spec/brief and this ledger disagree, the ledger wins; code is ground truth over every document; a ledger-vs-code disagreement is a finding, never a silent divergence. Briefs cite rulings by number — they may quote verbatim with the number, never paraphrase.
**Tags (ruling 26 §3, sharpened by 27):** `[guarded: <check-name>]` = enforced by a machine check that **runs in CI on every push/merge** (a script not wired into CI is not a guard — it is MISSING). `[advisory]` = judgment/process ruling, ledger only. `deferred:<lane>` marks a guard owed by a named lane; the ledger lint warns until the lane merges, then fails.

## Numeric series (open — all new rulings append here)

| # | Date | Tag | Ruling | Context |
|---|------|-----|--------|---------|
| 1 | 2026-08-02 | [advisory] | PR #348 merged (trip_contexts re-key), honest backfill. | SLIP_EXPERIENCE_DISPATCH.md |
| 2 | 2026-08-02 | [advisory] | Lane 3 = Option B: date-derived admin phase; trips.status deprecated-in-place, future owner = Phase 4 brief. | L3-trips-status-brief.md |
| 3 | 2026-08-02 | [advisory] | Optimizer read scope: optimizable = in_planning + ready_for_checkout; purchased = read-only constraints; with_expert excluded. | SLIP_EXPERIENCE_DISPATCH.md |
| 4 | 2026-08-02 | [advisory] | Drop policy (a): variants may not drop ready_for_checkout items; policy (b) documented future refinement. | SLIP_EXPERIENCE_DISPATCH.md |
| 5 | 2026-08-02 | [advisory] | Guest cart-fallback until G2; gates strictly on guest-ness; retirement is a G2 exit criterion. | SLIP_EXPERIENCE_DISPATCH.md |
| 6 | 2026-08-02 | [advisory] | Slip identity + transition log approved as Lane S (post reconcile Phase 1b). | SLIP_EXPERIENCE_DISPATCH.md |
| 7 | 2026-08-02 | [advisory] | Optimizer contract-row amendment ships with Lane 6 code. | SLIP_EXPERIENCE_DISPATCH.md |
| 8 | 2026-08-02 | [advisory] | Four-tab mockup ratified as the Spec A/B/C build reference. | SLIP_EXPERIENCE_DISPATCH.md |
| 9 | 2026-08-02 | [advisory] | Already-built inventory binding; agents build only remaining scope; Lane 6 = residue (rejection check, transactional apply, variant discard). | SLIP_EXPERIENCE_DISPATCH.md |
| 10 | 2026-08-02 | [guarded: check-trip-mint-owner-access] | Tracking number: reuse trips.trackingNumber; derivation retired; close NULL mint paths; tripwire. | SLIP_EXPERIENCE_DISPATCH.md |
| 11 | 2026-08-02 | [advisory] | Diary: new append-only item_transition_log; itinerary_changes keeps display semantics; variant_applied single-writer moves; feed derivation = named follow-up. | SLIP_EXPERIENCE_DISPATCH.md |
| 12 | 2026-08-02 | [advisory] | Same-transaction log writes for all status transitions incl. money-path; cosmetic events best-effort. (Amended by 18.) | SLIP_EXPERIENCE_DISPATCH.md |
| 13 | 2026-08-02 | [advisory] | Role-hygiene lane first; mint-path tripwire now, getTripRole architectural fix = named follow-up; jsonb class-B remediation precedes any workspace consumption. | SLIP_EXPERIENCE_DISPATCH.md |
| 14 | 2026-08-02 | [advisory] | Apply discards unshared losing variants only; selected variant + metrics retained (sanctioned copy, equals slip by construction); losing-variant-share "outdated proposal" treatment = named follow-up. | SLIP_EXPERIENCE_DISPATCH.md |
| 15 | 2026-08-02 | [advisory] | In-checkout rejection check uses the two-key predicate (providerServiceId ∥ title), FAIL-CLOSED (unmatched ⇒ reject); originalItemId column = follow-up only if false rejections occur. | SLIP_EXPERIENCE_DISPATCH.md |
| 16 | 2026-08-02 | [advisory] | Trip-scoped events log as trip-level rows (itemId NULL); grain follows the event. | SLIP_EXPERIENCE_DISPATCH.md |
| 17 | 2026-08-02 | [guarded: check-trip-mint-owner-access] | Tracking numbers minted on ALL 5 mint paths incl. NULL-owner authoring builds; no exemptions; tripwire covers. | SLIP_EXPERIENCE_DISPATCH.md |
| 18 | 2026-08-02 | [advisory] | Amends 12: flip+log atomic pair inside helper-internal transaction; outer money-path swallow retained; swallowed failure MUST alarm (ops-visible error w/ ids) + Lane S ships the bookings-vs-purchased reconciliation health-check. | SLIP_EXPERIENCE_DISPATCH.md |
| 19 | 2026-08-02 | [advisory] | varchar(20) tracking headroom = named follow-up (own verified ALTER, not opportunistic); migration numbering re-verified at merge (chain-integrity test is arbiter); traveler delete-optimize-row loss accepted per 11's follow-up. | SLIP_EXPERIENCE_DISPATCH.md |
| 20 | 2026-08-04 | [advisory] | Ground-truthed fixed flags become expected-PASS regression assertions citing fixing commit. | console-sigma lane review |
| 21 | 2026-08-04 | [guarded: matrix-lint, deferred:journey-suite-wave-1] | Expected-fail ABSENCE rows carry an expiry tag (deferred:<lane>) and MUST flip to expected-PASS in the wave their lane merges. | console-sigma lane review |
| 22 | 2026-08-04 | [advisory] | Console reorder heuristic = second-query-engine class; assert divergence now; remediation (reorder consumes the optimizer's constraint service) = named follow-up, not harness scope. | console-sigma lane review |
| 23 | 2026-08-04 | [advisory] | Kyoto expert fixture seeded in Phase 2 via full approval lifecycle; tests never bypass the Kyoto submit gate; fixture-bench gaps feed the journey suite's role/fixture inventory. | console-sigma lane review |
| 24 | 2026-08-04 | [advisory] | Harness v1 = workspace machine only; per-item routing layer enters as deferred:phase-4 cells. | console-sigma lane review |
| 25 | 2026-08-04 | [advisory] | Client-computed next-status = client-trusted-input class; server owns transition derivation; expected-fail now, inversion = small named follow-up. Expert-favorable 0.75 fallback moves into fee_bands as a default row (safety net lives in the single source of truth); files to the standing fee-literal follow-up. | console-sigma lane review |
| 26 | 2026-08-04 | [guarded: check-decision-guards] | Execution Protocol adopted: durable/volatile rule, ledger authority, guard classification, merge write-back checklist, thin CLAUDE.md. | Execution Protocol dispatch |
| 27 | 2026-08-04 | [guarded: phase2-fee-gate, chain-integrity] | Guard gaps: wire, don't defer, for the two that exist — fee-literal grep and chain-integrity wired into CI in the protocol lane. Matrix lint = journey-suite lane deliverable #1 (see 21's deferred tag). Env allowlist remains a named candidate. Sharpened definition: guard = runs in CI on every push/merge; script-only = MISSING. | Execution Protocol Phase 0 review |
| 28 | 2026-08-04 | [advisory] | R-A..R-J folded into this ledger as a closed "Console Realign series" block under their existing letters; no renumbering; all future rulings use the numeric sequence only; the brief carries a pointer line. | Execution Protocol Phase 0 review |
| 29 | 2026-08-04 | [advisory] | CLAUDE.md findings-class content moves to one chronological archive doc (docs/findings/CLAUDE_MD_ARCHIVE.md), every entry with its as-of SHA; where a live audit doc owns a topic, the archive entry points to it; migration post-mortems stay intact in the archive. | Execution Protocol Phase 0 review |
| 30 | 2026-08-04 | [advisory] | PR template = the §4 merge write-back checklist and nothing else; any future section addition requires a ruling. | Execution Protocol Phase 0 review |
| 31 | 2026-08-04 | [advisory] | Old-but-determinable provenance gets the real SHA plus an explicit STALE flag (e.g. audited@0b47ea44 2026-06-03 — STALE, re-verify before use); audited@unknown is reserved for genuinely indeterminable provenance. | Execution Protocol Phase 0 review |
| 32 | 2026-08-04 | [advisory] | Fee-band scope reclassification: the EXPERIENCE_CART 0.30 literal was display/diagnostic-only (calculateCommission is the DB-free breakdown; real cart charges resolve per-item via resolveCommissionRates) — it matched no actual charged rate. Rule going forward: any move of a fee literal into fee_bands must state which surface the band controls (band-key constant + migration header) and ship a DB-backed test proving an admin band edit changes the resolved value and a missing/inactive band fails loudly. Supersedes ruling 25's implicit framing of 0.30 as the canonical checkout rate; migration 174 (experience_cart_checkout band + requireExperienceCartRate) implements it. | fee_bands migration completion review |

## Console Realign series (CLOSED — ruling 28; original letters preserved; full text lives in docs/briefs/CONSOLE_REALIGN_BRIEF.md §"Ratified decisions")

| ID | Date | Tag | Ruling (verbatim first clause; full text in the brief) |
|----|------|-----|--------|
| R-A | 2026-08-03 | [advisory] | "The existing dashboard design stays byte-for-byte EXCEPT: (1) a compact slip strip caps the embedded Plan Card … (2) the 'New experience' CTA keeps its look but opens the intake panel (R-C)." |
| R-B | 2026-08-03 | [advisory] | "All trip creation converges on `POST /api/trips` → `storage.createTrip` (mints owner row + trackingNumber)." |
| R-C | 2026-08-03 | [advisory] | "'Plan new' becomes a PANEL (opened from any + New plan / New experience CTA), not a sidebar destination." |
| R-D | 2026-08-03 | [advisory] | "The chat stays; a live DRAFT PANEL (TripContext fields) fills only from what the conversation actually establishes … No trip is persisted unless created." |
| R-E | 2026-08-03 | [advisory] | "Planning-phase arrivals land on the slip: create (any door), both apply paths (the `?autoApply=1` divergence dies), My plans 'View' …" |
| R-F | 2026-08-03 | [advisory] | "Additive nullable `trips.finalized_at` timestamp (NOT a revival of the dead `trips.status` — Lane 3 Option B stands)." |
| R-G | 2026-08-03 | [advisory] | "Retire entries: Plan new (→ panel), Messages (→ Inbox's Messages tab; /chat stays the thread page), Notifications page …" |
| R-H | 2026-08-03 | [advisory] | "Home gains 'While you were away' … and 'Today's move' … Every line traces to a real row — no invented nudges." |
| R-I | 2026-08-03 | [advisory] | "§13 widget fixes — MANDATED, ship first: TravelPulsePanel wired to real endpoints; greeting derived from real notifications or removed; PlanCard.tsx tripId filter fixed." |
| R-J | 2026-08-03 | [advisory] | "Connected AI — MCP connector, LATER lane, gated on R-B … agents build & stage, humans pay." |

## Guard registry (reality as of 2026-08-04 — ruling 27 note: the protocol name-checked six from memory; reality has eleven)

In-CI guards (name → script → CI location):

| Guard | Script | CI |
|-------|--------|-----|
| mint-path owner tripwire + trackingNumber tripwire (rulings 10, 17) | `scripts/check-trip-mint-owner-access.cjs` | build.yml |
| claims-only lookups | `scripts/check-claims-only-user-lookups.cjs` | build.yml |
| money-endpoints | `scripts/check-money-endpoints.cjs` | build.yml |
| unmounted-routers | `scripts/check-unmounted-routers.cjs` | build.yml |
| linkage-preservation | `scripts/check-linkage-preservation.cjs` | build.yml |
| upsell-trust-contract | `npm run test:upsell-contract` | upsell-trust-contract.yml |
| noop-migrations | `scripts/check-noop-migrations.ts` | (Replit workflow gate) |
| fee-config-parity | `scripts/verify-fee-config-parity.ts` | selection-controls-gate.yml |
| migration-ledger idempotency | `scripts/verify-migration-ledger.ts` | selection-controls-gate.yml |
| fee-literal grep (phase2-fee-gate) | `scripts/phase2-fee-gate.sh` | build.yml (wired by ruling 27) |
| chain-integrity | `server/migrations/__tests__/chain-integrity.test.ts` | build.yml (wired by ruling 27) |
| decision-guards ledger lint | `scripts/check-decision-guards.cjs` | build.yml (ruling 26) |

Named guard candidates (not yet guards — MISSING until in CI): matrix lint w/ expiring deferred tags (owner: journey-suite wave 1, ruling 21/27) · env allowlist · single-writer-per-event-type (11) · log append-only route inventory (per 12/18) · no-second-scheduling-heuristic (22 remediation) · apply-never-writes-routing_status grep.
