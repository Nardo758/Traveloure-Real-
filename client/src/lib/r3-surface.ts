/**
 * R3 planning surface switch (Leon, Nov 22 2026): `?surface=r3` renders the Revision 3 screen, and ONLY when the build
 * carries the staging flag (VITE_R3_SURFACE=1). Default off - production and every other environment keep the old page,
 * and the query parameter alone never switches anything.
 *
 * Pure, so the rule is testable without a browser: the flag is passed in, the search string is passed in.
 */
export function r3SurfaceOn(search: string, flag: string | undefined = (import.meta as any).env?.VITE_R3_SURFACE): boolean {
  if (flag !== "1") return false;
  const q = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(q).get("surface") === "r3";
}
