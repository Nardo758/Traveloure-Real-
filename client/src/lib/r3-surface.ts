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

/**
 * The flag for this page; false until the one read answers.
 *
 * NO REQUEST WITHOUT THE PARAMETER (Leon, Nov 23 2026): a page whose URL does not ask for `?surface=r3` never fetches
 * `/api/public/r3-surface` at all, so every other plan load behaves exactly as it did before R3 existed - same requests,
 * same timing. The fetch happens only for a URL that asks, and only once per page.
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
