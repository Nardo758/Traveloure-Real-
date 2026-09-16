# Lane report — `2026-09-15-d28-d31-service-quotes` (punchlist D-28 / D-29 / D-30 / D-31)

**Landed 2026-09-16.** Ledger row `2026-09-15-d28-d31-service-quotes`; migration **305**
(`305_service_quotes.sql` — 304 is left to the parallel D-36..D-39 lane). Content of record:
`docs/design/CUSTOM_QUOTE_BRIEF.md`.

## What landed

| Row | Built |
|---|---|
| D-28 | `service_quotes` child table (FK → `provider_services` CASCADE, the traveler, UNIQUE (service_id, traveler_id, position), `amount_cents`, `currency`, `expires_at`, `quoted_by`, `accepted_at`, `superseded_by` self-FK, `booking_id`), declared in `shared/schema.ts`, no CHECK, no backfill, NO `createInsertSchema`; vocabulary + derived `expired` + the two `.strict()` bodies in `shared/service-quotes.ts`. |
| D-29 | `server/config/quote-validity.config.ts`: `QUOTE_VALIDITY_DAYS` (7) and the ONE platform `QUOTE_VALIDITY_CEILING_DAYS` (30); over-ceiling refused with the number stated; no day literal in any route/service (pinned). |
| D-30 | Request rail creates a `requested` row and NO booking; owner issue / re-quote (new row, `superseded_by`) / withdraw; traveler decline; **accept = atomic claim with `expires_at > NOW()` in its WHERE, under `FOR UPDATE`, minting through `storage.createServiceBookingAtomic` with the quote's amount as `total_amount`; one booking under a double call.** `POST /api/expert-booking-requests` carries the siblings' `PRICELESS_LISTING_REFUSAL` (V-22 closed). Service-detail request note says what a request creates; the button POSTs the request beside the LD 40 conversation. |
| D-31 | `chargeModeFor` consults `depositEnabled` before `quote_approve` → `deposit_balance`; pinned A10b (pure) and Q7 (real row's snapshot). |

## What is left, named

1. **The charge.** The quote-born booking is born UNPAID (`pending`, the same state `POST /api/bookings`
   births). Feeding the quoted amount into `POST /api/checkout`'s line-price derivation so
   CLAIM → AUTHORIZE → PROMOTE charges it is a separate lane: that derivation runs in the checkout's
   two loops and two previews (`/api/cart`, `/api/cart/fee-preview`) and needs its own brief. Today
   no rail charges a `pending` service booking, quote-born or request-born alike.
2. **Every surface** (brief §6 lane 5): owner issue/withdraw on Catalog; the traveler's quote card on
   the slip (LD 42 D9 audience); the expired sentence rendered.
3. The four `expert-booking-requests` clients now receive the 400 refusal for a priceless listing and
   have no quote affordance of their own yet.
4. The narrow window between a committed mint and a failed `booking_id` stamp (an unpaid `pending`
   booking beside a `quoted` quote) — re-driven by the next accept under the lock; recorded, not solved.

## Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` error count | 129 (baseline ceiling 130) |
| `npm run build` | exit 0 |
| `check-decision-guards.cjs` (`--self-test` + run) | OK |
| `check-money-endpoints.cjs` (`--self-test` + run) | OK (37 fixtures; exit 0) |
| `phase2-fee-gate.sh` | PASSED (exit 0) |
| `check-test-files-wired.cjs` (`--self-test` + run) | `test-orphan-ratchet: OK` — 33 recorded orphans, unchanged |
| `check-duplicate-migration-prefixes.cjs` | OK (304 registry entries) |
| `check-undeclared-tables.cjs` (local Postgres, chain from EMPTY + 305) | 0 undeclared |
| `chain-integrity.test.ts` | 2/2 |
| Migrations from EMPTY (local Postgres 55480) | 304/304 applied (303 + 305) |
| `service-quotes.db.test.ts` Q1–Q9 | 9/9 |
| `offering-commerce-contract.test.ts` (A10b added) | 36/36 |
| `offering-archetype-fixtures.db.test.ts` / `booking-birth-provenance.db.test.ts` / `offering-contract-snapshot.test.ts` / `service-buy-action.test.ts` | 41/41 · 12/12 · 14/14 · 16/16 |
| `grep -c replit.local package-lock.json` | 0 |

## Proposed CLAUDE.md sentence (not applied — decision-maker's word)

> **A custom quote is a `service_quotes` row with an expiry, never a price on the listing (ledger
> `2026-09-15-d28-d31-service-quotes`, migration 305):** a REQUEST mints no booking; the owner
> issues `amount_cents` with `expires_at` derived from `QUOTE_VALIDITY_DAYS` or a choice under the
> ONE platform `QUOTE_VALIDITY_CEILING_DAYS` (refused with the number stated, never clamped — §8's
> no-literal half); an expired quote is re-quoted as a NEW row (`superseded_by`), never edited;
> `expired` is derived, never stored; acceptance is an atomic claim carrying `expires_at > NOW()` in
> its WHERE clause (§15) that mints through the EXISTING birth-rail writer with the quote's amount as
> `total_amount` (§14 — the accept body carries no amount) and stamps `booking_id`; a quote-approve
> listing with deposits enabled resolves `deposit_balance` (D-31). The quote-born booking is born
> UNPAID; the charge through `/api/checkout` is its own lane.
