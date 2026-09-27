/**
 * Locked Decision 56 — A LISTING'S PRICE BASIS: admission, in ONE implementation with two callers.
 *
 * Ledger `2026-09-25-price-basis`; migration 325. `POST` and `PATCH /api/provider/services` both
 * admit `provider_services.price_basis` through the pick-based, `.strict()`
 * `providerServicePriceBasisSchema` (§19 — the generic body schema `.omit()`s the column, so nothing
 * else on either rail can set it). This module is the ONE reading of the field off a request body
 * (§18 rule 1); it is the `admitDeclaredArtifactDeliverable` shape one column over, deliberately.
 *
 * KEY-PRESENCE, NOT `??`. An explicit `null` returns the listing to "never stated" (read as per
 * booking); an ABSENT key means "this write is not about the price basis" and leaves the column
 * exactly as it is, so an unrelated edit never flips how a listing is priced.
 *
 * INVALID VALUES ARE REFUSED, NEVER COERCED (§13). `per_head`, `"PER_PERSON "` or a number is a 400
 * naming the two answers — silently storing it, or silently reading it as per booking, would be a
 * pricing decision the provider never made.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK (§18d): the DELIVERY METHOD. The basis is inert outside
 * in_person / hybrid (`archetypeAsks` decides stays, bundles, per-day and artifacts first), so a
 * listing that changes method keeps its answer harmlessly rather than being refused a save. It is a
 * PRICING setting, so under CLAUDE.md §23 it is a SAFE edit — not in `IDENTITY_EDIT_FIELDS` — and
 * applies to an approved listing's live row immediately.
 */
import { providerServicePriceBasisSchema } from "@shared/schema";
import type { PriceBasis } from "@shared/price-basis";

export interface PriceBasisRefusal {
  status: number;
  body: { message: string; code: "INVALID_PRICE_BASIS" };
}

export interface PriceBasisAdmission {
  /** `false` = the body never mentioned the field; the caller must leave the column alone. */
  present: boolean;
  /** The value to write. `null` = back to "never stated" (read as per booking). */
  value: PriceBasis | null;
  refusal: PriceBasisRefusal | null;
}

const ABSENT: PriceBasisAdmission = { present: false, value: null, refusal: null };

export function admitPriceBasis(body: unknown): PriceBasisAdmission {
  if (!body || typeof body !== "object") return ABSENT;
  if (!Object.prototype.hasOwnProperty.call(body, "priceBasis")) return ABSENT;

  const parsed = providerServicePriceBasisSchema.safeParse({
    priceBasis: (body as Record<string, unknown>).priceBasis,
  });
  if (!parsed.success) {
    return {
      present: true,
      value: null,
      refusal: {
        status: 400,
        body: {
          message: "Say whether the price is per person (\"per_person\") or for the whole booking (\"per_booking\").",
          code: "INVALID_PRICE_BASIS",
        },
      },
    };
  }
  return { present: true, value: parsed.data.priceBasis, refusal: null };
}
