# Audit report — concierge-revision-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

Audited Screens 1–3 only: P1 entitlement, buyer Concierge card, revision request, expert inbox, and derived status. Screen 4 is explicitly excluded and belongs to the P3 brief. The Slip `LogisticsRow` provider-transport limitation is a documented known gap, not a new defect. The bespoke pre-earn palette is outside scope. No application, test, migration, mock, or report files were changed.

## Checks performed

- Inspected `shared/schema.ts`, `concierge-card.tsx`, `ready-made.routes.ts`, `ready-made-purchase.service.ts`, `booking-actions.service.ts`, and `expert/inbox.tsx`.
- Grepped revision fields, by-clone gating, atomic claims, advisor access, workspace status, consult messaging, and suggestion flow.

## Findings

| Category | Finding | Evidence |
|---|---|---|
| MATCH | Each purchase has the additive revision entitlement fields and server-enforced lifecycle vocabulary. | `shared/schema.ts:8785-8793,8840-8843` |
| MATCH | By-clone lookup is owner-scoped and returns `{ purchase: null }` for non-clones; the card renders nothing without a purchase. | `server/routes/ready-made.routes.ts:1461-1464,1496-1505`; `client/src/components/marketplace/concierge-card.tsx:39-40,52-53` |
| MATCH | Buyer status is derived from the selling expert’s advisor workspace status; revision claim is atomic and grants accepted advisor access. | `server/routes/ready-made.routes.ts:1469-1473,1507-1517,1566-1600` |
| MATCH | Concierge card promises one consultation plus one revision and uses existing expert messaging; inbox exposes revision request/note. | `client/src/components/marketplace/concierge-card.tsx:79-113`; `client/src/pages/expert/inbox.tsx:1307-1343` |
| MATCH | Existing suggestion persistence/approval machinery is present for the Suggest → approve flow. | `server/services/booking-actions.service.ts:755-803` |
| ALREADY-RULED | Screen 4, Slip logistics provider rendering, and earn-token re-theming are explicitly excluded or documented state. | Brief lines 5, 26, 30 and “Known divergences / notes” |

## Follow-up candidates

None.
