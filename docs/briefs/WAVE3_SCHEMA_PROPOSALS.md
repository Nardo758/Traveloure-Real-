> **RATIFIED AS RECOMMENDED — decision-maker, in session, Aug 13, 2026 (ledger row 102).**
> Every recommendation below is now the ruling, including all open questions that carried a
> recommendation. The one question with no recommendation (S7-Q1, materialization window/cadence)
> is resolved by a recorded integrator default — 60-day rolling window, materialized on-demand at
> pattern-save, with a daily job extending the horizon — amendable by the decision-maker.

# Wave 3 Schema Proposals — S7 availability · S8 property builder · S9 session/async fields

For decision-maker ratification (CLAUDE.md: schema/routing changes require explicit approval).
Source: `docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md` Gate G, RECs G1/G2/G3 (ratified as design
intent Aug 13, 2026 — schema is the remaining touchpoint before S7/S8/S9 lane start).

**Migration numbering.** `server/migrations/migration-files.ts` ends at
`"209_notification_dedupe_key.sql"` — next free number is **210**. Recommend three separate,
independently-revertible migrations (210 = S7, 211 = S8, 212 = S9) rather than one combined file;
exact order is a lane-sequencing call, not a schema one.

**Standing rules applied to every item below:** additive nullable columns / new child tables
only; every new object DECLARED in `shared/schema.ts` in the same commit as its migration
(publish-trap rule — an undeclared object is silently dropped by the Replit deploy-push); no DB
CHECK over any new column (app-enforced enum instead, the migration-181/195 posture); new child
tables follow the `dmo_extracted_places`/`service_route_points` pattern (`ON DELETE CASCADE`,
composite `UNIQUE` key) **where the rows are genuinely ordered** — two of the three S7 tables are
not ordered lists and use a natural-key `UNIQUE` instead, noted per-table below; every
client-writable field is checked against §14/§18/§19 (money/identity/rate) and flagged explicitly
if it is adjacent to that cluster.

---

## S7 — Availability (G1)

### Current state
- `vendor_availability_slots` (`shared/schema.ts:2317-2341`) is the only availability table: one
  row per **concrete date**, with `startTime`/`endTime`, `capacity`, `bookedCount`, `status`. It
  is the §15 claim surface — `storage.bookSlot`/`releaseSlot` (`server/storage.ts:3134-3166`) are
  atomic conditional `UPDATE … WHERE booked_count < capacity`, read by the checkout spine
  (`payments.routes.ts`) and the sweep. This machine is untouched by everything below.
- Provider routes (`server/routes.ts:8337-8420`) only CRUD **one dated slot at a time** — no
  weekly-repeat expansion, no blackout concept, no date-range concept.
- The Catalog editor (`client/src/components/logistics/provider-availability-manager.tsx:21-30`)
  **had** a weekly-schedule + blackout-dates UI that was deliberately **removed** in a prior "C2
  repair": it POSTed a shape the server never accepted and there was no backing model — the
  comment names the never-built `provider_availability_schedule` explicitly as out of scope.
  This is the direct evidence for the G1 gap.
- `provider_services.availability` jsonb (`schema.ts:747`, default `[]`) has **no reader** in
  `server/` (grep-clean) — a dead legacy column; do not build on it.
- Migration 195's `earliestStartTime`/`latestStartTime`/`serviceTimezone`/`durationMinutes`/
  `bufferMinutes` describe a day's booking **window shape**, not a repeat rule — no slot
  generation reads them today.
- `productShape='property'`/`'property_room'` (migration 153) already exist and are proven
  (`fp3-property-room-edit.db.test.ts`), but **no date-range availability table exists** — a
  property cannot publish inventory today. This is why S11 (traveler stay booking) is sequenced
  after S7.

### Proposed schema (migration 210)
Three additive child tables. Patterns/blackouts are **authoring data**, not the claim surface —
a new materializer service (code, not schema) expands a pattern into ordinary
`vendor_availability_slots` rows for a rolling window, so `bookSlot`/`releaseSlot`/the sweep need
**zero changes**. `service_date_ranges` is property/room authoring only in this wave; S11 owns
the range-claim machinery.

```sql
-- Weekly repeat rule (not itself claimable — materializes into vendor_availability_slots).
-- Natural-key unique, not position-ordered: a weekly grid has no sequence, only distinct slots.
CREATE TABLE service_availability_patterns (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,       -- 0=Sun..6=Sat, app-enforced range, no CHECK
  start_time varchar(5) NOT NULL,     -- "HH:MM" wall clock, matches earliestStartTime's shape
  end_time varchar(5) NOT NULL,
  capacity integer DEFAULT 1,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT service_availability_patterns_unique UNIQUE (service_id, day_of_week, start_time, end_time)
);

-- Property/room date-range availability, per-night price (S11's future checkout input).
CREATE TABLE service_date_ranges (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  nightly_price decimal(10,2),        -- NULL = inherit provider_services.price; see §14 flag below
  capacity integer DEFAULT 1,         -- units (rooms) available across this range
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT service_date_ranges_unique UNIQUE (service_id, start_date, end_date)
);

-- Blackouts apply to EITHER shape (scheduled-slot services or property date-ranges).
CREATE TABLE service_availability_blackouts (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason varchar(255),
  created_at timestamp DEFAULT now(),
  CONSTRAINT service_availability_blackouts_unique UNIQUE (service_id, start_date, end_date)
);
```
All three declared in `shared/schema.ts` alongside `serviceRoutePoints`/`serviceSurchargeTiers`.

### Write rails
- **New**, owner-gated, hand-written **allowlist** body schemas (§19 posture — no
  `createInsertSchema`, same shape as `PUT /api/provider/services/:id/route-points`,
  `routes.ts:2507-2539`), one replace-list endpoint per table:
  `PUT /api/provider/services/:id/availability-patterns`,
  `PUT /api/provider/services/:id/date-ranges` (property/property_room only — validate
  `productShape` server-side), `PUT /api/provider/services/:id/blackouts`.
- **New** materializer (`server/services/availability-materializer.service.ts` or similar): reads
  patterns + blackouts, upserts `vendor_availability_slots` rows for a rolling window. Needs an
  idempotency key — flagged as an open question below (no current unique index on
  `(service_id, date, start_time)`).
- Existing public read `GET /api/vendor-availability/:serviceId` and the existing
  `GET/POST/PATCH/DELETE /api/provider/availability/*` slot endpoints are **unchanged** — they
  keep working exactly as today against materialized rows.

### Open questions for the decision-maker
1. **Materialization window & trigger.** How many days ahead to generate (30/60/90), and on what
   cadence (scheduled job vs. on-demand at pattern-save time)? Needed before the lane can build
   the materializer.
2. **Idempotency index.** Materializing needs `UNIQUE (service_id, date, start_time)` on
   `vendor_availability_slots` to upsert safely (migration-155 idempotency precedent). Per that
   precedent's own rule: check prod for existing duplicates before declaring it — flagged as a
   pre-flight step, not assumed clean.
3. **Blackout vs. already-booked slots.** Does a new blackout over a date with confirmed bookings
   (a) only block *future* materialization/manual creation, or (b) try to cancel existing slots?
   Recommend (a) — auto-cancelling a paid booking is a §15 safety violation waiting to happen.
4. **`nightly_price` is price-bearing** (§14-adjacent): S11's checkout will read it to compute a
   stay charge. Legitimately provider-authored (like `price` today), but S11 must derive the
   charge server-side from this row, never `req.body` — noted now so it isn't rediscovered at S11.

---

## S8 — Property builder (G2)

### Current state
- **Property↔room linkage already exists and is proven** — `productShape`, `pricingUnit`,
  `parentServiceId` (migration 153, `shared/schema.ts:852-864`), `ON DELETE RESTRICT` self-FK.
  `server/__tests__/fp3-property-room-edit.db.test.ts` proves the routing/guard decision
  (property's Rooms-step edit vs. ordinary ServiceForm) is server-derived off `productShape` +
  `parentServiceId` on both the Catalog list and single-row owner read. **S8 is not starting from
  a blank table** — the linkage half of G2 is done.
- Checked the "5 fields" G2 finding against the schema directly — **two of the five "missing"
  fields already have columns**: photos (`serviceImage` cover + `galleryImages` jsonb array,
  `schema.ts:882,913`) and cancellation (`cancellationPolicy` text + `cancellationPolicyType`
  enum, migration 144, `schema.ts:906-909`). The "5 fields" description is a **Workstation UI**
  limitation, not a schema gap — worth correcting in the record.
- Genuinely missing (grep-clean across `shared/schema.ts` and `server/`): check-in/out time,
  house rules, amenities.
- **Capacity may already be covered**: `partySizeMin`/`partySizeMax` (migration 195) are already
  wired into `server/services/booking-eligibility.service.ts` as a live booking-eligibility gate
  on `provider_services`, generically across all service types — a `property_room` row can set
  these today. Flagged as reuse-vs-new below rather than assumed.
- **Location pin**: `meetingPoint`/`latitude`/`longitude`/`locationPrecision`
  (`schema.ts:750,871-874`) plus the confirm-gated `LocationPointPicker`/`extractServiceLocation`
  write path already exist and are the platform's one write rail for a service's pin (§22b
  precedent) — reusable as-is for property placement. No new column needed.
- **Privacy circle — derivable, no new column.** `server/services/ready-made-teaser-map.service.ts:4-13`
  already implements exactly this shape for a different surface: a deterministic PRNG seeded from
  the listing id jitters real coordinates by ~±250m at **read time**, stable per listing, "never
  fabrication, only bounded displacement of a real point." The same technique applied to a
  property's confirmed pin at a wider radius produces the pre-booking "approximate neighborhood
  circle" with **zero schema change** — confirms the CLAUDE.md hint that this is likely derivable.

### Proposed schema (migration 211)
```sql
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS check_in_time  varchar(5),   -- "HH:MM", same shape as earliest_start_time
  ADD COLUMN IF NOT EXISTS check_out_time varchar(5),
  ADD COLUMN IF NOT EXISTS house_rules    text,
  ADD COLUMN IF NOT EXISTS amenities      jsonb;        -- string array, delivery_languages precedent:
                                                          -- NULL = never captured, [] = cleared (§13)
```
No new child table — `parentServiceId` is the linkage, already shipped. No new location or
privacy column. All four declared in `shared/schema.ts` beside the existing property block.

### Write rails
- All four ride the **existing** `POST`/`PATCH /api/provider/services` and the existing
  `.omit()`-based `insertProviderServiceSchema` (`schema.ts:1914`) — none are money/identity/rate
  fields (§14/§18/§19 do not apply), so ordinary inclusion is safe and matches how
  `galleryImages`/`cancellationPolicy` are already handled on the same table. No new endpoint.
- Pin: unchanged, one write path (`extractServiceLocation` on the same POST/PATCH, confirm-gated
  picker). A room row never writes its own pin; a **read-time fallback**
  (`room.latitude ?? parent.latitude`) is needed wherever a room is read standalone — an
  implementation note for the lane, not a schema item.
- Privacy circle: read-time derivation only, reusing the teaser-map jitter technique — no write
  rail at all.

### Open questions for the decision-maker
1. **Amenities: new column or reuse `whatIncluded`** (already a jsonb string array on the same
   table)? Recommend the new `amenities` column — `whatIncluded` is deliverable/marketing copy
   ("3 hours shooting"), amenities is physical-property fact ("WiFi", "kitchen"); collapsing them
   mixes two different claims into one field.
2. **Room guest capacity: reuse `partySizeMin`/`partySizeMax`, or add a property-specific
   `maxGuests`?** Recommend reuse (avoids a duplicate concept and a future SS-4-style drift
   defect), but the eligibility gate's semantics were written for general "party size," not
   specifically "beds a room sleeps" — flagging for explicit sign-off rather than assuming identity.
3. **Room-level pin override — ever, or absolute inheritance?** Recommend absolute (no per-room
   override) rather than building an escape hatch nobody asked for yet.
4. **House rules — property-level only, or can a room add/override?** Recommend property-level
   only (same inheritance posture as the pin) unless a real provider need surfaces.

---

## S9 — Session/async fields (G3)

### Current state
- **`serviceTimezone` already exists** (migration 195, `schema.ts:800`) — the scheduled-remote
  timezone field is done, not a Wave 3 item.
- **Remote capacity may already be covered**: `vendor_availability_slots.capacity`
  (`schema.ts:2326`) is the atomic claim's own ceiling for a booked slot — a scheduled call/video
  session's "how many people can join" is arguably already this number. Flagged as reuse-vs-new
  below rather than assumed net-new.
- **Join-link, response window, scope statement: genuinely missing** (grep-clean across
  `shared/schema.ts` and `server/` for `joinLink`/`meetingLink`/`responseWindow`/
  `scopeStatement`/equivalents).
- **Completion machinery is already wired — no new machinery needed.**
  `PROVIDER_DECLARED_METHODS = {"async_messaging", "voice_notes"}` and `completionRuleFor()`
  (`shared/service-fundamentals.ts:123,141`) already route both methods to the `provider_declared`
  rule, which `completeBooking()` (`server/services/booking-completion.service.ts`) fires through
  the **same** shared machinery every other method uses (the file's own governing rule: "one
  payout machinery, no per-method money forks"). S9's REC is already true in code; the lane adds
  only descriptive fields, never a second completion path.
- **Sanitizer precedent for the sensitive field.** The `serviceFile` (pdf deliverable) omission
  pattern is the template `join_link` must follow: **5 call sites** currently strip `serviceFile`
  via `omitFields(x, ["serviceFile"])` — `server/routes/content.routes.ts:1978` (public
  `GET /api/services/:id`), `server/routes.ts:2272`, `server/routes.ts:5462` (traveler's own
  booking list), `server/storage.ts:2636`, `server/storage.ts:3346`. The post-booking **reveal**
  precedent is `GET /api/service-bookings/:id/deliverable`
  (`server/routes.ts:5573-5630`) — gates on `booking.travelerId === session user` **and**
  `booking.status === 'confirmed'` (never `payment_pending`, §15b) before releasing the asset.

### Proposed schema (migration 212)
```sql
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS join_link              text,     -- provider's own meeting link
  ADD COLUMN IF NOT EXISTS response_window_hours   integer,  -- async: promised response time
  ADD COLUMN IF NOT EXISTS scope_statement         text;     -- async: what's in/out of scope
  -- remote_capacity intentionally NOT included pending the open question below
```
All declared in `shared/schema.ts`. No child table.

### Write rails
- `join_link`/`response_window_hours`/`scope_statement` ride the **existing**
  `POST`/`PATCH /api/provider/services` (`.omit()`-based `insertProviderServiceSchema`) — ordinary
  owner-authored listing config, not §14/§18/§19-privileged. Safe to add without an `.omit()`
  entry.
- `join_link` **read** must be added to all 5 `omitFields(..., ["serviceFile"])` call sites above
  (strip on every public/pre-booking surface) — this is new required work, not automatic; each
  site currently only knows about `serviceFile`.
- `join_link` **reveal**: new gate mirroring `GET /api/service-bookings/:id/deliverable` exactly —
  `booking.travelerId === session user` and `booking.status === 'confirmed'`, service method in
  `SESSION_END_METHODS` (`call`/`video`). Recommend a distinct surface (e.g. conditionally include
  `joinLink` on the existing confirmed-booking detail read) rather than overloading `/deliverable`,
  which is `isArtifactDelivery` (pdf)-scoped by name and by gate.
- `response_window_hours`/`scope_statement` are purely informational — **no** change to
  `completionRuleFor`, `OWNER_DECLARED_COMPLETION_RULES`, or `completeBooking()`.

### Open questions for the decision-maker
1. **`remote_capacity`: new column, or reuse `vendor_availability_slots.capacity`?** Recommend no
   new column — call/video are already `SESSION_END_METHODS` with a booked slot carrying its own
   capacity; a second capacity number on the parent row risks the exact "two labels, one meaning,
   one goes stale" defect this codebase has already been bitten by twice (SS-4's radius split,
   migration 199). Needs explicit ratification either way — changes the DDL above if rejected.
2. **`join_link` format** — free text, or a constrained URL-shape check? Recommend free-text with
   basic URL validation only, matching how `meetingPoint`/`pickupAddress` are handled elsewhere.
3. **`join_link` visibility to a PENDING advisor** (§12: pending may read, not write). Recommend
   scoping `join_link` to the confirmed traveler + owning provider only, advisor visibility
   excluded by default — flagging since §12's existing read grants are broad and this is new.
4. **`scope_statement` vs. reusing `whatIncluded`** — same reuse-vs-new tension as S8's amenities.
   Recommend a new field: `whatIncluded` is marketing copy read pre-purchase, `scope_statement` is
   closer to an SLA/promise statement that may matter at dispute time — different audience.

---

## Summary for ratification

| Lane | New tables | New columns | Money/rate-adjacent | Blocking open Qs |
|---|---|---|---|---|
| S7 | 3 (`service_availability_patterns`, `service_date_ranges`, `service_availability_blackouts`) | 0 | `service_date_ranges.nightly_price` (flag only, S11 derives) | materialization window/cadence; idempotency unique index; blackout-vs-booked-slot behavior |
| S8 | 0 (linkage already shipped, migration 153) | 4 (`check_in_time`, `check_out_time`, `house_rules`, `amenities`) | none | amenities vs. `whatIncluded` reuse; capacity vs. `partySizeMin/Max` reuse |
| S9 | 0 | 3 (`join_link`, `response_window_hours`, `scope_statement`) — `remote_capacity` pending Q1 | none (join_link is a *leak* concern, not a money one) | remote_capacity reuse; join_link format; advisor visibility |

None of the proposed columns require a DB CHECK; none require a schema-mediated §18/§19 strip
(no rate, no payment-identity column in this batch); the one price-bearing field
(`nightly_price`) is provider-authored config exactly like existing `price`/`depositFlatAmount`,
with the standing §14 server-derivation obligation called out for S11 rather than assumed.
