# Audit report — concierge-revision-p3-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

Audited the merged P3 recourse ladder: My Bookings, listing promise, concern endpoint, admin dispute queue, admin refund/dismiss actions, escrow handling, schema, and admin authorization. The mock footer saying nothing is built is stale. Automated/partial refunds and non-ready-made refund types are explicitly out of scope. No application, test, migration, mock, or report files were changed.

## Checks performed

- Inspected My Bookings, ready-made detail, reconciliation UI, ready-made/admin routes, refund service, schema, and admin middleware.
- Grepped for retired refund UI/mutation, promise copy, concern atomic claim, admin actor/ledger calls, escrow freeze, dispute fields, and blanket authorization.

## Findings

| Category | Finding | Evidence |
|---|---|---|
| MATCH | My Bookings has revision status and “Something wrong?” concern UI; self-serve refund is absent. Listing promise states one consultation and one revision. | `client/src/pages/my-bookings.tsx:368-395,526-584,610-640`; `client/src/pages/ready-made-detail.tsx:511-523` |
| MATCH | Concern claim is atomic and owner/status constrained; winning claims freeze escrowed earning. | `server/routes/ready-made.routes.ts:1393-1446`, especially `:1401-1409,1426-1429` |
| MATCH | Admin queue shows facts, and reconciliation renders its actions. | `server/routes/admin.routes.ts:1105-1143`; `client/src/pages/admin/reconciliation.tsx:220-231,460-637` |
| MATCH | Admin refund uses the shared ledger, derives actor/amount server-side, and enforces the 90-day bound, paid-out refusal, and soft-revoke behavior. | `server/routes/admin.routes.ts:1155-1203`; `server/services/ready-made-purchase.service.ts:215-228,257-284,344-355` |
| MATCH | Dismiss is atomic and unfreezes earning; `/api/admin` has a blanket admin guard; dispute schema is additive. | `server/routes/admin.routes.ts:1258-1291`; `server/routes.ts:630-649`; `shared/schema.ts:8795-8800` |
| STALE-MOCK | “Nothing here is built yet” is stale mock furniture, contradicted by the executed ledger and shipped implementation; it is not a gap. | Brief lines 5, 63-65; implementation evidence above |
| ALREADY-RULED | Automated, partial/prorated, and out-of-scope refund variants are explicitly excluded and need no follow-up. | Brief behavior 14 and “Known divergences / notes” |

## Follow-up candidates

None.
