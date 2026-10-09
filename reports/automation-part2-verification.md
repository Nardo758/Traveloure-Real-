# Part 2 — activity clock and add-time snapshot

## Status: implemented on a work branch; NOT CERTIFIED

Source branch: `work/automation-part2-clock-snapshot`.
Verified source: `99afa4da3e151b21a8657363946c6a8d35fc84f3`.
No merge, publish, production write, schema change, migration, payment-code change,
feature-flag change or workspace secret change was performed. Part 3 was not started.

## Persisted clock and ownership

The clock is `_cart_automation.activity.at_ms` in existing cart JSONB, with a
server-generated `sequence_id`. Eligibility reads the persisted rows and database
clock; it does not use observers, page views, display update timestamps or sent-step
history as an inactivity clock. Missing or malformed stamps are ineligible with
`no_activity_stamp` / `invalid_activity_stamp`; empty carts return `empty_cart`.
The query records an ineligibility reason without logging account addresses.

The pure stamp builder never traverses cart input and performs no I/O. Its inputs
are server time and a server-generated sequence identifier. The clock is merged in
the same statement that changes cart contents. An injected builder error fails
before mutation with `Cart change could not be saved. Please retry.`

Only add, removal and quantity changes move activity. Equal quantities, notes,
display metadata, trip links and background projection sync do not. Stored newer
activity survives a delayed older writer. Every real change creates a fresh
sequence identifier, so a resumed sequence cannot reuse an old sequence's key.
No existing marketing-cap implementation was changed.

Explicit traveler routing and quote-accept HTTP requests establish server-only
request context for projection mutations; direct/background projection calls
default to no activity. The request context is not an observer or a stored clock.

## Snapshot and notification bookkeeping

New priced provider-service rows capture server-side published unit price,
the existing USD currency contract, provider/selected-slot availability facts and
`captured_at` in their INSERT. Client `_cart_automation` input is discarded.
Snapshots remain unchanged during re-adds, quantity changes and metadata updates.

Legacy items and subjects without authoritative priced-provider facts have no
snapshot and are skipped as `no_snapshot`; no client-price fallback or guessed
backfill is used. This is not a claim that external/partner/private-venue subjects
have complete price-and-availability snapshots.

For `cart_item_changed` bookkeeping, the existing outbox writer commits its row and
notified JSONB values together in a transaction. Missing snapshots, unchanged values,
already-recorded values or state-write failure abort that notice without invoking
the generic direct-send fallback. Existing non-cart email behavior is unchanged.
The comparison uses the last notified values after the first notice, including
when a later change returns to the original add-time values.

This adds no commerce producer, template, observer, schedule or registry copy.
No claim is made about a new live reminder sequence or Part 3 send-time lifecycle
guards. Provider-free sender overrides were used only inside disposable test schemas;
their synthetic message identifiers are NOT real delivered-email evidence.

## Cart write-site coverage

| Site | Activity behavior / proof |
| --- | --- |
| `storage.addToCart`: new row | Snapshot and clock in the INSERT; forged state ignored |
| `storage.addToCart`: existing row | SQL quantity increment and clock in the UPDATE; snapshot preserved |
| `storage.updateCartItem` | Quantity change and clock in the UPDATE; equal quantity/metadata do not move it |
| `storage.removeFromCart` | One delete-and-survivor-stamp CTE statement |
| `storage.clearCart` | Same deletion mechanism; empty cart closes by absence |
| `storage.migrateGuestCart` | One statement for planned moves, duplicate/orphan deletions and guest-survivor stamps |
| `storage.replaceUserCartWithVariantItems` | One delete/insert statement; FK failure rolls back replacement |
| `syncItemProjection`: INSERT / UPDATE / DELETE | Real-activity origin stamps; metadata/background sync preserves clock/snapshot |
| `convertCartLinesToItems` | Cart deletion/stamping inside the existing conversion transaction |
| `attachTripToCartItems` | Metadata-only; activity unchanged |
| `materializeCartLinesAsItems` | Metadata-only links; envelope unchanged |
| `recordQueuedCartValues` / existing outbox | Notified values only; snapshot and activity unchanged |
| `clearCheckedOutCartLines` and its facade | APPROVED EXCLUSION: unchanged; surviving partner row unchanged after cleanup |

No additional cart mutation site was refused. The post-payment exclusion was
explicitly approved because this cleanup runs after a confirmed charge; marketing
metadata must not alter its existing payment/error behavior.

## Fresh development evidence

The retained isolated runner verified the development fingerprint, cloned only
schema structure and constraints, and dropped the disposable schema afterward.
Each integration loop used new randomized cart/user/service identifiers. No
production data or live email transport was used.

| Rule | Loops | Clean loops | Result |
| --- | ---: | ---: | --- |
| Priced-provider add snapshot complete and server-authored | 2 | 2 | PASS |
| Client stamp/snapshot ignored | 2 | 2 | PASS |
| Display metadata preserves snapshot and activity | 2 | 2 | PASS |
| Legacy missing snapshot skipped; no guessed backfill | 2 | 2 | PASS |
| Resume produces fresh sequence | 2 | 2 | PASS |
| Idle just below / at / above 60 minutes | 2 | 2 | PASS, controlled server-time boundary against stored stamps |
| Cart mutation and activity atomic at covered writers | 2 | 2 | PASS |
| Injected builder error leaves cart unchanged; safe error | 2 | 2 | PASS |
| Null/scalar/array/legacy/large JSON does not block valid re-add | 2 | 2 | PASS |
| Concurrent existing-line increments retain both deltas | 2 | 2 | PASS |
| Queue/notified state bookkeeping; duplicate suppression | 2 | 2 | PASS, provider-free |
| Post-payment partner survivor unchanged | 2 | 2 | PASS |
| Add success and latency measurements | 2 | 2 measured | 100% success; measured latency increase below |
| Golden regression | 1 | 0 | OPEN: 142 pass, 1 retained-harness failure |
| Current guard batch | 1 | 0 | OPEN: 77/78 pass; new test reachability failure |
| Typecheck against Part 1 baseline | 1 | 1 | Same 117 diagnostics after normalizing line/column shifts |

The Node run had 7 parent tests passing, 0 failing; the integration parent contains
the two fresh cart loops. These are not two globally clean certification loops:
golden and CI reachability remain open.

### Add-to-cart measurements

The before implementation was built from reviewed main source
`2f9bcaba9752f9700b956ef1ff30c0e748a3ba99`, not an approximation.
Before/after samples alternated after warm-up against the same isolated subjects.

| Loop | Before successes | After successes | Before p50 / p95 ms | After p50 / p95 ms |
| --- | --- | --- | --- | --- |
| 1 | 60/60 (100%) | 60/60 (100%) | 19.014 / 77.011 | 25.530 / 112.057 |
| 2 | 60/60 (100%) | 60/60 (100%) | 9.531 / 30.257 | 12.651 / 28.716 |

Median increases: +6.516 ms (34.3%) and +3.120 ms (32.7%). There is no claim of zero
overhead. Snapshot capture adds authoritative fact lookup and JSONB/SQL construction
to the INSERT; stamping also adds JSONB work. There is no second activity write or
extra cart-write round trip. This final measurement overlapped the golden run, so
shared database/CPU load affects absolute timings; it is not an isolated production
performance or load-test result. A quieter earlier measurement of the same cart-add
implementation showed approximately +1.19 ms / +0.98 ms median overhead.
The precise CPU/database contribution was not separately profiled.

## Verification blockers

1. `scripts/check-test-files-wired.cjs` identifies both new root test files as
   unreachable from existing CI selectors. No orphan baseline or guard was weakened.
2. The retained Part 1 harness asserts `guardCommands().length === 76`.
   The reviewed base main already declares 78 guard commands. Its pending-assertion
   parser safety checks must remain intact while refreshing this stale expectation.
   This is a retained test expectation failure, not a demonstrated cart regression.

Further scope approval is needed for existing CI/reachability wiring and the
retained test expectation. Part 2 remains open until those checks pass.

## Changed files

- `server/routes.ts`
- `server/storage.ts`
- `server/services/cart-projection.service.ts`
- `server/services/email-outbox.service.ts`
- `server/services/cart-email-state.service.ts` (new)
- `server/__tests__/cart-email-state.test.ts` (new)
- `server/__tests__/cart-email-state.db.test.ts` (new)
- This verification report (new)

`client/src/pages/cart.tsx` needed no change. Payment writers, checkout promotion,
post-payment cleanup, schema and migration registration remain unchanged.

## Reproduction

```sh
# Requires independently verified development fingerprint, not production.
MESSAGING_DEV_FINGERPRINT="<verified-development-fingerprint>" \
node scripts/verification/run-messaging-gate.mjs --isolated-db \
  server/__tests__/cart-email-state.test.ts \
  server/__tests__/cart-email-state.db.test.ts

node --max-old-space-size=6144 node_modules/typescript/bin/tsc \
  --noEmit --incremental false --pretty false
node scripts/check-test-files-wired.cjs
```

Golden verification used only the retained Part 1 test/report harness files on a
temporary worktree of the verified source, with `--isolated-db --loop=1`; no private
configuration, live-delivery flags or old runtime/registry/CI copies were imported.
Development preview was restarted and its public landing page rendered successfully.
