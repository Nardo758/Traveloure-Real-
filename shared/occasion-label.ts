/**
 * R3-23 — ONE occasion label for a plan, read from `trips.occasion_slug` (A-35, migration 438)
 * against the catalog's `experience_types.name`. §18 rule 1: the plan header, the plan list and
 * `/api/trips` all read this, never a second lookup (the coarse event type, the plan's events).
 *
 * A-8 / §13: a NULL slug is "no occasion was picked" and stays NULL — never a default label. A
 * slug the catalog no longer carries is also NULL: an unknown slug is not displayed as a name.
 */
export function occasionLabelFromSlug(
  slug: string | null | undefined,
  namesBySlug: ReadonlyMap<string, string>,
): string | null {
  if (typeof slug !== "string" || !slug.trim()) return null;
  return namesBySlug.get(slug.trim()) ?? null;
}
