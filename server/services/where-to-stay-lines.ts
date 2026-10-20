/**
 * Pure (no db). R-x's neighbourhood line, split out of `where-to-stay.service.ts` so the CS-1 item 2 live rule is
 * provable without a database (ledger `2026-10-19-cs1-live-facts`). The caller passes the ranker
 * (`rankFactsByOrigin`, the one ranker), which lives beside the db.
 */
import { isFactLive } from "@shared/content-facts";

/** The fields this line reads from a fact row (the caller passes its own rows; this module reads no table). */
type FactRow = { placeRef: string; value: unknown; origin: string | null; expiresAt: Date | string | null; supersededBy: string | null };

/**
 * Each ranked neighbourhood's line from the rows read: live facts only (`isFactLive`), best origin first, else the
 * spine's description, else nothing (§13).
 */
export function neighbourhoodLinesFrom<F extends FactRow>(
  ranked: ReadonlyArray<{ slug: string; name: string }>,
  spine: ReadonlyArray<{ slug: string; description: string | null }>,
  rows: ReadonlyArray<F>,
  rank: (rows: F[]) => F[],
  now: Date = new Date(),
): Map<string, { text: string; source: "registry" | "spine" }> {
  const out = new Map<string, { text: string; source: "registry" | "spine" }>();
  const live = rows.filter((f) => isFactLive(f, now));
  for (const r of ranked) {
    const mine = live.filter((f) => [r.slug.toLowerCase(), r.name.toLowerCase()].includes(f.placeRef.toLowerCase()));
    const best = rank(mine)[0];
    const text = typeof (best?.value as any)?.text === "string" ? ((best!.value as any).text as string).trim() : "";
    if (text) {
      out.set(r.slug, { text, source: "registry" });
      continue;
    }
    const d = spine.find((n) => n.slug === r.slug)?.description?.trim();
    if (d) out.set(r.slug, { text: d, source: "spine" });
  }
  return out;
}
