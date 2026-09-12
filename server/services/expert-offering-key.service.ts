/**
 * THE LISTING'S EXPERT-OFFERING KEY — admission, in ONE implementation with two callers.
 *
 * Ledger `2026-09-12-listing-names-its-expert-offering` (migration 292; punchlist D-13 answered,
 * V-12 closed). CLAUDE.md §19 (allowlist admission), §13 (a refusal is a sentence), §18 rule 1.
 *
 * WHAT IT IS. `POST` and `PATCH /api/provider/services` both admit
 * `provider_services.expert_offering_type_key` through the pick-based
 * `providerServiceExpertOfferingSchema` (§19 — the generic body schema `.omit()`s the column, so
 * nothing else on either rail can set it). This module is the ONE reading of that field off a
 * request body and the ONE check that the key names a row the catalog actually carries. Two
 * copies of an admission decision is the derivation-drift class §18 rule 1 names.
 *
 * WHY A CHECK AT ALL WHEN THE FK IS THE CONSTRAINT. The ruling is explicit that the FK is the
 * value-set constraint — no enum is restated anywhere, so a key seeded by a later migration works
 * with no code change. This read hits THAT SAME TABLE; it is not a second authority, it is the
 * difference between a seller being told "that offering type no longer exists" and the rail
 * throwing a foreign-key 500 at them (§13: a refusal is a sentence).
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK, and the bound is stated because green means
 * green-within-stated-bounds (§18d):
 *   · **`is_active` is NOT consulted.** The FK admits any catalog row, and deciding that a
 *     deactivated offering may not be named is a catalog-lifecycle ruling nobody has made.
 *   · **The OWNER'S ROLE is NOT consulted.** The decision-maker ruled there is no role gate: any
 *     owner may name any key the expert catalog carries. Naming an offering type says WHAT IS
 *     SOLD, never WHO THE SELLER IS — it is not a credential, it grants nothing, and LD 27's
 *     verification machinery is untouched by it.
 *   · **A STORED DISAGREEMENT IS NOT REPAIRED HERE.** A PATCH naming the key, against a row whose
 *     legacy `expert_offering_type_id` points elsewhere, leaves that older column exactly as it
 *     found it. The relationship between the two is now RULED — the key is canonical, the id is
 *     dropped in lane 2 (ledger `2026-09-12-offering-key-is-canonical`) — and migration 293 copies
 *     the id onto an EMPTY key only, so this rail neither creates a disagreement nor resolves one.
 */
import { eq } from "drizzle-orm";

import { db } from "../db";
import { expertOfferingTypes, providerServiceExpertOfferingSchema } from "@shared/schema";

export interface ExpertOfferingKeyRefusal {
  status: number;
  body: { message: string; code: "UNKNOWN_EXPERT_OFFERING_TYPE"; offeringTypeKey: string };
}

export interface ExpertOfferingKeyAdmission {
  /** `false` = the body never mentioned the field; the caller must leave the column alone. */
  present: boolean;
  /** The key to write. `null` = an explicit clear (back to unclassified, an honest state). */
  key: string | null;
  refusal: ExpertOfferingKeyRefusal | null;
}

const ABSENT: ExpertOfferingKeyAdmission = { present: false, key: null, refusal: null };

/**
 * Read the field off a request body through the §19 allowlist, and resolve it against the catalog.
 *
 * KEY-PRESENCE, not `??`: an explicit `null` is a CLEAR and is a different fact from an absent
 * key, which means "this write is not about the offering" (the `itineraryItemEventLinkSchema`
 * convention, LD 29).
 *
 * THE SAME-BODY CONTRADICTION CHECK IS GONE, and its subject with it (ledger
 * `2026-09-12-offering-key-is-canonical`). It compared a body's `expertOfferingTypeKey` against the
 * legacy `expertOfferingTypeId` beside it and refused a body naming two different offerings. That
 * body can no longer be authored: the key is CANONICAL and the id is read-only legacy — omitted
 * from `insertProviderServiceSchema`, written by no rail and by no surface — so there is no second
 * half for a body to contradict. A pin that passes because its subject no longer exists is worse
 * than no pin (the `2026-09-12-delete-dead-transport-status` posture), and so is a refusal.
 */
export async function admitExpertOfferingTypeKey(
  body: unknown,
): Promise<ExpertOfferingKeyAdmission> {
  if (!body || typeof body !== "object") return ABSENT;
  if (!Object.prototype.hasOwnProperty.call(body, "expertOfferingTypeKey")) return ABSENT;

  const parsed = providerServiceExpertOfferingSchema.safeParse(body);
  if (!parsed.success) {
    return {
      present: true,
      key: null,
      refusal: {
        status: 400,
        body: {
          message:
            "That offering type isn't one we recognise. Pick one from the list, or leave it unset.",
          code: "UNKNOWN_EXPERT_OFFERING_TYPE",
          offeringTypeKey: String((body as Record<string, unknown>).expertOfferingTypeKey ?? ""),
        },
      },
    };
  }

  const key = parsed.data.expertOfferingTypeKey ?? null;
  // An explicit clear needs no catalog lookup: unclassified is an honest state (§13).
  if (key === null) return { present: true, key: null, refusal: null };

  const [row] = await db
    .select({ id: expertOfferingTypes.id, key: expertOfferingTypes.offeringTypeKey })
    .from(expertOfferingTypes)
    .where(eq(expertOfferingTypes.offeringTypeKey, key));

  if (!row) {
    return {
      present: true,
      key: null,
      refusal: {
        status: 400,
        body: {
          message:
            "That offering type isn't in the catalog any more. Pick one from the list, or leave it unset.",
          code: "UNKNOWN_EXPERT_OFFERING_TYPE",
          offeringTypeKey: key,
        },
      },
    };
  }

  return { present: true, key: row.key, refusal: null };
}
