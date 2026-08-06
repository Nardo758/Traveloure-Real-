<!-- Transcribed VERBATIM from the decision-maker's dispatch on 2026-08-06; no paraphrase, no restructuring. -->

# Provider-Sigma — Service Provider Console Test Harness

**Status:** Dispatch for Claude Code. Same pattern as console-sigma (expert console): Phase 0 read-only ground-truth audit → HARD STOP with findings + questions → Phase 1 DB-fact assertion harness → Phase 2 fixtures. Cap: queues behind `lane/reconciliation-detection`; begin when a slot opens. Branch: `lane/provider-sigma-test`. Header discipline: stamp `audited@<main-sha>` at Phase 0 start; every Phase resumption re-diffs the pin against current main first (protocol ruling 26). Governing sources (cite by number/section, never paraphrase): DECISIONS.md (esp. rulings 12/16/18 diary, 32 fee-band scope, 35 two-layer born-approved) · ROUTING_STATE_CONTRACT.md (provider row = NEVER across all routing states) · provider back-office specs + the dual-rate model · Trip-Gravity audit S8/S9 findings (booking-scoped posture ratified; repeat-pair rails rate recorded as spec-ahead-of-code) · the six-station console shell decision (Today · Work · Catalog · Calendar · Money · Grow; Today = mandatory landing, no tile-launcher).

## 0. The problem
The provider console is the least-audited money-adjacent surface on the platform. Expert-side got console-sigma (which found a live access regression, a second scheduling engine, and fee literals); traveler-side got the reconcile + journey suite; provider-side has only the gravity audit's cell-level pass. Yet providers touch: approval lifecycles, booking visibility, slot inventory, payouts, and the dual-rate attribution that decides which commission band applies to real money. J11/J12 (the provider journeys) are Wave 4 — post-beta — so WITHOUT this harness, provider-side money paths reach beta guarded by nothing but per-lane gates that have long since evaporated. Provider-sigma is the between-now-and-Wave-4 armor, and its findings feed provider back-office Phase 1 the way console-sigma's fed the workspace lanes.

## 1. Phase 0 — read-only ground-truth audit (HARD STOP at end)
Strictly read-only: static traces + DEV DB reads; no requests that mutate; no prod. Every claim file:line. Where spec and code disagree, code is ground truth and the disagreement is a recorded finding (the expected result: console-sigma found 4 of 6 spec claims stale; assume similar decay here).

**A. Access model.**
1. Every provider-console route + API endpoint: what gate guards it (file:line)? Verify booking-scoped visibility — a provider reads ONLY bookings for their own services. Probe the gate shape: bespoke `userId` comparisons vs. canonical helpers (the expert-side bespoke-gate class — inventory, don't fix).
2. The contract NEVER row, both directions: no provider payload contains `routing_status` or any trip-plan state; no provider endpoint can write any routing transition. Static trace of every provider-facing serializer/query.
3. The historically always-false `role === "provider"` class was fixed — verify the fix holds everywhere (regression candidates for expected-PASS assertions, fixing commits cited per ruling 20).
4. Cross-provider IDOR sweep: can provider A read/mutate provider B's services, bookings, availability, short links, payout rows? (Console-sigma's destructive-IDOR cluster pattern — check the equivalent here.)

**B. Approval lifecycle (services + provider onboarding).**
5. The actual state machine as coded (expect vocabulary drift from spec — console-sigma found unsubmitted→pending→approved/rejected, not draft→…). Where is born-approved prevented — schema-gate only, or DB layer too? Per ruling 35 single-layer = a finding, not a fix here (cite task #1042's scope).
6. Who can approve? Admin-only asserted; provider self-approval must be impossible including via smuggled fields (the strip-and-clamp pattern from the Kyoto fixture lifecycle proof — reuse those probe shapes).

**C. Money integrity.**
7. Dual-rate resolution: platform-sourced booking → full band; attributed short-link booking (`acquisitionRef` → short_links) → rails band. BOTH resolved from `fee_bands` rows — trace the resolution path; any literal found = MONEY_INTEGRITY finding with `fee-literal-debt:#<task>` filed per ruling 32. Confirm repeat-pair rails rate remains unbuilt (spec-ahead-of-code — record, don't build).
8. Slot inventory: `vendor_availability_slots` claimed-at-pay posture (audit-confirmed consistent) — verify it survived the #433 claim→authorize→promote rewrite. What state is a slot in during the provisional window, and does the TTL sweep's slot release show correctly on the provider's calendar? (New interaction since the gravity audit — trace it fresh.)
9. Payout surfaces: what the provider sees vs. what payout rows say; admin-initiated payout posture unchanged; provider can never self-trigger a transfer.
10. Confirm-completion → review gate: the flip's writes (does it diary per rulings 12/16/18? expected ABSENCE candidate — same class as console-sigma's D1, and possibly already covered by #1028's pattern — cite, don't duplicate), and whether completion triggers any credit/fee event (the D6 class — flag any money edge for the journey matrix).

**D. Console shell + CX.**
11. Six-station conformance: does the provider console land on Today, are the stations per the shell decision, or is there tile-launcher drift? (CX findings, expected-fail class, not remediation.)
12. Notification/email hygiene on provider events: post-#433, provider "New Booking Request" email fires only after authorization — assert as expected-PASS regression citing #433. What else emails providers, and does anything fire pre-authorization or on provisional state?

**E. Fixture bench.**
13. Inventory what a provider-sigma fixture needs vs. what exists: the known gap (no Stripe-Connect booking-ready provider; no attributed short-link fixtures) was disposed to ride Wave 4 with J11/J12. Open decision for the HARD STOP (recommendation included below): build the provider fixture HERE with the reconciling-seeder pattern (consume-don't-reseed, registered in the bench, Wave 4 consumes it later — reversing the Wave-4 disposition, which needs a ledger note if approved).

**Phase 0 deliverable:** `docs/testing/PROVIDER_SIGMA_AUDIT.md` — findings with the console-sigma taxonomy (MONEY_INTEGRITY / STATE_DIVERGENCE / ABSENCE / ACCESS / CX), a §-numbered questions block for Leon's rulings, and the expected-PASS/expected-fail split proposal. HARD STOP: findings return for rulings before any assertion code.

## 2. Phase 1 — assertion harness (after rulings)
DB-fact assertions per the journey-suite discipline; expected-fail rows carry `deferred:<lane-or-task>` expiries per ruling 21 (must flip when their fixer merges); divergences pinned as fact per the R22 pattern (fail loudly the day the fix lands). Anticipated skeleton, finalized by findings:
- Access set: booking-scoped visibility · cross-provider IDOR negatives · NEVER-row payload sweeps (no routing_status in any provider response) · role-gate regressions as expected-PASS w/ fixing commits.
- Lifecycle set: born-approved impossibility over real HTTP (strip/clamp probes) · approve-before-submit rejected · admin-only approval · resubmission path.
- Money set: dual-rate resolution both bands from fee_bands (no literals in expectations — assert against DB reads) · slot claim/provisional/release visibility incl. the sweep interaction · payout read-only posture · completion-flip diary row (or expected-fail ABSENCE with its task).
- CX pins: shell conformance, post-authorization-only emails.

## 3. Phase 2 — fixtures
Per the Phase 0 item 13 ruling: the booking-ready provider fixture (Stripe-Connect test account, approved service, availability slots) + attributed short-link fixture, built with the reconciling-seeder pattern (interrupted-run convergence proven, hermetic email, standard `{market}-{specialty}` convention), registered in the shared bench. Kyoto-market provider preferred for gate coherence.

## 4. What NOT to do
- Read-only in Phase 0 — no fixes, however obvious; findings only. Never confirm a write vulnerability with a successful write (IDOR probes prove access via reads/rejections, not mutations).
- Do NOT absorb: bespoke-gate consolidation, ruling-35 DB layer (#1042), repeat-pair rails build, any MONEY_INTEGRITY fix (file tasks + debt annotations), shell remediation.
- Do NOT touch prod or send real email; dev DB + hermetic providers only.
- Do NOT re-seed bench fixtures that exist; consume `test-admin@` and the Kyoto bench.
- Do NOT paraphrase rulings — cite numbers; new rulings claimed at ledger-append time per the numbering rule.
- Standing: DB-fact assertions; tsc ratchet holds or drops; §4 write-back checklist on every PR.

**One sentence:** ground-truth the least-audited money-adjacent console the way console-sigma did the expert side — access, lifecycle, dual-rate money, and shell — pin what's true, expected-fail what's absent with expiries, and leave a fixture bench Wave 4 inherits instead of builds.
