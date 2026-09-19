/**
 * E1 (cosmetic-public-surfaces dispatch, `docs/briefs/COSMETIC_PUBLIC_SURFACES_DISPATCH.md`) —
 * ONE humanizer for the canonical `deliveryMethodEnum` (`shared/schema.ts` — `pdf`, `video`,
 * `call`, `in_person`, `voice_notes`, `async_messaging`, `hybrid`; CLAUDE.md ruling 2, the
 * "delivery-method vocabulary = the 7"). Discover's service card fell back to
 * `service.deliveryMethod` verbatim when a listing had no category, so the raw enum token
 * ("in_person", "pdf") rendered as the visible "service type" text.
 *
 * The same wording already exists twice, independently, on the earner-facing catalog surfaces
 * (`storefront.tsx` `DELIVERY_LABELS`, `provider/services.tsx` `PREVIEW_DELIVERY_LABELS`) —
 * this module is NOT a third hand-copied map: it is the one place a NEW caller (Discover) reads
 * the canonical wording from, so a fourth copy is never written for a fourth surface. The two
 * existing page-local maps are unchanged by this lane (out of scope for E1's fix).
 *
 * §13: `null`/unknown input returns `null` — never a guessed label. No data backfill: a listing
 * with an unrecognized or absent method still renders honestly (the caller's own fallback runs).
 *
 * Run: npx tsx --test client/src/lib/__tests__/delivery-method-label.test.ts
 */
import { deliveryMethodEnum } from "@shared/schema";

const DELIVERY_METHOD_LABELS: Record<(typeof deliveryMethodEnum)[number], string> = {
  pdf: "PDF guide",
  video: "Video call",
  call: "Phone call",
  in_person: "In-person",
  voice_notes: "Voice notes",
  async_messaging: "Messaging",
  hybrid: "Hybrid",
};

/** Humanizes one canonical delivery-method token, or `null` for anything not in the enum
 *  (including a stray legacy value) — the caller's own fallback then decides what to show. */
export function deliveryMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  return DELIVERY_METHOD_LABELS[method as (typeof deliveryMethodEnum)[number]] ?? null;
}
