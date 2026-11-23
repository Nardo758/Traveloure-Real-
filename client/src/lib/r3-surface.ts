/**
 * R3 planning surface switch (Leon, Nov 22 2026) - RUNTIME, not build-time.
 *
 * The server reads `R3_SURFACE=1` from its own env and answers `GET /api/public/r3-surface` (`{ on: boolean }`); this
 * module reads that answer once per page and combines it with `?surface=r3`. Production has no `R3_SURFACE`, so the
 * flag is false and the query parameter alone changes nothing.
 *
 * The pure part takes the flag as an argument, so the rule is testable without a browser or a server.
 */
import { useEffect, useState } from "react";

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

/** The flag for this page; false until the one read answers. */
export function useR3SurfaceOn(search: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    readR3SurfaceFlag().then((flag) => {
      if (live) setOn(flag);
    });
    return () => {
      live = false;
    };
  }, []);
  return r3SurfaceOn(search, on);
}

/**
 * The plan's stops, read the way `SlipView` reads them (`client/src/components/plancard/SlipView.tsx:1767`):
 * `data.days[].activities`. NOT `data.items` / `data.activities` - the plancard's day rows are the authority for what is
 * on a day, and the board's footer counts, stay check and flight check all read this one list.
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
