/**
 * pricing-fees.ts — Wave 2 / lane S4 ("money out of creation"), ledger row 99.
 *
 * Pure hydrate/derive logic for the post-creation "Pricing & fees" drawer
 * (`client/src/components/provider/pricing-fees-drawer.tsx`), split out for the same reason
 * `service-form-required.ts` is its own module: a transform a unit test can hold to a fixed shape,
 * not prose buried in a 4,000-line component.
 *
 * WHAT MOVED HERE (ledger row 99): travel-surcharge mode + amounts — all four modes, including the
 * zones ring editor (B1 / ruling 81) — deposit / partial-payment config (Lane 7, ruling 72), and
 * the cancellation policy (type + free-text details). Previously authored on `ServiceForm.tsx`'s
 * "Getting there" and "Booking Terms" wizard cards; now edited ONLY here, post-creation. Verified
 * before the move: none of the three is in `service-form-required.ts`'s `buildRequiredItems`, so
 * the required-for-final set (and the derived listing-home checklist built from it) is untouched by
 * this lane — there was no checklist row to redirect.
 *
 * NOT MOVED: base price (creation step 1) and the map's service-radius geometry — `serviceRadius`
 * stays on the wizard's "Getting there" → Pickup block and keeps driving the ring
 * `ServiceMapAuthoring` draws on step 4 ("Logistics"). It is a coverage/location field, not a
 * surcharge amount, so it was never in scope to move.
 *
 * WRITES THROUGH THE EXISTING RAILS ONLY (§19 allowlist posture — no new endpoint, no schema
 * change): `buildPricingFeesPatch`'s output is sent to `PATCH /api/provider/services/:id`, the same
 * `insertProviderServiceSchema.partial()` body the wizard's own save already sent for every one of
 * these fields (verified against `shared/schema.ts`'s `.extend()` block — none is omitted, none is
 * rate-bearing). `buildSurchargeTiersPayload`'s output goes to the existing owner-gated child-row
 * replace-list `PUT /api/provider/services/:id/surcharge-tiers` (ruling 81/B1's own rail,
 * unchanged), zones mode only. Nothing here is a commission split or fee band (§18) —
 * `revenueShareRate` is never read or produced by this module.
 */

export type SurchargeMode = "" | "none" | "flat" | "zones" | "per_km";
export type DepositType = "" | "percentage" | "flat";

export interface SurchargeTierDraft {
  radiusKm: string;
  fee: string;
}

export interface PricingFeesState {
  surchargeMode: SurchargeMode;
  surchargeFlatAmount: string;
  surchargePerKm: string;
  surchargeMaxKm: string;
  surchargeTiers: SurchargeTierDraft[];
  depositEnabled: boolean;
  depositType: DepositType;
  depositPercentage: string;
  depositFlatAmount: string;
  cancellationPolicyType: string;
  cancellationPolicy: string;
}

/**
 * X1 (§13 hardcoded-copy arm): structured cancellation-policy TYPE vocabulary — mirrors
 * `shared/schema.ts`'s `cancellationPolicyTypeEnum` and the server's `refundPercentFor` windows.
 * This is now the SOLE copy of this list in the client (the wizard's own copy in `ServiceForm.tsx`
 * moved here with the control it fed — moved, not duplicated). Keep in step with
 * `refundPercentFor` / `shared/schema.ts` if any of them changes.
 */
export const CANCELLATION_POLICY_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "flexible", label: "Flexible — full refund if cancelled at least 24 hours before the start" },
  { value: "moderate", label: "Moderate — full refund 5+ days before the start; 50% refund 2+ days before" },
  { value: "strict", label: "Strict — 50% refund if cancelled at least 7 days before the start" },
  { value: "non_refundable", label: "Non-refundable — no refund once booked" },
];

export function emptyPricingFeesState(): PricingFeesState {
  return {
    surchargeMode: "none",
    surchargeFlatAmount: "",
    surchargePerKm: "",
    surchargeMaxKm: "",
    surchargeTiers: [],
    depositEnabled: false,
    depositType: "",
    depositPercentage: "",
    depositFlatAmount: "",
    cancellationPolicyType: "",
    cancellationPolicy: "",
  };
}

/**
 * Hydrate from the fetched service row + its child-row tiers. Mirrors `ServiceForm.tsx`'s own
 * `mapServiceToForm` slice for these exact fields (same nullish-coalescing-to-`""` posture), so a
 * value round-trips identically whichever surface last read it.
 */
export function pricingFeesFromService(
  service: Record<string, unknown> | null | undefined,
  tiers: ReadonlyArray<{ radiusKm: unknown; fee: unknown }> | null | undefined,
): PricingFeesState {
  const s = (service ?? {}) as Record<string, any>;
  const mode = s.surchargeMode;
  return {
    surchargeMode: (["none", "flat", "zones", "per_km"].includes(mode) ? mode : "none") as SurchargeMode,
    surchargeFlatAmount: s.surchargeFlatAmount == null ? "" : String(s.surchargeFlatAmount),
    surchargePerKm: s.surchargePerKm == null ? "" : String(s.surchargePerKm),
    surchargeMaxKm: s.surchargeMaxKm == null ? "" : String(s.surchargeMaxKm),
    surchargeTiers: Array.isArray(tiers)
      ? tiers.map((t) => ({ radiusKm: String(t.radiusKm ?? ""), fee: String(t.fee ?? "") }))
      : [],
    depositEnabled: !!s.depositEnabled,
    depositType: (s.depositType === "percentage" || s.depositType === "flat") ? s.depositType : "",
    depositPercentage: s.depositPercentage == null ? "" : String(s.depositPercentage),
    depositFlatAmount: s.depositFlatAmount == null ? "" : String(s.depositFlatAmount),
    cancellationPolicyType: s.cancellationPolicyType || "",
    cancellationPolicy: s.cancellationPolicy || "",
  };
}

/** "" → null (never captured / cleared). A non-numeric entry is also null, never a fabricated 0 —
 *  the same rule `ServiceForm.tsx`'s own `intOrNull` uses for the identical field. */
const intOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * The PATCH body for `PATCH /api/provider/services/:id` — the money-adjacent fields only, built
 * the same way `ServiceForm`'s own save mutation already built them (identical null-vs-value
 * posture), so a save from the drawer and a save from the old wizard controls produce
 * byte-identical payloads for the same input. Never includes `surchargeTiers` — those are child
 * rows, written separately via `buildSurchargeTiersPayload` on their own PUT rail (ruling 81/B1).
 * Never includes `price` — the drawer shows it read-only and never edits it (see module doc).
 */
export function buildPricingFeesPatch(state: PricingFeesState): Record<string, unknown> {
  return {
    surchargeMode: state.surchargeMode || "none",
    surchargeFlatAmount: state.surchargeFlatAmount.trim() === "" ? null : state.surchargeFlatAmount.trim(),
    surchargePerKm: state.surchargePerKm.trim() === "" ? null : state.surchargePerKm.trim(),
    surchargeMaxKm: intOrNull(state.surchargeMaxKm),
    depositEnabled: state.depositEnabled,
    depositType: state.depositEnabled ? (state.depositType || null) : null,
    depositPercentage:
      state.depositEnabled && state.depositType === "percentage" && state.depositPercentage.trim() !== ""
        ? (parseInt(state.depositPercentage, 10) || null)
        : null,
    depositFlatAmount:
      state.depositEnabled && state.depositType === "flat" && state.depositFlatAmount.trim() !== ""
        ? state.depositFlatAmount.trim()
        : null,
    cancellationPolicyType: state.cancellationPolicyType || null,
    cancellationPolicy: state.cancellationPolicy || null,
  };
}

/**
 * The zones-mode child-row replace-list body for `PUT .../surcharge-tiers` — only ever sent when
 * `surchargeMode === "zones"` (mirroring the wizard's own gate exactly). Blank rows (either side
 * empty) are dropped rather than saved as a half-answered ring.
 */
export function buildSurchargeTiersPayload(
  tiers: ReadonlyArray<SurchargeTierDraft>,
): { tiers: Array<{ radiusKm: string; fee: string }> } {
  return {
    tiers: tiers
      .filter((t) => t.radiusKm.trim() !== "" && t.fee.trim() !== "")
      .map((t) => ({ radiusKm: t.radiusKm.trim(), fee: t.fee.trim() })),
  };
}

/**
 * A short, honest one-line summary for the listing-home card — never a fabricated number, only
 * what is actually configured. Mirrors the ratified mock's own `pricingSummary()`.
 */
export function pricingFeesSummary(
  state: PricingFeesState,
  opts: { surchargeApplicable: boolean },
): string {
  const bits: string[] = [];
  if (!opts.surchargeApplicable) {
    bits.push("no travel surcharge (not applicable to this listing)");
  } else if (state.surchargeMode === "flat") {
    bits.push(`travel: flat $${state.surchargeFlatAmount || "0"} beyond the free radius`);
  } else if (state.surchargeMode === "per_km") {
    bits.push(`travel: $${state.surchargePerKm || "0"}/km beyond the free radius`);
  } else if (state.surchargeMode === "zones") {
    bits.push(`travel: ${state.surchargeTiers.length} zone ring${state.surchargeTiers.length === 1 ? "" : "s"}`);
  } else {
    bits.push("no travel surcharge");
  }
  bits.push(
    state.depositEnabled
      ? `deposit ${state.depositType === "flat" ? `$${state.depositFlatAmount || "0"}` : `${state.depositPercentage || "0"}%`} at booking`
      : "no deposit",
  );
  bits.push(
    state.cancellationPolicyType
      ? `cancellation: ${CANCELLATION_POLICY_TYPE_OPTIONS.find((o) => o.value === state.cancellationPolicyType)?.label.split(" — ")[0] ?? state.cancellationPolicyType}`
      : "no cancellation policy set",
  );
  return bits.join(" · ") + ".";
}
