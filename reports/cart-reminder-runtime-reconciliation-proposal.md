# Held cart reminders — runtime reconciliation proposal

Proposal only. No runtime integration is approved or implemented by this document.

## Ten-line proposal

1. Preserve `work/automation-part10-final-gates@26b347386` and its backups, and the mechanical replay `work/automation-cart-replay-20261115@51e02fafb4e7d7b5b38183e2dfc8ff9352002b8d`; do not reset, replay or modify them here.
2. Use only the retained foundation files as the starting point: `server/services/cart-email-state.service.ts`, `server/__tests__/cart-email-state.test.ts`, and `server/__tests__/cart-email-state.db.test.ts`; their presence is not actual-writer proof.
3. Keep main's published-price eligibility, price-free provider projection, checkout price resolution, quantities, party sizes, room-stay semantics and payment behavior authoritative; no wholesale storage or projection replacement.
4. Capture a server-owned, immutable add-time provider price/availability snapshot only in private `_cart_automation` metadata; never populate display `price`/`estimatedCost`, quote a charge, reserve inventory, infer currency for unknown rails or backfill legacy snapshots.
5. Retain the exact `12.34` snapshot assertion and hostile client `0`/`FAKE` input; separately prove main's display/checkout behavior is unchanged rather than accepting `0` as the snapshot or changing main's price rules.
6. Request a separately reviewed hunk-level writer allowlist for atomic metadata capture and activity stamps on actual non-payment cart mutations; `server/storage.ts`, `server/services/cart-projection.service.ts` and `server/routes.ts` remain excluded unless their exact necessary hunks receive explicit approval.
7. Prove insert/re-add/changed quantity/removal/clear/guest migration/variant replacement and user-origin projection changes through real writers; reads, equal quantity, display-only edits, background refresh and trip association must not restart the idle clock.
8. After approval only, use an owned disposable local database to prove persisted timestamps, immutable snapshots, concurrent updates, rollback on injected failure, malformed/legacy input, sequence renewal and the exact 60-minute boundary; preserve failed attempts and require two complete clean loops.
9. Exclude payment-writer changes, checkout/payment cleanup, shared-schema changes, migration files/registration, new tables, timers, commerce sweep, send enablement and real providers; all four held types remain off, with no push, merge or production access.
10. Keep C23,D01,D02,D03,D04,D06,D07,D09,D10,D11,D12,D13,D14,D15,D16,D20,D22,D23,D24,D25,D26,D27,D32,D35,F14 WAITING `W-CART-PAYMENT-PROVENANCE`; this proposal neither promotes rows nor certifies payment provenance.

## Evidence and limits

The exact prior ten-line replay receipt is in the local integration checkout:
`generated-artifacts/automation-integration-freshmain-20261114/reports/automation-flow-tracker.md`,
under **Cart replay proposal/outcome (ten lines)**. Its sibling
`reports/automation-register-269.csv` contains the 25 named WAITING rows above.
The root checkout's tracker describes a different, isolated signup fixture;
its root register is absent. Neither was overwritten or reconstructed here.

The historical receipt reports **6/7**, with the database case stopped at
expected `12.34`, actual `0`, before the remaining writer scenarios and benchmark.
Those results were not rerun and are not fresh proof. Source inspection shows
the retained helper reads `provider_services.price` for its private snapshot;
main's writer does not yet integrate that helper, leaving the supplied client
envelope unproven. This is an integration gap, not evidence that main's
authoritative service price became zero.

Main intentionally omits provider money from projection display metadata and
retains its published-price admission checks. A private historical notification
snapshot must never become an input to checkout. The retained helper's USD
assumption must be restricted to the already-established provider USD rail;
unknown subjects/currencies remain ineligible, not converted or guessed.

## Alternatives and recommendation

- **Recommended: narrow private-metadata integration, after approval.** Keep
  main's money rules, reuse the retained foundation, and prove each actual
  approved writer. Requires a precise exception to the current file exclusions.
- **Helper-only verification:** respects current exclusions but cannot establish
  actual-writer provenance. It cannot close this integration gap.
- **Restore old storage/projection or accept a zero snapshot:** rejected. Either
  risks reverting main's rules or weakens the retained assertion.

## Required writer review before any implementation

The following is a review map, not permission to edit excluded files:

| Candidate seam | Narrow proposed responsibility | Rules that must remain unchanged |
|---|---|---|
| `storage.addToCart` | Strip client-owned automation state at insert, capture trusted provider facts, preserve the original snapshot on re-add, stamp actual activity atomically | Main's owner/deduplication rules, room/date replacement, pinned units, party answers and selected slots |
| `storage.updateCartItem` | Stamp only a real quantity change in the successful write; preserve state on other edits | Existing field update behavior; no inferred activity from reads |
| `storage.removeFromCart`, `storage.clearCart` | Change surviving cart activity atomically with removal; empty cart remains closed | Existing ownership/scope and experience filtering |
| `storage.migrateGuestCart`, `storage.replaceUserCartWithVariantItems` | Move/deduplicate or replace rows atomically with trusted activity; do not invent historical snapshots for moved rows | Main's ownership, line identity and existing data fields |
| Projection upsert/delete and `convertCartLinesToItems` | Preserve envelope across background refresh; stamp only established user-origin membership/quantity changes in the enclosing transaction | Main's price refusal, routing, quantities, room metadata and conversion semantics |
| Existing user-mutation origin wiring | Establish origin only around specifically approved cart-changing calls | No request timestamps as idle evidence, no broad middleware or payment route wiring |

Before implementation, provide the founder with the exact proposed diff hunks,
callers, transaction boundaries and untouched money-path controls. An approved
design is not blanket permission to modify payment-bearing files. If the
necessary writer cannot be changed without crossing the exclusion, stop and
request that exact exception; do not introduce a wrapper that merely observes a
write afterward, a second writer, a route-only surrogate or a payment-path hook.
No payment writer, including `clearCheckedOutCartLines`, is an integration target.

## Acceptance evidence after a separate approval

- Run the retained unit cases and full real-writer database case, not a
  substitute helper-only test. Keep the `12.34` and later `18.00` snapshot
  assertions, forged metadata checks and failure-injection assertions.
- Verify snapshots against persisted provider facts and activity timestamps
  against before/after server-time bounds and persisted cart rows. Prove that
  delayed/concurrent writers cannot move activity backward or lose quantity.
- Assert price-free projection metadata alongside the private snapshot. Include
  priced and priceless providers and preserve main's existing pricing tests;
  private metadata must have no effect on charge calculation.
- Cover current pinned-one units, room-stay re-adds, party size, slot selection,
  experience scope and background projection preservation. Preserve main's
  behavior rather than restoring old writer implementations to fit the tests.
- Use only an owned disposable local test target with no real provider.
  Where the retained case references outbox state or payment cleanup, do not
  enable delivery or edit those writers; report an unavailable prerequisite
  explicitly instead of registering migrations or silently dropping assertions.
- Review the old benchmark source before claiming performance: the retained
  test compares against historical storage. Any new comparison must use the
  exact approved fresh-main baseline with equivalent fixtures. The historical
  benchmark was not reached and proves nothing about current performance.
- Record full source identity, assertions, failures, cleanup and two complete
  clean loops. Synthetic idle-boundary tests are not real elapsed-time proof.
  Even a passing foundation does not release the 25 payment-provenance holds.

## Decision requested

Approve or revise this reconciliation design only. If approved, the next step is
an exact hunk-level writer proposal for separate review, not automatic runtime
implementation. Until then all exclusions and holds above remain in force.
