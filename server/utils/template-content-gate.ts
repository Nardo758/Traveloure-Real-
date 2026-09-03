/**
 * Marketplace content-gate (CLAUDE.md §10 Phase B): `itineraryData` IS the paid product —
 * the full day-by-day content must never appear on a public read, or the product is free and
 * the purchase is decorative. Public reads get a TEASER (`itineraryPreview`: day number +
 * title only); the full content is returned only to a completed purchaser, the owner, or an
 * admin (owner console and /api/my-purchased-templates return the full row).
 *
 * ⚠️ NO CALLERS REMAIN. Its two readers — the expert-templates feed/detail (server/routes.ts)
 * and the unified discovery search (server/routes/content.routes.ts) — retired with the
 * `expert_templates` lane (ledger 2026-09-03-expert-templates-consumer-sunset). The file is kept
 * because it is the codebase's NAMED teaser-redaction precedent: `shared/trip-plan.ts` and
 * `server/services/trip-plan.service.ts` both describe their `teaser` channel as "the §10
 * `redactTemplateContent` posture". Do NOT wire it back onto `expert_templates`; do reuse the
 * shape when a new paid-content read needs a public teaser.
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
