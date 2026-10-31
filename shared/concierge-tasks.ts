/**
 * Concierge task kinds (CN-1a listing fields).
 *
 * A concierge may book experiences, meals, admissions, entry and errands.
 * Stays and transport are links only. That split is this module's one
 * derivation: a kind is link-only when its domain is stays or transport, or
 * when its key is the seeded `stays` or `transport` row. No second copy of
 * the rule belongs on a listing row.
 *
 * `per_trip` is a pricing_unit spelling, stored on the existing column.
 */
import { z } from "zod";

export const CONCIERGE_TASK_DOMAINS = [
  "experiences",
  "meals",
  "admissions",
  "entry",
  "errands",
  "stays",
  "transport",
] as const;

export type ConciergeTaskDomain = (typeof CONCIERGE_TASK_DOMAINS)[number];

export const CONCIERGE_LINK_ONLY_DOMAINS = ["stays", "transport"] as const;

/** Seeded keys that stay link-only even if a later edit moves their domain. */
export const CONCIERGE_LINK_ONLY_KEYS = ["stays", "transport"] as const;

export const PER_TRIP_PRICING_UNIT = "per_trip";

const LINK_ONLY_DOMAINS = new Set<string>(CONCIERGE_LINK_ONLY_DOMAINS);
const LINK_ONLY_KEYS = new Set<string>(CONCIERGE_LINK_ONLY_KEYS);

export function isConciergeLinkOnly(kind: { id: string; domain: string }): boolean {
  return LINK_ONLY_DOMAINS.has(kind.domain) || LINK_ONLY_KEYS.has(kind.id);
}

export const conciergeTaskPickSchema = z
  .object({
    taskKindKey: z.string().trim().min(1).max(80),
    cap: z.number().int().positive().nullable().optional(),
    bookable: z.boolean().optional(),
  })
  .strict();

export const conciergeTaskPicksSchema = z.array(conciergeTaskPickSchema).max(20);

export const conciergeTaskKindCreateSchema = z
  .object({
    taskKey: z.string().trim().regex(/^[a-z][a-z0-9_]{0,79}$/),
    label: z.string().trim().min(1).max(120),
    domain: z.enum(CONCIERGE_TASK_DOMAINS),
    bookable: z.boolean().optional(),
    active: z.boolean().nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000).nullable().optional(),
  })
  .strict();

export const conciergeTaskKindPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    domain: z.enum(CONCIERGE_TASK_DOMAINS).optional(),
    bookable: z.boolean().optional(),
    active: z.boolean().nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000).nullable().optional(),
  })
  .strict();
