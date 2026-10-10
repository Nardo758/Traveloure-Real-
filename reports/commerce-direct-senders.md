# Commerce direct-sender inventory — read only

No sender was changed. No email was sent for this inventory. Locations refer to
the inspected checkout; named helpers are the stable lookup if line numbers move.
Registry wrappers/SDK transport wrappers provide metadata and preserve callbacks,
not a durable email obligation by themselves.

The ten functional families below explicitly group related variants. This is a
complete current-source inventory of these direct helper paths, **not a claim
that the unavailable historical ten-family manifest had identical labels**.
Every grouped variant is named; additional operational direct paths are listed
below rather than silently omitted.

| Order | Family | File / line and live caller | Reliability and duplicate risk |
|---:|---|---|---|
| 1 | Vendor bulk email | `server/services/vendor-management.service.ts:234,283`; `server/routes/trips.routes.ts:1200` | Per-recipient direct `sendEmail`; a partial batch can deliver some messages before later failure. Retry can repeat accepted recipients without a durable recipient obligation/idempotency identity. **First conversion priority.** |
| 2 | Booking / claim failure, cancellation, refund and expiry notices | `server/services/email.service.ts:817,930,1049,1125,1547`; callers `server/routes.ts:7790,7883`, `server/services/checkout-claim.service.ts:1507–1509,1689,1738,2156` | Direct helpers rather than outbox obligations. Existing claim/state stamps can mitigate repeats but do not atomically commit provider acceptance. Failure after a business transition risks missing notice; provider acceptance followed by stamp failure risks duplicate notice. Audit each variant before any conversion; no payment-writer edit approved. |
| 3 | Authentication verification and password reset | `server/services/email.service.ts:650–713,731–787`; `server/replit_integrations/auth/emailAuth.ts:349` and verification call sites | Direct SDK actions. Issued token/account state and delivery are separate; transport failure can leave an unusable journey, retries can send several valid links. Existing token rules must be preserved; wrappers do not add durable retry. |
| 4 | Identity verification decision | `server/services/email.service.ts:1624–1677`; `server/routes/admin.routes.ts:3122` | Decision can commit independently of mail. Repeat admin action or uncertain provider result can repeat notice; no authoritative outbox retry guarantee. |
| 5 | Expert application decisions | `server/services/email.service.ts:1702–1755,1780–1835`; `server/routes/admin.routes.ts:3000,3029` | Approval/rejection persisted separately from direct SDK delivery. Suppressed/fire-and-forget errors can lose notice; repeat action can duplicate it. Preserve admin decision behavior. |
| 6 | Provider application decisions | `server/services/email.service.ts:1874–1932,1958–2014`; `server/routes/admin.routes.ts:3331,3365,3412` | Same decision/delivery separation; multiple rejection paths require one stable lifecycle identity if converted later. No such conversion here. |
| 7 | Plan delivered | `server/services/email.service.ts:2056–2111`; `server/routes/booking-actions.ts:1444` | Direct SDK delivery after plan-state work. Failure loses notification; repeated delivery operation or retry can repeat an accepted email. Registry metadata is not durable dedupe. |
| 8 | Traveler plan decision: approved / changes requested | `server/services/email.service.ts:2128–2183,2200–2261`; `server/routes/booking-actions.ts:1613,1619` | Direct decision notices with separate state and transport. Needs a decision/version-specific identity; a blanket booking key would incorrectly suppress later legitimate decisions. |
| 9 | New suggestion | `server/services/email.service.ts:2281–2336`; `server/routes/booking-actions.ts:1153` | Suggestion persistence and delivery are separate. Lost send or duplicate accepted notice possible; a suggestion-specific identity is needed, not only a trip key. |
| 10 | Administrative digests | `server/services/email.service.ts:1251–1398`, `server/services/admin-digest-scheduler.service.ts:189`; also `server/jobs/dailyAdminDigest.ts:190` | Scheduled direct transport; overlap/retry can repeat a digest and failure may lose a time window. Distinct producers need explicit window/recipient identities rather than assumed equivalence. |

## Unused confirmation helper — retain, no conversion

`server/services/email.service.ts:534–547`, `sendBookingConfirmationEmail`,
direct SDK transport. Current production source has no call site for this named
helper. If revived, it would bypass the existing durable booking alert path,
creating both missing-delivery and double-confirmation risks. Suggested order:
last; first decide whether to retire it under separately approved removal scope.
It is not deleted here.

## Additional operational paths (not hidden inside the ten-family count)

- `server/jobs/nightlyQA.ts:259`: direct QA report emails. Reliability depends on
  job completion; retry can repeat recipients. Operational, not traveler commerce.
- `server/routes/admin.routes.ts:6737`: explicit admin test email SDK seam.
  Manual retry/timeout can deliver twice. Keep manual semantics; no conversion
  authorized.
- `server/services/email.service.ts:130–174` is the generic transport, not a
  business family. Calls through the outbox are not classified as direct merely
  because the final provider uses this function.
- Signup welcome and normal itinerary messages already use the authoritative
  outbox paths; they are not direct-sender conversion candidates.

Suggested future work is inventory only: vendor bulk first, then business-critical
booking/claim and account notices, then application/plan decisions, then operational
digests. Any conversion needs its own exact touch list and approval. This report
does not authorize sender, payment, booking metadata, schema or feature changes.
