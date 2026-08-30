# Audit brief — Content History Timeline

**Mock:** `docs/design/content-history-timeline-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-23-provenance-move3`
**Status:** merged Aug 22–23 set — code shipped against this mock; ruling text > merged code > mock pixels on any disagreement.
**Live surfaces:**
- `client/src/components/admin/content-history-dialog.tsx` (exists)
- `client/src/pages/admin/content-tracking.tsx` (exists)
- Reads existing `GET /api/admin/content/:trackingNumber` (pre-existing endpoint, per ledger — not a new route)

## Behaviors the mock ratifies

1. The dialog is opened per-row from the admin content-tracking registry table (`content-tracking.tsx`), for one content row identified by its tracking number (e.g. `TRV-2026-08-KYT-0042`).
2. It fetches the EXISTING `GET /api/admin/content/:trackingNumber` endpoint and renders its `versions` array as a timeline — this is a pure reader; no new schema, no new write path, no new endpoint (L6 posture).
3. Four change-type badge styles keyed off `changeType`: `created` (green), `updated` (blue), `status_change` (amber, underscore rendered as a space — "status change"), `moderation` (violet). An unknown/unrecognized type falls back to a plain outline badge — never a crash, never a mislabeled badge.
4. §13 — a `created` (v1) row shows **no** "Changed:" diff line at all — a create has no previous snapshot to diff against, and the UI must never fabricate a "no changes" claim for it. The diff line renders only when a real changed-fields diff exists (derived from previousData↔newData).
5. §13 — the "by <actor>" line renders only when `changedBy` is a real id; no placeholder text, no guessed "system" actor when the field is null.
6. Three explicit render states beyond the populated timeline: loading, error ("Couldn't load history"), and empty ("No recorded changes yet." — `data-testid="text-no-history"`). The fetch fires only once the dialog opens for a real tracking number (not eagerly on every table row render).
7. Version numbers (`v1`, `v2`, `v3`, `v4`) and timestamps are shown per entry in reverse-chronological (newest-first) order, per the mock's rendering.

## Visual grammar

- Change-type badge hues MUST mirror `CHANGE_TYPE_STYLE` in `content-history-dialog.tsx` exactly — this mock states that intent explicitly in its own CSS comment (`/* change-type hues — mirror CHANGE_TYPE_STYLE in content-history-dialog.tsx exactly */`), so hue-per-type is a hard behavioral requirement here, not decoration.
- Vertical timeline: left border + dot markers (`.timeline`/`.tl-dot`), `--accent` colored dots, Instrument Sans body with JetBrains Mono for tracking number, actor id, and changed-field keys.
- `--accent` (deep travel-teal) used sparingly — dots, eyebrow, callout border — consistent with the User Console's "one bold hue" rule (CLAUDE.md Phase 4 palette).
- Card-on-ground: `.dialog` is `--surface` on `--ground` with `--shadow`/`--radius: 14px`, matching the plan-card mock's card treatment (shared design system).

## How to audit

1. Confirm the dialog is a pure reader with no new endpoint:
   `grep -n "api/admin/content" client/src/components/admin/content-history-dialog.tsx` — expect a GET to the existing `:trackingNumber` route, no POST/PATCH.
2. Confirm the four change-type badge styles exist and are keyed off `changeType`:
   `grep -n "CHANGE_TYPE_STYLE\|created\|updated\|status_change\|moderation" client/src/components/admin/content-history-dialog.tsx`
3. Confirm the v1-has-no-diff rule (§13):
   `grep -n "changedFields\|previousData\|newData\|changeType.*created" client/src/components/admin/content-history-dialog.tsx` — verify the diff-rendering branch is conditioned so a `created`/v1 entry does not render a changed-keys line.
4. Confirm the real-actor-only guard:
   `grep -n "changedBy" client/src/components/admin/content-history-dialog.tsx` — verify the "by …" line is conditionally rendered, not always-on with a fallback string like "system" or "unknown".
5. Confirm the empty-state testid:
   `grep -n "text-no-history\|No recorded changes" client/src/components/admin/content-history-dialog.tsx` — expect a match for the empty-state copy/testid.
6. Confirm loading/error states are both explicitly handled (not a bare spinner-forever or silent blank):
   `grep -n "isLoading\|isError\|Couldn't load" client/src/components/admin/content-history-dialog.tsx`
7. Confirm the mount point: `grep -n "ContentHistoryDialog" client/src/pages/admin/content-tracking.tsx` — expect it opened per-row, not globally mounted once for the whole table.
8. In the running app: open the admin content-tracking registry, click into a row's history for a row created via `registerContent` and never updated — confirm the v1 entry renders with no diff line and (if `changedBy` is null) no actor line.

## Known divergences / notes

None recorded. The mock states its own reader-only, zero-new-writes posture explicitly and the ledger confirms this: "Purely ADDITIVE — no schema, no write-path, no endpoint change; the data was already accumulating."
