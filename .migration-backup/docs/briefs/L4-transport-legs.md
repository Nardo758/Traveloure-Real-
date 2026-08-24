# L4 — Transport legs for expert-built trips (ratified "BOTH", Jul 30 2026)

Decision-maker ratified **option 3**: engine proposes → expert confirms/edits → traveler sees confirmed legs.
Governing records: CLAUDE.md §18 (ratification bullet) + docs/EXECUTION_MAP.md L4 row. This brief is the
Fable-written spec both sub-lanes execute against. **L4a (Opus)** = migration + server. **L4b (Sonnet)** =
Workstation UI. L4a dispatches only after L3b′ lands (shared-file serialization: trip-plan.service.ts,
trips.routes.ts).

## Why

`transport_legs` is variant-scoped (`variant_id NOT NULL`) — only AI-optimizer trips have legs. Expert-built
Workstation trips have none, so: the §18 mode-aware CTA (Navigate vs Ride) always falls back to Navigate, the
Trip Card Transport section never renders, and "leave by" timing is impossible. L4 gives expert trips real legs
without a parallel table (one-home rule).

## L4a — migration + server (Opus)

**Migration (next free number — check `server/migrations/migration-files.ts`; register there):**
- `transport_legs`:
  - `ALTER COLUMN variant_id DROP NOT NULL`
  - `ADD COLUMN trip_id varchar NULL REFERENCES trips(id) ON DELETE CASCADE`
  - `ADD COLUMN pickup_point text NULL`
  - `ADD COLUMN pickup_time text NULL`  *(display string in v1 — no tz math; honest text the expert wrote)*
  - `ADD COLUMN proposal_status varchar NULL` — values `proposed | confirmed`; **NULL = legacy variant leg
    (grandfathered, existing behavior untouched)**. If a CHECK is added it MUST allow NULL
    (`proposal_status IN ('proposed','confirmed') OR proposal_status IS NULL`) and MUST be added to
    `scripts/preflight-prod-constraints.cjs` `CONSTRAINT_MANIFEST` (CLAUDE.md publish-time CHECK trap).
  - Index `(trip_id, day_number)` for the trip-scoped read.
  - **NO cross-column exactly-one-of CHECK** (app-level enforcement only — avoid the drizzle-push trap).
- `shared/schema.ts` matching nullable columns. Idempotent guards per house style.

**Engine proposal path:** reuse the EXISTING variant leg-computation service (distance/mode/duration/
alternatives — do not fork a second engine). New endpoint `POST /api/trips/:tripId/transport-legs/generate`:
auth = the canonical inline trip-mutation model (owner via `verifyTripOwnership` OR assigned expert — §9: use
the inline model, NOT the divergent router copies); computes legs between consecutive same-day
`itinerary_items` with valid coordinates; writes trip-scoped rows born `proposed`; idempotent re-run replaces
existing `proposed` rows for the trip but NEVER touches `confirmed` ones; items without coords are skipped
honestly (no fabricated geometry, §13).

**Expert confirm/edit:** `PATCH /api/trips/:tripId/transport-legs/:legId` — zod allow-list ONLY:
`userSelectedMode`, `pickupPoint`, `pickupTime`, `proposalStatus` (`proposed→confirmed` and back). Same auth.
`DELETE` for a leg the expert rejects. No other columns writable (mass-assign posture).

**Read paths:** trip-plan assembler (`full` level) emits trip-scoped legs **only when `confirmed`** — traveler
surfaces never see machine proposals (D1a lesson). A workstation-facing read
(`GET /api/trips/:tripId/transport-legs?includeProposed=1`, same auth) returns both states for the editor.
Variant-scoped legs keep their existing path untouched.

**Money/§16:** none of this touches amounts or bookings. `pickup_point`/`pickup_time` are expert-stated
arrangement facts, not a booking record; the booked-ride state still derives from `transport_booking_options`
as in L3a. No affiliate URLs anywhere in these payloads.

**Verification bar:** tsc zero-new; build; both guards; behavioral: generate → born-`proposed` (traveler
plancard shows nothing), confirm one leg → appears in plancard `legs[]`/`days[].transports` with correct mode,
edit pickup fields → surfaces in the leg payload, re-generate → confirmed leg survives + proposed replaced,
legacy variant trip → behavior byte-identical (key diff), migration verified via information_schema. Fixtures
deleted; own server only.

## L4b — Workstation UI (Sonnet, after L4a lands)

Between-stops transport editor in the Workstation build view: per same-day gap show the proposed leg (mode
icon, duration, distance) with: mode picker (canonical vocabulary), pickup point/time inputs appearing only
for chauffeured modes, per-leg Confirm, and a "Generate transport" action calling L4a's endpoint (with a
confirm dialog when proposed legs already exist). Console palette tokens (§17 — `.console-scope`, no raw hex).
Honest states: no-coords items surface "add a location to route this leg", never a fake leg. Verification:
tsc/build + Playwright on a fixture build (generate → edit → confirm → traveler plancard shows the confirmed
leg; proposed-only leg absent from traveler view).

## Explicitly out of scope

Seasonal/live transit times, ride BOOKING creation (the §16 agent rail already covers booking), pickup-time
timezone math, auto-confirm heuristics, any traveler-facing display of `proposed` legs.
