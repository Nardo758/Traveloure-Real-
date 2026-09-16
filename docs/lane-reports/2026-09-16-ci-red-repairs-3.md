# Lane report — CI: main red on three test gates, round 3 (one PR, three test repairs) + one fix on a sibling branch

**Ledger row:** `2026-09-16-ci-red-repairs-3`
**Punchlist:** V-36 filed (the 40 excluded rails + the coverage generator's hand-copied 30) — open, not struck
**Base:** `origin/main` @ `21669a34d` (the merge of ledger `2026-09-16-bundle-partial-settlement`)
**Schema/migration/product code:** none. Test files, generated audit inventory, register files only.

---

## 1. What each gate MEANT, and why `main` was red

### (a) `suite-mutation-auth` — "every high-risk role-console route is probed or explicitly excluded"

`expert-provider-mutation-auth.test.ts` derives its probe set as *high-risk manifest routes under an
assembled prefix backstop* and requires every other high-risk role-console route to be NAMED in
`EXCLUSIONS`. Two merges added four rails that are neither: `POST /api/expert|provider/bookings/:id/component-failed`
(`2026-09-16-d32-d35-bundle-components`) and `POST /api/provider/quotes/:quoteId/issue|withdraw`
(`2026-09-15-d28-d31-service-quotes`). All four are `isAuthenticated` + an ownership check INSIDE the
handler, so no prefix backstop sees them.

**Decision: probe, never exclude.** The sibling booking rails (`complete`, `status`) had been excluded
with "a real fixture is required". An exclusion is an allowlist on a mutation rail; the §14/§19 posture
refuses to grow one when a fixture is buildable. So the suite gains a SECOND probe set, `RESOURCE_PROBES`
(a `Record<endpoint, "booking" | "quote">`), and a new live test builds a disposable owner (stored role
`service_provider`, logged in over `/api/auth/login` like the ordinary user), one listing they own, one
`confirmed` booking on it with the ordinary user as TRAVELER, and one `requested` quote from that traveler.
Each rail is probed three ways, sequentially, status-exact:

| principal | component-failed (both mounts) | quotes issue | quotes withdraw |
|---|---|---|---|
| anonymous | 401 | 401 | 401 |
| the resource's own traveler (non-owner) | 404 "not found or not yours"; row still `confirmed` | 404 `code: not_found`; still `requested` | 404; still `requested` |
| owner | 400 naming `componentServiceId` (body validation is the statement AFTER ownership; nothing recorded) | 200 → `quoted` | 200 → `withdrawn` |

The non-owner refusal is a 404, not a 403: "no such thing" and "not yours" are one sentence (LD 40), so
the rail cannot enumerate rows. The quote probes send a VALID body so the refusal is `issueQuote`'s
ownership check and not the zod parse that precedes it (an empty body 400s for owner and stranger alike).
The structural gate now refuses: a rail in two sets; a `RESOURCE_PROBES` key that is not high-risk; a
prefix-probed rail with a resource fixture (a second proof of one gate); and — via the live test's own
tally — a `RESOURCE_PROBES` key with no probe. Cleanup deletes quote → booking → listing → sessions →
both users and rethrows the first error; verified 0 rows left on every table.

### (b) `transport-payment-intent` T5 — "the Stripe refund must carry an idempotency key"

T5 grepped the whole-row refunder for an inline `{ idempotencyKey }`. `2026-09-16-bundle-partial-settlement`
moved the ONE `stripe.refunds.create` into `private createStripeRefundForBooking(input)` (§18 rule 1), which
passes `{ idempotencyKey: input.idempotencyKey }`. The key never left; the spelling did. **Confirmed red on
the pre-change test against the same tree** before re-pinning.

**Decision: pin the invariant.** The suite has no fake Stripe client (T4's stated negative space), so the
proof stays structural, in four facts: exactly ONE `stripe.refunds.create(` in the file and it lies inside
the helper's body; the helper hands Stripe `input.idempotencyKey`; `refundServiceBooking` reaches
`this.createStripeRefundForBooking(` passing a key, and that key is still the amount-scoped
`refund-sb-${bookingId}-${amountCents}`; and the cancel route calls `stripePaymentService.refundServiceBooking(`.
Method bodies are sliced by a small `methodBody()` (declaration → next two-space-indented method), so the
pin follows the helper if it moves. The atomic `status <> 'refunded'` claim pin is unchanged.

### (c) `offering-contract-snapshot` K1 — "the idempotency-key templates are exactly what they were"

K1 derives every `idempotencyKey: \`…\`` template under `server/` and compares to an exact set of 9. The
partial settlement added `bundle-settle-${input.bookingId}`. **Decision: ratchet by exactly one**, with the
proof named beside it (`bundle-partial-settlement.db.test.ts` S2 — the one Stripe call carries the key; S5 —
a retry after a Stripe failure carries the SAME key). Not a superset, not a regex.

## 2. Generated files

`npm run generate:mutation-auth && npm run generate:mutation-auth-coverage`: manifest diff is line numbers
ONLY (`check:mutation-auth`: "594 mounted mutation registrations — rail set unchanged"). The coverage
JSON/MD on `main` were stale against `main`'s own manifest (583 → 585 unique endpoints); they are current now.
No `check:mutation-auth-coverage` runs in CI, which is why nobody noticed; recorded, not changed here.

## 3. Validation

| check | result |
|---|---|
| `suite-mutation-auth` six-suite line, live (`MUTATION_AUTH_AUDIT_OK=1`, fresh Postgres 16, migrations 307/307, built bundle, CI env) | **155/155** (154 on `main` + the new test); 12 resource probes each on its expected status |
| `npm run check:mutation-auth` | rail set unchanged |
| `offering-contract-snapshot.test.ts` (CI's dummy `DATABASE_URL`) | 14/14 |
| `transport-payment-intent.db.test.ts` T5 | pass (fail before the re-pin, same tree) |
| `npx tsc --noEmit` error count | 129 (baseline; tests are outside `tsconfig` anyway) |
| `npm run build` | OK |
| `check-decision-guards.cjs` | see PR checks / run before push |
| `check-money-endpoints.cjs --self-test` + run | self-test OK (37 fixtures); run exit 0 |
| `phase2-fee-gate.sh` | PASSED (one filed debt printed, `#PS2`) |
| `check-test-files-wired.cjs --self-test` + run | 12/12; `test-orphan-ratchet: OK — baseline: 33` |
| `check-duplicate-migration-prefixes.cjs` | OK |
| `grep -c replit.local package-lock.json` | 0 |

## 4. Part 2 — PR #966 (`task-bundle-component-traveler-cancel`)

W2 of the same snapshot suite requires that exactly ONE module names `offering_contract_snapshot`; #966 added
two READERS (`booking-completion.service.ts` reads the bundle snapshot's policy tier for the traveler-cancelled
component; `cancellation-policy.service.ts` resolves the tier off the purchase-time snapshot). W2's real
invariant — nothing UPDATEs the column — is asserted for every namer and both readers pass it. See that
branch's commit for the exact lines.

## 5. Left open

- V-36: the 40 excluded rails and the generator's hand-copied 30 (a §18 rule 1 derivative with a count pin).
- `check:mutation-auth-coverage` is not wired into any workflow; the coverage files can go stale silently.
- The `EXCLUSIONS` comment block still says the excluded rails "need a purpose-built resource fixture" — true,
  and `RESOURCE_PROBES` is now the worked example of building one.
