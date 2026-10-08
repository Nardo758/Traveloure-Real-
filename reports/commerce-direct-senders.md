# Commerce direct senders — current read-only inventory

Source head: `f413edab1bbde376ba55b2139c952683c520e4fc`. Checked: 2026-10-08T16:03:21.898Z.
Ten active families plus the unused helper. No sender has been moved.
Part assignments below are proposals for the requested Part 6/8 handoff, not authorization to change a sender.

| Family | Helper / transport definition | Current call references | Proposed Part |
|---|---|---|---|
| Vendor bulk | server/services/vendor-management.service.ts:283 | Vendor transport call; trips.routes.ts owns the batch route | 6 |
| Payment failed | server/services/email.service.ts:1525 | No executable direct call found by this scan; bindings must also be inspected | 8 |
| Expired claim | server/services/email.service.ts:1103 | server/services/checkout-claim.service.ts:1689 | 8 |
| Late-success refund notice | server/services/email.service.ts:1027 | server/services/checkout-claim.service.ts:2156 | 8 |
| Booking cancellation / refund notice | server/services/email.service.ts:908 | server/routes.ts:7765 | 8 |
| Booking decline notice | server/services/email.service.ts:795 | server/routes.ts:7858 | 8 |
| Plan delivered | server/services/email.service.ts:2034 | server/routes/booking-actions.ts:1444 | 8 |
| Plan approved | server/services/email.service.ts:2106 | server/routes/booking-actions.ts:1613 | 8 |
| Plan changes requested | server/services/email.service.ts:2178 | server/routes/booking-actions.ts:1619 | 8 |
| New plan suggestion | server/services/email.service.ts:2259 | server/routes/booking-actions.ts:1153 | 8 |
| Unused deprecated booking helper | server/services/email.service.ts:512 | No executable direct call found by this scan; bindings must also be inspected | 8 |

## Scope / protections
- Verification, reset, identity/application messages and admin digests are outside this commerce list; they are still audited in the baseline.
- The outbox's final generic transport is legitimate; do not classify every sendEmail reference as a bypass.
- Canonical and legacy booking confirmations already use enqueueBookingConfirmationEmail. Do not reintroduce or duplicate either rail.
- Keep payment/refund/payout behavior, notification claims and existing status guards unchanged in any future sender work.
- Removing the unused helper requires separate deletion approval; this inventory grants none.
- Historical reference on the preserved branch was rechecked for present function ownership; its old line numbers are not fresh evidence.
