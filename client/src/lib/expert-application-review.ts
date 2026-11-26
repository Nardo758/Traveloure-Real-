/**
 * DX-1: the Review step's "Services Offered" list stores offering ids but must show names.
 * Pure so the mapping is unit-testable without a page.
 */
export type OfferingCategoryLike =
  | {
      offerings?: Array<{ id?: unknown; name?: unknown }> | null;
    }
  | null
  | undefined;

export function offeringNamesById(
  categories: readonly OfferingCategoryLike[] | null | undefined,
): Map<string, string> {
  const names = new Map<string, string>();
  if (!Array.isArray(categories)) return names;
  for (const category of categories) {
    const offerings = category?.offerings;
    if (!Array.isArray(offerings)) continue;
    for (const offering of offerings) {
      if (!offering || typeof offering.id !== "string" || offering.id.length === 0) continue;
      if (typeof offering.name !== "string") continue;
      const name = offering.name.trim();
      if (!name) continue;
      names.set(offering.id, name);
    }
  }
  return names;
}
