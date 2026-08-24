/**
 * Marketplace content-gate (CLAUDE.md §10 Phase B): `itineraryData` IS the paid product —
 * the full day-by-day content must never appear on a public read, or the product is free and
 * the purchase is decorative. Public reads get a TEASER (`itineraryPreview`: day number +
 * title only); the full content is returned only to a completed purchaser, the owner, or an
 * admin (owner console and /api/my-purchased-templates return the full row).
 *
 * Shared by every public template read: the expert-templates feed/detail (server/routes.ts)
 * and the unified discovery search (server/routes/content.routes.ts — the MOUNTED /api/discover;
 * the routes.ts copy is shadowed by mount order). Keep them on this one helper so the next
 * public read can't forget the gate.
 */
export const redactTemplateContent = (template: any) => {
  if (!template) return template;
  const days: any[] = Array.isArray(template.itineraryData?.days) ? template.itineraryData.days : [];
  const { itineraryData: _fullContent, ...publicFields } = template;
  return {
    ...publicFields,
    itineraryPreview: days.map((d: any) => ({ day: d?.day, title: d?.title ?? null })),
  };
};
