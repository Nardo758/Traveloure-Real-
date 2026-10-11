/**
 * SS-1a — WHAT THE MARKET-LEVEL REFRESH FETCHES, per registry row (SS-1 ruling 2, Oct 10, 2026; ledger
 * `2026-10-10-ss1a-registry-entry-sheet`; shape and checks in `shared/content-source-targets.ts`).
 *
 * Keyed by `content_sources.id`. Config, not a column: no migration. An operator is one row with several
 * targets; a temple is one row with one target (content sourcing brief §9).
 *
 * EMPTY BY DESIGN until two things are true for a source: (1) Leon has typed its row in
 * `/admin/content-sources` and activated it (R251 — the terms check is his), and (2) each target url has
 * been read on the official site and its anchor is known — a station slug for last-service pages, a Google
 * `place_id` for a stop's page. Nothing here is guessed: an unread url or an unknown place id is not a
 * target. The proposed ids and pages are in docs/planning/ss-1-entry-sheet.md.
 *
 * A key the registry does not hold FAILS LOUDLY in the coverage report and the nightly census.
 */
import type { ContentSourceTargets } from "@shared/content-source-targets";

export const CONTENT_SOURCE_TARGETS: ContentSourceTargets = {};
