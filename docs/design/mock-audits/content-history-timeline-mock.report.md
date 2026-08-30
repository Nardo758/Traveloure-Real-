# Audit report — content-history-timeline-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

The provenance ledger and merged code govern over mock pixels. This report covers the dialog’s reader-only endpoint use, per-row mount, timeline ordering, change-type styles/fallback, §13 diff/actor rules, and loading/error/empty states. No new schema, write path, or endpoint is expected; visual browser confirmation was not performed.

## Checks performed

- Inspected query enablement and endpoint usage.
- Inspected change-type palette and unknown fallback.
- Inspected created-row diff suppression and actor guard.
- Inspected explicit render states, row mount, and server ordering.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Dialog fetches the existing GET only when open for a real tracking number; server endpoint is read-only and returns versions. | `client/src/components/admin/content-history-dialog.tsx:61-65`; `server/routes/admin.routes.ts:3683-3708` |
| MATCH | Four change-type styles are keyed by `changeType`; unknown types receive the plain outline fallback. | `client/src/components/admin/content-history-dialog.tsx:31-35,103-105` |
| MATCH | Created/v1 entries suppress the diff line and actor renders only for a real `changedBy`. | `client/src/components/admin/content-history-dialog.tsx:97,110-118` |
| MATCH | Loading, error, empty copy/testid, newest-first ordering, and per-row opening are explicit. | `client/src/components/admin/content-history-dialog.tsx:84-91`; `server/storage.ts:6440-6443`; `client/src/pages/admin/content-tracking.tsx:432-440,713-717` |

## Follow-up candidates

None.
