/**
 * PARTNER-1 (ledger `2026-11-03-gate1-partner1`; Leon: render NO partner text that hasn't been reviewed): the ONE rule
 * for the words a traveler reads about a partner row. The description is OUR OWN reviewed editorial text
 * (`editorial_description`, migration 432) and only once `editorial_reviewed_at` is set; the supplier's own
 * description, short description, highlights and raw payload are never published. No reviewed text ⇒ `null`,
 * and the reader omits the block (no placeholder).
 */
export interface EditorialFields {
  editorialDescription?: string | null;
  editorialReviewedAt?: Date | string | null;
}

/** Supplier text fields a partner row can carry; none of them reaches a traveler. */
export const SUPPLIER_TEXT_FIELDS = ["shortDescription", "highlights", "rawData"] as const;

function reviewedAt(v: Date | string | null | undefined): boolean {
  if (v == null) return false;
  const d = v instanceof Date ? v : new Date(v);
  return !Number.isNaN(d.getTime());
}

/** Our reviewed description, or null. */
export function reviewedEditorialDescription(row: EditorialFields | null | undefined): string | null {
  if (!row || !reviewedAt(row.editorialReviewedAt)) return null;
  const text = typeof row.editorialDescription === "string" ? row.editorialDescription.trim() : "";
  return text ? text : null;
}

type Stripped = (typeof SUPPLIER_TEXT_FIELDS)[number] | "editorialDescription" | "editorialReviewedAt" | "description";

/**
 * A partner cache row as a traveler may see it: `description` is the reviewed editorial text or null, and the supplier
 * text fields and the editorial bookkeeping are removed.
 */
export function toEditorialPartnerRow<T extends object>(row: T): Omit<T, Stripped> & { description: string | null } {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  const description = reviewedEditorialDescription(row as EditorialFields);
  for (const k of SUPPLIER_TEXT_FIELDS) delete out[k];
  delete out.editorialDescription;
  delete out.editorialReviewedAt;
  out.description = description;
  return out as Omit<T, Stripped> & { description: string | null };
}
