# Cross-Console Multi-Agent Relay — Aug 7, 2026

**Run at:** `fb38fb34` (branch `claude/sync-local-repo-2j7ghv` = main `7240a33a` + the journey-suite
fixes). Hermetic sandbox: local Postgres 16, the **production bundle** (`node dist/index.cjs`) on
`:5000`, CI-stub Stripe/AI/Resend keys, `ALLOW_TEST_ACCOUNTS=1` — the journey-suite recipe. Four
**independent agents**, one per role, each holding its own authenticated session and using only that
console's rails (plus read-only psql verification). Screenshots in the session scratchpad
(`relay/provider-catalog.png`, `relay/admin-queue.png`, `relay/expert-workspace.png`,
`relay/shared-trip-public.png`).

**Why this run exists.** Every prior pass — the five-role walkthrough (Jul 29), provider-sigma,
console-sigma, the expert walkthrough (Aug 7) — was **single-role**: one console probed in isolation
against seeded data. Nobody had ever proven the platform can carry **one trip across all four
consoles**, with each role's output becoming the next role's input through the real rails. This run
is that proof: no seeded shortcuts on the relay path — the expert was approved because the expert
agent *applied* and the admin agent *approved*; the service was traveler-visible because the provider
agent *created* it and the admin agent *approved* it.

## 1. The relay (all legs succeeded, first run)

| # | Console | Actor / rail | Outcome (psql-verified) |
|---|---------|--------------|-------------------------|
| 1 | Provider | `kyoto-photography@…` → `POST /api/provider/services` | "Kyoto Relay Photo Session", $150, `active`, **born `submitted`** (`50e2a318…`) |
| 2 | Expert | `kyoto-food@…` → `POST /api/expert-application` | `local_expert_forms` row `pending` (`9af12417…`) |
| 3 | Admin | `test-admin@…` → both queues listed the items → `PATCH …/expert-applications/:id/status` + `POST …/provider-services/:id/approve` | expert `approved` (role promoted, enum-clamped); service `approved` and **publicly visible** on unauthenticated `GET /api/provider-services` (F2 read-gate) |
| 4 | Traveler | fresh `relay-traveler@…` → `POST /api/trips` → `generate-itinerary` → `POST /api/trips/:id/expert-advisor` | trip `0ffbdc91…`; `trip_expert_advisors` `pending` (`a3b99b5f…`); expert **notified** |
| 5 | Expert | `GET /api/expert/assigned-trips` surfaced the invite → `accept` → 2× `POST /api/trips/:id/itinerary-items` → 2× `workspace-status {"intent":"advance"}` | `accepted`/`draft` → items `5357ef05…` (Nishiki walk) + `cf3abf9a…` (Kaiseki dinner) → `delivered`; **2 `item_transition_log` rows** (#1028 diary); traveler notified twice |
| 6 | Traveler | notifications → items → J1 cart shapes → `POST /api/checkout` | **ruling-38 negative contract held exactly**: declared 503 `payment_unavailable`, cart intact, 0 purchase diary rows, 0 earnings; the `payment_pending` claim carries `stripeAttemptAt` (§15b, sweep-reclaimable) |
| 7 | Traveler → world | `POST /api/trips/:id/share` → unauth `GET /api/trips/shared/:token` → browser render | token minted; public API + rendered page both show **all three relayed artifacts** (both expert items + the photo-session item); `shared_trip_views` logged |

**Bottom line: the platform CAN relay a finished trip across all four consoles.** Every rail on the
path exists, is mounted, and is authorized correctly (the assigned expert could write itinerary items
with no 403; the stranger-share guard and F2 read-gates held in prior suites and were not
re-broken). The one leg that cannot complete under stub keys — payment — failed **exactly as
designed** (ruling 38), which is itself a pass.

## 2. Findings (new, from this run)

### CC-1 — Expert-authored items carry no provenance (P1, product)
Both expert-created items persisted with `suggestedBy: null` / `expertNote: null` — structurally
indistinguishable from the ~20 auto-seeded template items they landed among ("22 items · 5 days").
The traveler paid attention to an expert whose contribution is **invisible**: no badge, no
attribution, nothing to distinguish "your expert added this" from scaffold. The expert-value story —
the platform's core differentiator — does not survive the relay. *Fix direction: the itinerary-item
create path should stamp the acting expert (the session user's advisor role on the trip is already
known server-side) — never a client field (§14/§19).*

### CC-2 — Public share page leaks pre-purchase commerce + internal state (P1, product/trust)
The unauthenticated share page renders (a) the **un-purchased**, cart-pending "Kyoto Relay Photo
Session" with its $150 price — checkout 503'd and nothing was ever paid — and (b) the internal
"Draft" trip-status badge. A viewer can't tell a booked plan from a wishlist, and the owner's
in-progress commerce is exposed. (J13 asserts the pill is *inert*, not that its *content* is
appropriate for public view.)

### CC-3 — Day activities sort lexically by 12-hour time string (P2, correctness)
On the shared page, day 2 renders the 05:30 PM Kaiseki dinner **before** the 09:00 AM items —
`"05:30 PM" < "09:00 AM"` as strings. Any surface sorting on the raw `startTime` string has this bug.

### CC-4 — The in_review window is skippable ceremony (P2, product)
Two back-to-back `advance` calls landed `in_review` and `delivered` **~40ms apart**; the traveler
received both notifications simultaneously. Nothing enforces (or even encourages) any dwell in
`in_review` — the state exists but the review it names cannot have happened.

### CC-5 — Expert application accepts an empty body (P2, integrity)
Every field on `insertLocalExpertFormSchema` is optional: `{}` creates a valid `pending`
application. The admin queue can fill with contentless applications. (The fee/payout/Stripe strips
of ruling 42 are intact — this is about *minimum content*, not privileged fields.)

### CC-6 — knowledgeProofAnswers shape mismatch: client objects vs scorer strings (P2, pre-existing)
The client submits `[{question, answer}]` (`travel-experts.tsx:446`); the scorer casts to `string[]`
(`routes.ts:1693`). Combined with any scoring failure the Knowledge-Bar silently degrades to
`unscored` — the admin approves with no score signal, and nothing in the queue says why.

### CC-7 — Notification semantics on assignment (P3, copy/typing)
The advisor-request notification tells the expert "You've been **assigned**" while the row is still
`pending` (unaccepted), and reuses type `booking_request` instead of a dedicated advisor type. The
delivery pair (`in_review`/`delivered`) arriving 30ms apart compounds CC-4.

### CC-8 — Application/creation responses over-expose internals (P3, hygiene)
`POST /api/expert-application` echoes the full row to the applicant (`totalEarnings`,
`pendingPayout`, `feeSettings`, `stripeAccountId/Status`, `identityVerificationStatus`,
`knowledgeScore`); `POST /api/provider/services` echoes `revenueShareRate`. All server-derived and
read-only (§18 holds) — but there is no response projection on either endpoint.

### CC-9 — Silent field-drop under `.omit()` schemas bit a live consumer (P3, evidence for #PS18)
The provider agent's first-draft payload used `title`; the real column is `serviceName`. Under the
denylist schema unknown keys are silently dropped, not rejected — caught here only because
`serviceName` is notNull. This is live evidence for the filed `#PS18` allowlist conversion (§19).

### CC-10 — Assorted smaller frictions (P3/P4)
- `POST /api/trips/:id/expert-advisor` returns 200 (not 201) and creates a parallel
  `expert_requests` row alongside the advisor row — two tables describing one request.
- New-trip defaults disagree: `numberOfTravelers=1`, `adults=2` on the same row.
- Admin queue vs public read return different shapes for the same `provider_services` row
  (`title`/`expertId` mapper vs raw `serviceName`/`userId`).
- Provider console shows "Submitted" + "Active" badges simultaneously; "Active" ≠ traveler-visible
  (approval gates that), likely provider confusion. The create API also never signals that an
  `in_person` service needs availability slots published.
- Shared-page hero image renders broken (alt text + broken-image icon) in the sandbox.
- Stub-env nuance (correct-but-worth-knowing): a `payment_pending` claim whose `stripeAttemptAt` is
  stamped can only be *reconciled against Stripe*, never blind-voided (§15b) — with Stripe
  permanently unreachable, such claims accumulate in quarantine posture rather than voiding. Right
  behavior for prod; means stub sandboxes collect pending rows.

## 3. What this run proves that prior runs could not

- **The approval loop is live end-to-end**: application → queue → approve → *the approval has
  consequences* (traveler can assign the expert; public can see the service). Prior tests asserted
  queue contents or approval writes, never the downstream capability they unlock.
- **The expert workspace state machine + diary + notifications work against a genuinely
  traveler-minted assignment** (the Aug 7 walkthrough used a seeded invite).
- **The assigned expert is authorized on the trip's item rail** — untested before; no 403.
- **The share surface carries relayed content from three different authors** (template generator,
  expert, provider catalog) into one public render.

## 4. Explicitly NOT covered (no silent caps)

- **Payment completion + expert/provider earnings** — impossible under stub keys by design; the
  declared-503 negative contract was asserted instead. A staging run with `sk_test_` keys is the
  remaining gap (filed).
- **EA console** — no EA leg in this relay; the EA console remains walkthrough-only coverage.
- **Message threads / chat between roles** — still the standing blind spot from Jul 29.
- **Multi-traveler collaboration** (guest invites, co-planning) — this relay had one traveler.
- Browser-UI depth: agents drove the **API rails** of each console and captured one screenshot per
  console; this is not a pixel-level UX walkthrough of every station (see the Aug 7 expert
  walkthrough for that methodology).
