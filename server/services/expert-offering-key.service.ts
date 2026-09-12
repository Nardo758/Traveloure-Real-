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
 *   · **It checks THIS BODY only.** The id/key pair check below compares the two fields of the
 *     request in front of it. A PATCH that names only the key, against a row whose legacy
 *     `expert_offering_type_id` points elsewhere, leaves that stored disagreement alone — the two
 *     columns' long-term relationship is unruled and recorded in the ledger row, not decided here.
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
 * `expertOfferingTypeIdInBody` lets a create/update that names BOTH halves of the same choice be
 * refused when they disagree — the authoring surface writes both from the one row the seller
 * picked, so a body in which they differ is not a state any UI produces.
 */
export async function admitExpertOfferingTypeKey(
  body: unknown,
  opts: { expertOfferingTypeIdInBody?: unknown } = {},
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

  const idInBody = opts.expertOfferingTypeIdInBody;
  if (typeof idInBody === "string" && idInBody.length > 0 && idInBody !== row.id) {
    return {
      present: true,
      key: null,
      refusal: {
        status: 400,
        body: {
          message:
            "This listing names two different expert offerings. Pick one offering and save again.",
          code: "UNKNOWN_EXPERT_OFFERING_TYPE",
          offeringTypeKey: key,
        },
      },
    };
  }

  return { present: true, key: row.key, refusal: null };
}
