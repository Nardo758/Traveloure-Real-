# Audit report — Storefront Discovery

**Execution date:** 2026-08-30

## Authority and scope

The brief's Aug 22–23 ledger rulings govern its original scope, with the later `2026-08-25-card-source-link` ruling governing current card source placement and paths. This report audits checklist mounts, server-derived handle eligibility, honest source links, partner-card restrictions, storefront routes, and directory status. The mock's rejected explicit-row redesign and Variant-like authoring annotations are not repair targets; the storefront directory is parked by the brief's threshold rule.

## Checks performed

- Inspected both dashboard mounts and the checklist's business-setup query/handle step.
- Inspected current Discover source-row branches and partner/curated rendering.
- Inspected SPA routes for `/s/:handle`, legacy `/p/:handle`, and `/providers`.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | SetupChecklistCard is mounted on both expert and provider dashboards and reads server-derived setup state. | `client/src/pages/expert/today.tsx:27,596`; `client/src/pages/provider/dashboard.tsx:26,412`; `client/src/components/backoffice/SetupChecklistCard.tsx:45-53,67-75` |
| MATCH | Current later ruling's source-row rule is claimed handle → `/s/:handle`, unclaimed provider → `/providers`, and no source → plain span. | `client/src/pages/discover.tsx:374-383,467-487` |
| MATCH | Partner catalog activities are separately labeled and rendered without provider storefront props/affordance. | `client/src/pages/discover.tsx:1600-1635`; partner/affiliate CTA safeguards in `client/src/components/curated-content-section.tsx:319-321,377-386` |
| ALREADY-RULED | The mock's explicit “More from” placement was rejected, and the later card-source ruling supersedes the old overlay-vs-row question. | Brief Known divergences; source-row comment `client/src/pages/discover.tsx:374-375` |
| STALE-MOCK | `/p/:handle` is retained as a legacy-compatible SPA entry while `/s/:handle` is canonical. | `client/src/App.tsx:414-418` |
| INCONCLUSIVE | Static inspection does not prove every visual state, mobile checklist rendering, or all handler/href/testid identity; runtime checks were not run. | Audit commands were static grep/inspection only |

## Follow-up candidates

None. The path naming drift and old placement are state to surface, not implementation gaps under this brief.
