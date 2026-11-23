/**
 * R3 planning surface - the switch and the plan reads, as small pure pieces.
 *
 * RUNTIME, not build-time (Leon, Nov 22 2026): the server reads `R3_SURFACE=1` from its own env and answers
 * `GET /api/public/r3-surface` with `{ on: boolean }`. Production has no `R3_SURFACE`, so the flag is false and
 * `?surface=r3` alone changes nothing.
 *
 * NO REQUEST WITHOUT THE PARAMETER (Leon, Nov 23 2026): a page whose URL does not ask for `?surface=r3` never fetches
 * the flag at all, so every other plan load behaves exactly as it did before R3 existed - same requests, same timing.
 */
import { useEffect, useState } from "react";
import { daysMapStops } from "@/lib/days-map";
import { buildMapScene } from "@/lib/map-scene";

/** The rule: the flag must be on AND the URL must ask for it. */
export function r3SurfaceOn(search: string, flag: boolean): boolean {
  if (flag !== true) return false;
  const q = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(q).get("surface") === "r3";
}

let cached: Promise<boolean> | null = null;

/** One read per page load; any failure is a NO (fail closed - never switch a surface on because a fetch broke). */
export function readR3SurfaceFlag(): Promise<boolean> {
  if (!cached) {
    cached = fetch("/api/public/r3-surface", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { on: false }))
      .then((j: any) => j?.on === true)
      .catch(() => false);
  }
  return cached;
}

/**
 * The flag for this page; false until the one read answers. A URL that does not ask for `?surface=r3` makes NO request.
 */
export function useR3SurfaceOn(search: string): boolean {
  const asked = r3SurfaceOn(search, true); // does the URL ask for it? (flag assumed on, for the question only)
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!asked) {
      setOn(false);
      return;
    }
    let live = true;
    readR3SurfaceFlag().then((flag) => {
      if (live) setOn(flag);
    });
    return () => {
      live = false;
    };
  }, [asked]);
  return asked && on;
}

/**
 * The plan's stops, read the way `SlipView` reads them (`client/src/components/plancard/SlipView.tsx:1767`):
 * `data.days[].activities`. NOT `data.items` / `data.activities` - the day rows are the authority for what is on a day,
 * and the board's footer counts, stay check and flight check all read this one list.
 */
export function r3Stops(data: any): any[] {
  const days = Array.isArray(data?.days) ? data.days : [];
  return days.flatMap((d: any) => (Array.isArray(d?.activities) ? d.activities : []));
}

/** Saved ideas: the plan's ideas list when the DTO carries one, else none (never a made-up number). */
export function r3IdeaCount(data: any): number {
  const ideas = (data as any)?.ideas;
  return Array.isArray(ideas) ? ideas.length : 0;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** One column per day, in the plan's own order, each holding the stops the day rows name for it. */
export function r3Columns(data: any): Array<{ day: number; label: string; stops: any[] }> {
  const days = Array.isArray(data?.days) ? data.days : [];
  return days.map((d: any, i: number) => {
    const day = Number(d?.dayNumber ?? i + 1);
    const raw = d?.date ?? d?.dayDate ?? null;
    const date = typeof raw === "string" && raw ? new Date(`${raw.slice(0, 10)}T00:00:00`) : null;
    const label = date && !Number.isNaN(date.getTime())
      ? `${WEEKDAY[date.getDay()]} \u00b7 ${date.getDate()} ${MONTH[date.getMonth()]}`
      : `Day ${day}`;
    return { day, label, stops: Array.isArray(d?.activities) ? d.activities : [] };
  });
}

/** The ideas column: what the plan holds outside every day. */
export function r3Ideas(data: any): any[] {
  const ideas = (data as any)?.ideas;
  if (Array.isArray(ideas)) return ideas;
  return [];
}

/**
 * The sidebar's starting state (Leon, Nov 23 2026): COLLAPSED on an R3 plan page, EXPANDED on every other page. A stored
 * choice for this traveler wins over both, so a manual toggle survives a reload. Pure, so the rule is testable without
 * a browser or a provider.
 */
export function sidebarStartsCollapsed(input: { r3Page: boolean; stored: boolean | null }): boolean {
  if (typeof input.stored === "boolean") return input.stored;
  return input.r3Page;
}

/** Per-traveler key, so two accounts on one browser do not share a sidebar state. */
export function sidebarStorageKey(userId: string | number | null | undefined): string {
  return `dsh.sidebar.collapsed.${userId ?? "anon"}`;
}

/**
 * "N of M stops on the map" (Leon, Nov 23 2026): N comes from the SAME predicate the map panel draws by - the scene's
 * own `located` flag (`DaysMapPanel.tsx:63`) - so the line can never claim more pins than the canvas shows. A stop with
 * no coordinates is counted in M and not in N.
 */
export function r3MapCounts(data: any): { located: number; total: number } {
  const days = Array.isArray(data?.days) ? data.days : [];
  const total = days.reduce((n: number, d: any) => n + (Array.isArray(d?.activities) ? d.activities.length : 0), 0);
  if (total === 0) return { located: 0, total: 0 };
  const scene = buildMapScene({
    dayNumber: null,
    planStops: daysMapStops(days as any, "all"),
    planAnchor: null,
    layers: { plan: true, nearby: false, ideas: false },
  } as any);
  const located = scene.list.filter((s: any) => s.located).length;
  return { located, total };
}
