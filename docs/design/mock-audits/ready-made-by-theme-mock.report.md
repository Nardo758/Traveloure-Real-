# Audit report — Ready-Made by Theme

**Execution date:** 2026-08-30

## Authority and scope

The brief's merged Aug 22–23 ledger rulings govern over merged code and mock pixels. This report covers the closed plan-type vocabulary, server validation/read gate, live theme shelves and counts, shared labels, custom themes, and detail-page formatting. Buy/clone/refund, pricing modes, Itinerary Templates, and admin review are explicitly unchanged and excluded. The absence of a standalone `ready-made.tsx` browse page is not a defect.

## Checks performed

- Inspected the shared vocabulary and `planTypeDisplay`.
- Inspected ready-made query validation, custom-label handling, and approved+active predicates.
- Inspected Discover grouping/filter/shelf rendering and detail-page label/format resolution.
- Inspected no-handle author-link behavior.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Shared closed vocabulary and one shared display implementation are present. | `shared/ready-made-plan-types.ts:54-73`; imports/calls at `client/src/pages/discover.tsx:96,206` and `client/src/pages/ready-made-detail.tsx:51,335` |
| MATCH | Unknown `planType` returns 400, custom labels are constrained/normalized, and filters are ANDed with approved+active. | `server/routes/ready-made.routes.ts:958-996,1018-1030` |
| MATCH | Shelves are built from live feed rows in feed order; chips and counts appear only for present groups; See-all and clear/filter UI exist. | `client/src/pages/discover.tsx:938-967,1654-1702,1716-1726,1758-1768` |
| MATCH | Custom free text is display/filter metadata while the server plan key remains `custom`; detail uses the shared resolver/registry path. | `client/src/pages/discover.tsx:915-933`; `server/routes/ready-made.routes.ts:976-996`; `client/src/pages/ready-made-detail.tsx:283-287,335` |
| DIVERGENCE | For a Ready-Made author without a claimed handle, the current card links to `/experts/:id`; the brief's behavior 5 requires plain text rather than a dead storefront link. | `client/src/pages/discover.tsx:169-170,217` (`sourceHref` fallback and author `Link`) |
| ALREADY-RULED | Browse shelves living in `discover.tsx` rather than a dedicated ready-made page is explicitly documented as non-defective. | Brief scope; `client/src/pages/discover.tsx:905-908` |

## Follow-up candidates

- Resolve the no-handle Ready-Made author treatment against the applicable ruling; if the Aug behavior remains authoritative, render plain text rather than an `/experts/:id` link.
