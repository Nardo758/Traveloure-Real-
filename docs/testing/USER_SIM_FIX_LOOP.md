# User-Simulation Fix Loop — Aug 7, 2026

**Method.** Coordinator (Fable) delegated ALL testing and fixing to Sonnet worker agents and did only
triage, review, guard/CI verification, sandbox reboots, and two ~5-line residual fixes. Loop shape:
**fix wave → guards/tsc/build → reboot hermetic sandbox → user-simulation test wave (one agent per
console pretending to be that user) → triage → next fix wave**, exiting when a wave reports zero
unfixed errors. Two full iterations were needed. Sandbox: local PG 16 + production bundle on `:5000`,
CI-stub keys — the journey-suite recipe.

**Origin.** Inputs were the cross-console relay findings (CC-1…CC-10, `CROSS_CONSOLE_RELAY.md`), the
expert walkthrough residue (EX-3/EX-4), and a scout's code-trace of the Final-Plan→Trip-Card
pipeline (which added CC-11 and confirmed the unbuilt QA-punch-list-13 dress change).

## Coverage (test wave, 6 agents, each as a real user)

| Agent | Surface | Coverage | Outcome |
|---|---|---|---|
| T1 | Traveler | 50 routes + 3 rendered pages | 47 pass, 1 finding (T1-1) |
| T2 | Expert (9 stations) | 77 routes + 3 rendered pages | all pass, 1 decision item (T2-1) |
| T3 | Provider | 27 routes + 13 rendered pages | 2 FAIL (T3-1/2), 2 findings |
| T4 | Admin | 41 endpoints + queues + security probes | 1 FAIL (T4-1); default-deny fully holds |
| T5 | Final-Plan→Trip-Card (12-step script) | traveler+expert+admin trio | 10/12; T5-1 (high) |
| T6 | AI features (8 endpoint groups + browser) | generate/regenerate/optimize/chat/expert-AI | 6 findings (T6-1…6) |

Zero dead routes (200-HTML on /api) anywhere. All 14 wave-1 regression checks verified in-app.

## Fixed and re-verified (V3 agent re-tested every one against the rebuilt bundle)

| ID | Fix | Verification |
|---|---|---|
| CC-1/EX-3 | Expert item provenance server-derived; accept writes `assignment_accepted` diary row | db tests 5/5; T2 in-app |
| CC-2a/b, CC-3 | Public share page: no internal status, no unpurchased price, chronological sort | T1 in-app (AM before PM; no leak) |
| CC-5/6/8 | Expert application: content gate, scorer shape normalizer, response projections | T2 in-app ({}→400; no internals echoed) |
| CC-7 | Pending-invite notification reads as invitation (type kept — 2 client consumers) | T2 in-app |
| CC-11 | PlanApprovalBanner mounted on SlipView (bell landing surface) | T5 step 4, V3 #12 |
| CC-13 | transport-gap parser now AM/PM-aware (shared tested util) | unit pins |
| EX-4 | Payout button disabled at $0 / not-connected | T2 browser DOM check |
| T1-1 | Regenerate preserves expert items + confirm dialog (provenance for traveler-manual items needs a schema column — deferred, documented in code) | V3 #5 (item survives; dialog gated correctly) |
| T3-1 | duplicateService mints fresh trackingNumber; catches log | V3 #2 |
| T3-2 | ServiceForm delivery-method round-trip faithful for all 7 canonical values | V3 #4 (pdf stays pdf) |
| T3-4 + NEW-2 | PATCH and both duplicate responses omit `revenueShareRate` (§18 read-side parity with POST) | V3 #3; direct curl (duplicate 201, field absent) |
| T4-1 + NEW-1 | Tourism analytics: `EXTRACT(date-date)` SQL fixed AND the route now actually calls the seasonality/eventTypes helpers it destructured | direct curl: 200, 12 months, eventTypes populated |
| T5-1 | `/trip/:tripId` PlanCard consumes the LIVE plancard DTO (static days-prop bypass removed; latent `trip.id="undefined"` bug fixed; regenerate invalidates the key) | V3 #6 (banner + routing badge now render on the Trip Card) |
| T6-1/2 | AI provider failures always sanitized 503 (shared `ai-error-sanitizer`, 9 pins); breaker chooses `retryAfterSeconds` only, never whether to sanitize | V3 #7/#8 (8/8 sanitized, zero leaks) |
| T6-3 | Chat failure: optimistic bubble rolled back, input restored, destructive toast | V3 #10 |
| T6-4 | Expert AI-task errors sanitized; failed regenerate reverts status in-handler (no stuck `regenerating`) | V3 #9 |
| T6-5 | `trackAnthropicResponse` wired into the primary generate-itinerary call site (routes.ts:1222) | code-read (behavioral proof needs a real key) |

**Regression net:** journey suite green on the final bundle (6 passed / 4 skipped / 0 failed,
including J13 over the changed share surface and both ruling-38 checkout contracts). All 9 CI guards
green. All pins + db proofs 46/46. **tsc ratchet: 197 → 190**, `TSC_BASELINE` lowered in the same
change (down-only rule).

## Left open, deliberately (decision-maker items — not silently dropped)

1. **T2-1:** a *pending* (unaccepted) advisor can already write itinerary items —
   `TRIP_ADVISOR_ACCESS_STATUSES` deliberately includes `'pending'` (documented allow-list).
   Tightening it changes access semantics; needs a ruling.
2. **Traveler-manual vs AI item provenance:** indistinguishable (both `suggestedBy` null); a
   provenance column is a schema change (Coordination Prevention rule). Until then regenerate
   protects only expert items.
3. **QA punch-list 13:** the ratified "polished final Trip Card" dress change on approval remains
   unbuilt (banner-only today) — a design build, not a bug fix.
4. **CC-4:** the `in_review` dwell (both advances in ~40ms) is enforceable only by a product rule
   that doesn't exist yet.
5. **CLAUDE.md §9 staleness:** `experts.routes.ts` is described as dark but is mounted in this build
   (unmounted-router guard: 37/37 mounted). Doc correction held for decision-maker sign-off since §9
   is a Locked-Decisions entry.
6. **T6-6:** one-off session-cookie collision seen once during T6 setup in the shared sandbox; not
   reproduced; recorded here so it isn't lost.

## Rulings wave (same day — decision-maker answered items 1–3 above)

Ruled: (1) **NO** — pending advisors may not write; (2) **YES** — provenance column; (3) **finish**
the polished final Trip Card. Landed as one wave (V4-verified 11/11, journey suite green):

- **Write gate:** `TRIP_ADVISOR_WRITE_ACCESS_STATUSES` (accepted/assigned) now gates item
  create/edit/delete/reorder; pending advisors keep read surfaces (assigned-trips, plancard). All
  ~50 advisor-access consumers classified read vs write in the D12 report; routing transitions,
  suggestions and comments deliberately stay on their own documented contracts.
- **Provenance:** migration 181 adds `itinerary_items.origin` (`'ai'|'traveler'|'expert'`, nullable,
  app-enforced, no CHECK — publish-trap avoidance; declared in `shared/schema.ts` per deploy-push
  authority). Server-stamped at 10 write sites, client value stripped both at the schema omit and
  the route. Regenerate now spares `origin='traveler'` AND `suggestedBy='expert'`; legacy NULL rows
  keep old replace semantics (ambiguous by construction, documented inline). CLAUDE.md Locked
  Decisions item 12 records both rulings.
- **Final dress:** PlanCard renders the polished-final treatment (`plancard-final-dress` testid,
  existing tokens only) when approved or trip-card-primary; proven absent before approval, on the
  public share page, and on proposal/embedded surfaces. SlipView's absence is structural (it never
  mounts PlanCard's root) — noted, not a gate.

**New decision item from V4 (info):** even an ACCEPTED expert cannot PATCH/DELETE existing itinerary
items — those two handlers are `verifyTripOwnership`-only (owner-only edit/delete); experts can only
create. Ruling 1 is not violated (pending is denied everywhere); the question is whether accepted
experts *should* be able to edit/delete via those endpoints. Needs a ruling before anyone "fixes" it.

## Not covered (unchanged standing gaps)

Payment-complete legs (needs staging `sk_test_`); EA console; message threads; multi-traveler
collaboration; `#PS18` allowlist conversion (186 omit-schemas — CC-9 supplied fresh live evidence).
