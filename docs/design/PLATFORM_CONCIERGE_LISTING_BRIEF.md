# The platform-owned Booking Concierge listing — where no expert offers one

> **Ratified 2026-09-18 (decision-maker): mechanism = seeded form row; money = no split; ranking = existing floor.** Landed by ledger `2026-09-18-platform-concierge-listing`, migration 313. The DRAFT status note directly below is kept verbatim as the historical record of what this brief looked like at write time (its two named dependencies, Lane B and Lane A, landed on `main` before this lane started — see `git log` merges `605b08f`/`588dfaf`).

> **DRAFT — awaiting decision-maker ratification.** Written per Lane F (F1) of the 2026-09-18 Batch 2
> build; no code. Depends on Lane B (fee cap + expert/platform split,
> `expert_concierge_booking_expert_share`) and Lane A (checkout of a `booking_concierge` line
> creates `affiliate_booking_requests` rows) landing first — neither is on `main` as of this writing
> (grepped: no `conciergeFeeExpertShare`, no `concierge-handoff.service.ts`). This brief designs
> against their specified shape, not yet-built code, and says so at each point.

## 1. The problem, restated against the live code

`booking_concierge` is an `expert_offering_types` row (tier `coordination`, migration 065) that an
expert opts into by creating an **approved** `provider_services` listing with
`expert_offering_type_key='booking_concierge'` (`shared/schema.ts:1502-1503`). `provider_services.user_id`
is `NOT NULL REFERENCES users(id) ON DELETE CASCADE` (`shared/schema.ts:1133`) — there is no exemption
for an ownerless row, and no listing exists where no expert has created one. A market with no expert
offering it therefore has no Booking Concierge fee, no facilitation, and (once Lane A lands) no plan
whose partner items get handed off.

**Correction to the dispatch brief's premise.** Migration 065's own comment says the listing is
"market-scoped via `expert_neighborhoods`" (`server/migrations/065_seed_booking_concierge_offering_type.sql:7`).
That is the migration's stated *intent*, not what the live code does — the same comment-vs-code gap
CLAUDE.md LD 44 §0.1 already documents for `getExpertUserIds`. Grepped: **no route or service that
surfaces or ranks a Booking Concierge listing reads `expert_neighborhoods` at all.** The two live
surfaces both read `local_expert_forms` instead:
- `GET /api/experts`'s `location` filter (`server/routes.ts:4988-5000`) matches against
  `expert.expertForm.destinations / .city / .country`, and excludes an expert with **no form row
  outright** (`if (!form) return false;`, `:4992`) — this is what `HireExpertDialog` calls
  (`client/src/components/plancard/HireExpertDialog.tsx:118-121`).
- `lead-routing.service.ts`'s destination scoring (the "Get a local expert" auto-route tier)
  `INNER JOIN`s `local_expert_forms lef ON lef.user_id = u.id WHERE lef.status = 'approved'`
  (`server/services/lead-routing.service.ts:74-77`) and scores on `lef.destinations`
  (`:70`, `:96-100`) — an expert with no **approved** form is invisible to routing, full stop.

`expert_neighborhoods` (LD 27's ratified-claim-only table) governs a *different* surface — the
city-page "one local expert per neighborhood" card (`server/services/location-view.service.ts:408-434`)
and upsell endorsements (`upsell-query.service.ts:330-345,524-533`) — and gates neither hireability
nor routing. **The LD 27 collision named in the dispatch brief does not exist on `main` today.** The
real mechanism to satisfy is `local_expert_forms`, which carries no admin-ratification trigger and no
per-row birth restriction (every column but `id`/`user_id` is nullable, no CHECK —
`shared/schema.ts:733-830`).

## 2. The platform account (Q: ratify)

One reserved `users` row, seeded by a migration's idempotent `INSERT ... ON CONFLICT (email) DO
NOTHING`, never a login: `password` NULL (the existing password-auth path already requires a hash to
authenticate; a NULL password cannot pass it), `email` a platform-controlled address on a domain we
own (e.g. `concierge@traveloure.internal`, never delivered), `role='local_expert'` — deliberately
the **most gated** role, not an exemption, so the account clears the exact SECURITY GATE every real
local expert clears (`server/storage.ts:5122-5131`) rather than being special-cased around it.
`createdVia`/an equivalent provenance marker is not on `users`, so the row is identified structurally:
**one helper, `getPlatformConciergeUserId()`**, reads it off `platform_settings` (key
`platform_concierge_user_id`, the existing key/value table, `shared/schema.ts:9285-9294`) rather than
a hardcoded id or an email lookup — the same pattern `platform-flags.ts` already uses for cached
settings reads. §40 binds: the id is never published on a public payload. `EXPERT_PUBLIC_FIELDS.id`
(`/api/experts`, `/api/experts/:id`) is one of LD 40's two named, printed exemptions — so this account
needs a **handle** like any earner asked to claim one (LD 40's "handles are claimed" banner does not
apply to a non-login account, so the seed migration claims it directly, e.g. `handle='concierge'`),
and every card/link uses `/s/:handle` for this account, never `/experts/:id`.

## 3. The listing(s) and market surfacing (Q: ratify the mechanism)

**One listing, not eight.** A single `provider_services` row owned by the platform account,
`expert_offering_type_key='booking_concierge'`, `approval_status='approved'` (migration-seeded, not
wizard-submitted — see §13 note below), `created_via='seed'` (the existing app-enforced provenance
vocabulary already carries this value, `shared/schema.ts:1509-1518`), priced from a `fee_bands` row
(new key, e.g. `platform_concierge_listing_price`, admin-editable — never a literal, §8) rather than
`platform_settings`, since `fee_bands` is already the admin-editable, CI-guarded home for every other
priced thing on this rail and a second config table for one more dollar amount is a second place to
edit money (§18 rule 1).

**Surfacing is the `local_expert_forms` mechanism from §1, not a new predicate.** Seed one
`local_expert_forms` row for the platform account: `status='approved'`, `expertType='local_expert'`,
`destinations` = the 8 `OPERATING_MARKETS` city names (`shared/operating-markets.ts:31-113`),
`stripeConnectStatus` left at its default `'not_started'` (lead-routing's gate is
`IS NULL OR != 'restricted'`, `:77` — `'not_started'` passes). This needs **no new read-side rule
and no `expert_neighborhoods` bypass at all**: both `/api/experts`'s location filter and
`lead-routing.service.ts`'s scoring already read `local_expert_forms`, and a migration-seeded,
approved, all-market form row is exactly the fact both queries already know how to use. This is
**recommended over** inventing a `isPlatformConciergeUserId()` special case threaded through two
unrelated route files — one seeded row is one thing to maintain; a scattered id check is the
derivation-drift class §18 rule 1 names, in a place that has no reader for it today.

**Why "born approved" is not the F2 hole.** F2 (migration 111) closed a *client wizard* writing an
approved row for itself. This row is written by a **migration** — the same authority that seeds
`expert_offering_types` (065) and `market_geography`/`city_neighborhoods` (LD 20) — so no client
request path ever reaches `approval_status` on this row.

## 4. Fulfilment and money (Q: ratify one option)

Every `booking_concierge` purchase from this listing births `affiliate_booking_requests` rows with
`expert_id` NULL (Lane A's `createHandoffRequestsForBooking`, the "platform-owned listing births NULL"
branch already named in the Batch 2 plan) — the pooled queue, LD 44's claimed-not-assigned posture,
unchanged.

**Recommend (a): mint nothing extra for a platform-owned listing.** When Lane B's
`mintCompletionEarningsForBooking` split reads a nonzero `conciergeFeeExpertShare` off the booking's
`booking_details` snapshot, it should **skip the split mint when the listing's owner is the platform
account** (one check, `getPlatformConciergeUserId()`, at the same site Lane B already branches on the
key's presence) — 100% of the fee stays platform revenue, stated in a comment beside the check. This
is not a new money path: it is the *absence* of a mint, which is the §13-honest shape ("nothing was
promised to a listing owner who is not a person"), and it is the only option that needs **no new
table, no new idempotency key, and no Stripe Connect account for an account that will never have
one** — minting a "held expert earning" to an account with no Connect account is not a defect today
(payout readiness is checked at payout, not at mint, `server/storage.ts:3603-3660`), but it is a real
payable that nobody will ever draw, which is worse than not creating it (§13: a stated absence beats
an unreachable claim). **Rejected: (b) mint per-request to the claimant pro-rata.** It needs a new
mint site keyed on `affiliate_booking_requests.id` (§15 idempotency, a new claim), a new answer for
requests that are never confirmed (who is owed the unclaimed remainder — the platform, but then the
"pro-rata" framing is fiction for the platform's own share), and it pays a human for *claiming a
pooled request that already carries no assignment obligation* — LD 44's ruling is that claiming is
voluntary work, not that it earns the fee share; conflating them is a new ruling this brief does not
make. **Rejected: (c) hold pending a ruling.** Lane B's mint site will exist either way; leaving the
platform-owned branch unhandled is an unstated behavior, not a held one.

## 5. The traveler's choice (Q: recommend, low-stakes)

**Recommend: the platform listing ranks last, never hidden.** Where a real expert's Booking Concierge
listing exists for a market, `lead-routing.service.ts`'s scoring already ranks by destination +
specialty + availability + response-rate (`:47-53`) — the platform's seeded form should carry
**no specialties** (`specialties: []`) so its specialty score is always the `else` floor (`10`,
`:117`) and its availability/response-rate scores are pinned low by seeding
`maxConcurrentHandoffs`/no historical `expert_requests`, so a real, responsive expert always outranks
it on the merits the existing scorer already measures — no new tie-break rule, no merge of the expert
and provider catalogs (D6 stands: this is still the expert catalog, one row deep). This is a **ranking
default**, not a hide: LD 32/44 both require *some* fulfiller to exist, and a market truly uncovered
by a real expert should show the platform's listing rather than show none. `checkSlipPrecondition`
(LD 32) is unaffected — a slip is still required before any Booking Concierge purchase, platform-owned
or not; this brief adds no new precondition and removes none.

## 6. Negative space

Not built here: no auto-assignment change (LD 44's claim rail is untouched — a platform-owned
request is claimed exactly like any other pooled one); no browser automation; no partner booking
client; no change to `POST /api/affiliate-booking-requests`'s create route or its allowlist; no
second fee band beyond the one listing-price band named in §3; no `expert_neighborhoods` row, insert,
or trigger touch of any kind (LD 27 is not amended, not bypassed, not tested against — it is simply
not the relevant table); no change to `HireExpertDialog`'s or `lead-routing.service.ts`'s query
shape — both already do what §3 needs once the form row exists.

**Tests F2 must add**, each naming the file/predicate it pins: (1) seeder idempotency — running the
migration twice leaves exactly one `users` row, one `local_expert_forms` row, one `provider_services`
row (`ON CONFLICT DO NOTHING` on each, keyed on the seed's own natural key); (2) the platform account
never appears with a raw `users.id` in `/api/experts`/`/api/experts/:id` payloads — extend
`check-public-user-id`'s exemption list assertion to confirm this account resolves through its handle
on every card path, same as any other handled earner; (3) the `local_expert_forms`-based visibility —
a destination in `OPERATING_MARKETS` scores the platform account >0 in `scoreExperts`, a destination
NOT in that list scores 0 (§13: the platform is not claimed to cover a market it doesn't); (4) a
purchase of the platform listing's `booking_concierge` line births `affiliate_booking_requests` rows
with `expert_id IS NULL` (Lane A's H-series, one more case); (5) the mint-skip from §4 — a completed
booking against the platform listing writes no expert-share earning row, and `platform_revenue`
carries the full, unsplit fee (extends Lane B's `concierge-fee-split.db.test.ts`).

## 7. Migration shape

One migration, next number after the highest landed at F2's build time (≥313 as of this brief).
**Additive only, no ALTER on an existing column, no CHECK, no DEFAULT change:** `INSERT ... ON
CONFLICT DO NOTHING` into `users` (one row), `local_expert_forms` (one row, FK to the user), and
`platform_settings` (one key/value row recording the user id — read-only after seeding, via
`getPlatformConciergeUserId()`); a `provider_services` row insert (owned by that user id,
`approval_status='approved'`, `created_via='seed'`); and, if §3's dedicated `fee_bands` key is
ratified, one more `ON CONFLICT (band_key) DO NOTHING` seed row there. Every referenced table already
exists and is already declared in `shared/schema.ts`; this migration declares no new table, column, or
index, so `shared/schema.ts` needs no change and `scripts/preflight-prod-constraints.cjs` needs no new
manifest entry (its manifest is CHECK-constraint-shaped; this migration adds none). Registered in
`server/migrations/migration-files.ts` per the standing rule.

## Open choices for the decision-maker

1. **Mechanism (§3).** Seed a `local_expert_forms` row for the platform account (reuses the live
   `/api/experts` + `lead-routing.service.ts` gates, no new predicate) vs. build a dedicated
   `isPlatformConciergeUserId()` read-side bypass threaded through both files (matches the dispatch
   brief's original framing, but adds a second, narrower mechanism beside one that already works).
   **Recommend: seed the form row.**
2. **Money (§4).** (a) no split mint for a platform-owned listing — 100% platform revenue, stated in
   a comment; vs (b) per-request pro-rata mint to the claimant; vs (c) hold pending a ruling.
   **Recommend: (a)** — no new claim/idempotency surface, no unreachable Connect-less payable.
3. **Ranking (§5).** Platform listing ranks last by the existing scorer's own low-specialty/low-
   activity floor (no new tie-break code) vs. an explicit `ORDER BY is_platform ASC` tie-break added
   to `lead-routing.service.ts`. **Recommend: the existing-floor approach** — no new column, no new
   comparison, and it degrades gracefully if a real expert's specialties later change.
