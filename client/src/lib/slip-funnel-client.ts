/**
 * The client half of the slip funnel's two upgrade-path events (§3.14–3.15, ledger
 * `2026-10-18-teaser-copy-events`). Fire-and-forget on the ONE client rail
 * `POST /api/trips/:tripId/slip-events`; a view or a tap that fails to record never changes the page
 * (§15b). Ids and enums only — the body is the `.strict()` shape in `@shared/slip-funnel-events`.
 */
import { useEffect, useMemo, useRef } from "react";
import { localTeaserLine, type LocalTeaser } from "@shared/free-draft-cap";
import {
  LOCAL_TEASER_MAX_DAYS,
  SLIP_LOCAL_TEASER_SHOWN_EVENT,
  SLIP_ROUTED_LEGS_CTA_TAPPED_EVENT,
  type LocalTeaserSurface,
  type RoutedLegsCtaSurface,
} from "@shared/slip-funnel-events";

/** A random per-page id (doc §2, common properties) — never a session or cookie value. */
export function newSlipViewId(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `v${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function postSlipEvent(tripId: string, body: Record<string, unknown>): void {
  if (typeof fetch === "undefined") return;
  void fetch(`/api/trips/${encodeURIComponent(tripId)}/slip-events`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

/** Pure: how many days draw a local teaser (the same words test `DayBlock` uses), capped. */
export function teaserDayCount(days: ReadonlyArray<{ localTeaser?: LocalTeaser | null } | null | undefined>): number {
  const n = days.filter((d) => localTeaserLine(d?.localTeaser ?? null) != null).length;
  return Math.min(n, LOCAL_TEASER_MAX_DAYS);
}

/** Records `slip_local_teaser_shown` once per page view, when at least one day draws a teaser. */
export function useLocalTeaserShown(
  tripId: string | null | undefined,
  days: ReadonlyArray<{ localTeaser?: LocalTeaser | null } | null | undefined>,
  surface: LocalTeaserSurface,
  viewId: string,
): void {
  const sent = useRef(false);
  const count = useMemo(() => teaserDayCount(days), [days]);
  useEffect(() => {
    if (sent.current || !tripId || count < 1) return;
    sent.current = true;
    postSlipEvent(tripId, { type: SLIP_LOCAL_TEASER_SHOWN_EVENT, surface, teaserDays: count, viewId });
  }, [tripId, count, surface, viewId]);
}

/** Records `slip_routed_legs_cta_tapped` — the "Add drive and walk times" line was tapped. */
export function recordRoutedLegsCtaTap(tripId: string, surface: RoutedLegsCtaSurface, viewId: string): void {
  postSlipEvent(tripId, { type: SLIP_ROUTED_LEGS_CTA_TAPPED_EVENT, surface, viewId });
}
