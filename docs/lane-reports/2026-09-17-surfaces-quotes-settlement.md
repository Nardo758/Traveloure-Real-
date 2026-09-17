# Lane report — surfaces for LD 49 (quotes) and LD 48/50 (bundle components + partial settlement)

Ledger row: `2026-09-17-surfaces-quotes-settlement`.
Branch: `task-surfaces-quotes-settlement`, off `origin/main` @ `72b92cfcf`.

**No schema change, no migration, no new write rail, no Stripe or charge code.** Every action button
calls a rail that already existed on `main`.

## What the lane found

Three ratified rulings had shipped their rails with no screen at all:

- **LD 49 (quotes).** `service-detail.tsx` already POSTs the request (a prior lane wired it), but
  `GET /api/me/quotes`, `POST /api/quotes/:id/accept|decline`, `GET /api/provider/quotes` and the
  owner issue/withdraw rails had **zero client callers**. A traveler could ask for a price and never
  see the answer; a seller could not answer at all.
- **LD 48/50 (bundle components + settlement).** `booking_component_states` and
  `bundle_partial_settlements` were read by **nothing outside the services that write them**
  (grepped): each write rail answers with the outcome of *that call* and no endpoint listed the rows.

## What landed

### (a) Quotes

| Surface | Reads | Calls |
|---|---|---|
| `/my-bookings` → new **Quotes** tab (`TravelerQuotesPanel`) | `GET /api/me/quotes` | `POST /api/quotes/:id/accept`, `.../decline` |
| `/provider/services` (Catalog) and `/expert/catalog` (`SellerQuotesPanel`) | `GET /api/provider/quotes` | `POST /api/provider/quotes/:id/issue`, `.../withdraw` |

Placement on Catalog follows the C9 precedent LD 22 (b) states: per-listing curation is the "what I
sell" module, never the Workstation. The same component serves both consoles — the owner rails are
gated at the ROW, so an expert's listing is quoted by that expert and a provider's by that provider.

**The client derives no lifecycle and no window.** `lifecycle` (including `expired`) arrives resolved
from the ONE shared `quoteLifecycle`; `expiresAt` is the server's. **No day count and no ceiling
exists on the client** — `validityDays` is sent only when the seller typed one (absent = the platform
default, which is the server's to know), and D-29's refusal is worded back from the server's own
`ceilingDays`/`requestedDays`, so an operator changing the ceiling moves the sentence with no client
edit.

**Rendered as "not available yet", and why.** LD 49 births the quote-accepted booking UNPAID and
leaves the `/api/checkout` arm to its own lane. That lane has **not** landed on `main` (verified:
`payments.routes.ts` has no quote arm and `checkout-claim.service.ts` no `quoteId`), so an accepted
quote renders `QUOTE_CHECKOUT_UNAVAILABLE_NOTE` — "your booking is recorded at this amount and is not
paid yet; paying for a quoted booking is not available on the site yet" — rather than a Pay button
that leads nowhere. **No charge was built.**

The deposit-vs-full line is read off the **minted booking row** (`resolveDepositPlan`'s own answer,
written by the accept rail), never re-split; a booking the page has not loaded yields **no line** at
all rather than "payable in full" (§13).

### (b) Bundle components + settlement

`BundleComponentsPanel` — ONE component with an `audience` prop, not two — mounts on `/my-bookings`
(traveler), `/provider/inbox` and `/expert/bookings` (seller). It renders each component's state and
calls the existing rails: `POST /api/{provider|expert}/bookings/:id/component-failed` and
`POST /api/bookings/:id/components/:componentServiceId/cancel`.

**No cancel preview, by finding.** No server preview endpoint exists — the percent is resolved from
the snapshotted policy *inside* the cancel's own atomic statement — so no number is shown before the
act. The dialog names what decides it; the pinned `cancel_refund_percent` and the refunded amount
render afterwards, off the row.

**The two §13 distinctions are pinned by test:**
- "prepared, awaiting settlement" ≠ "refunded". A failed or cancelled component with a known
  allocation has had **nothing** refunded until `refunded_at` is stamped.
- A `bundle_partial_settlements` row with no `settled_at` is **in progress**, not settled. The
  remainder sentence ("the remainder stays with the provider") is emitted **only** when the row
  itself says the seller kept something (`settled_amount_cents > 0`); a settlement whose pinned
  refund is 0 says *no money was refunded*, never "refunded 0.00".

**No capacity claim is rendered anywhere.** LD 50's last paragraph: nothing reserves capacity per
component, so `released: 0 / no_component_capacity_reserved` is the code *stating* that, not a
release. Repeating the zero would invite "0 slots returned" on screen. Pinned by C1, which greps
every sentence the module can emit for `slot|capacity|released`.

## The one read endpoint added

`GET /api/bookings/:id/components` — `server/routes/booking-components.routes.ts`. Added only because
the surfaces had no server truth to read.

- **§14 read clause:** actor is the session; the audience is DERIVED from the row (`travelerId` ⇒
  traveler, `providerId` ⇒ seller) and never from a query string.
- **ONE 404** for absent and not-yours alike, so it cannot probe which bookings exist.
- **Allowlist projection** naming every field (§14's third-instance rule — a denylist is not a
  projection). No `users.id` (LD 40). The settlement's unbounded `component_outcomes` jsonb is
  deliberately **not** published. An absent `allocation_cents` is omitted, never zero-filled.
- Calls the ONE shared `readBundleComponentStates`, so the rows-first / legacy-jsonb fallback and its
  named `source` are not re-implemented (§18 rule 1).
- `settled` is stamped from `settled_at` **alone** — a claim is not a settlement.

## One module per surface, per §18 rule 1

| Module | Owns |
|---|---|
| `client/src/lib/quote-copy.ts` | quote lifecycle → label/tone/sentence (both audiences), amount line, validity line, the affordance predicates, the deposit line, the checkout-unavailable note, the validity-refusal wording |
| `client/src/lib/bundle-component-state-copy.ts` | component status → label/tone/sentence (both audiences), allocation line, refund line, cancel-terms line, the no-preview note, the settlement read-out, the legacy-source note |
| `client/src/lib/api-refusal.ts` | recovering the server's own refusal body from the `"<status>: <raw body>"` string `apiRequest` throws |

`api-refusal.ts` exists because every named refusal the rails are careful to emit —
`validity_exceeds_ceiling` with its `ceilingDays`, `component_not_pending` with the current status —
arrives as a string with JSON inside it. Printing that shows the user a brace; replacing it throws
away *which* fact refused. One parse, several callers.

An **unknown status** in either vocabulary (both app-enforced, no DB CHECK) renders as unrecognised
and draws **no action**, never mapped forward to a neighbour.

## Tests

21 tests, all pure (no DB, no browser, no clock), wired into `.github/workflows/build.yml`:

- `client/src/lib/__tests__/quote-copy.test.ts` — Q1–Q8, A1–A3, V1–V5, B1–B3, D1–D4, R1–R3, C1 (8 tests)
- `client/src/lib/__tests__/bundle-component-state-copy.test.ts` — S1–S6, P1–P3, L1–L3, T1–T2, N1, E1–E6, G1–G2, C1 (8 tests)
- `client/src/lib/__tests__/api-refusal.test.ts` — R1–R7, M1–M2 (4 tests)

**Negative space:** these prove predicates and copy. No browser painted anything, and none of the
SERVER's gates is proven here — those are the rails' own suites.

## Validation

| Check | Result |
|---|---|
| `tsc --noEmit` error count | 129 (unchanged) |
| `npm run build` | OK |
| `check-decision-guards.cjs` | OK (0 deferred warnings) |
| `check-money-endpoints.cjs --self-test` + run | OK (37 fixtures) |
| `phase2-fee-gate.sh` | OK |
| `check-test-files-wired.cjs --self-test` + run | OK (12/12); `test-orphan-ratchet: OK`, baseline 33 unchanged |
| `check-duplicate-migration-prefixes.cjs` | OK |
| `check-public-user-id.cjs` | OK — the new read publishes no `users.id` |
| `check-query-userid-reads.cjs` | OK |
| `grep -c replit.local package-lock.json` | 0 |
| new suites | 21/21 |

`check-undeclared-tables.cjs` not run: no schema was touched and it requires a live database URL.
Migrations-from-empty not run: no migration in this lane.

## What remains, named

1. **The quote-born charge** through `/api/checkout` — its own lane, rendered honestly on screen.
2. **A per-component cancellation preview** — needs a server endpoint that resolves the snapshotted
   policy without flipping the row; none exists, and this lane invented none.
3. The per-component acceptance/dispute inheritance (LD 48's own remaining clause) is untouched.
