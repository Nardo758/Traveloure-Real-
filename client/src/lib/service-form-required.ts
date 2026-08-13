/**
 * FP-2 / Package A item 4 — THE REQUIRED-FIELD SET FOR THE SERVICE WIZARD'S FINAL ACTION.
 *
 * ── WHY THIS IS ITS OWN MODULE ────────────────────────────────────────────────────────────────
 * The rule this list has to keep is a two-way one: **the asterisk set equals the enforced set.**
 * The audit found it broken in both directions — asterisked fields that no client check ever
 * looked at (so a "required" field either failed on a server round-trip or never failed at all),
 * and enforced blocks wearing no asterisk (the attestation confirmations, which disabled the
 * button and explained themselves only in a `title` tooltip). A rule stated in prose inside a
 * 4,000-line component is a rule nothing can check, so the predicate moved out here where a test
 * can hold it to the server's actual gates.
 *
 * ── WHAT MAY GO IN THIS LIST ──────────────────────────────────────────────────────────────────
 * ONLY a requirement some other layer already enforces. Every entry below names the enforcement
 * it mirrors; this module is the ROUTING and EXPLANATION half (which step holds the field, what
 * to call it), never a new gate. In particular:
 *
 *   • `Service name` / `Category` / offering / tier — mirror the final button's own disabled
 *     conditions in ServiceForm.
 *   • `Meeting point` — mirrors the server's `MEETING_POINT_REQUIRED` publish gate.
 *   • `Deliverable file` — mirrors `DELIVERABLE_FILE_REQUIRED` (FP-1 / B7).
 *   • `Price` — mirrors `PRICE_REQUIRED`.
 *   • required category fields — mirror `category_field_schema.required`, which draws the
 *     asterisk the form has always shown.
 *   • the attestation confirmations — mirror the server's `ATTESTATION_GATE` 403.
 *
 * ── PROVIDER-ONLY ENTRIES ─────────────────────────────────────────────────────────────────────
 * The server's publish gates all key on `status:'active'`. A PROVIDER's final action sends
 * exactly that; an EXPERT's "Submit for Approval" sends `status:'draft'`, which those gates
 * deliberately exempt. So price and deliverable are provider-only here — mirroring the server,
 * not inventing a softer rule for experts (FP-1 / B7 set this precedent and it is kept).
 *
 * DRAFTS ARE NEVER CHECKED. Save Draft stays reachable from every step with nothing required,
 * exactly as before — this list is consulted only by the final submit. WAVE 2 / A1 makes that
 * promise load-bearing: the BASICS FAST PATH (name · offering · method · price · description on
 * step 1) is a resumable draft from one screen precisely because nothing in this module is
 * consulted on the way to it.
 *
 * ── WAVE 2 / A1: THE STEP NUMBER IS NOW DERIVED, NOT LITERAL ─────────────────────────────────
 * The wizard used to be four fixed steps for every listing, so a requirement could name its step
 * as the constant `2`. The flow now BRANCHES on the delivery method (3 steps for pdf/async/call,
 * 5 for in-person, 6 for hybrid), so a literal step number would point at the wrong screen — or
 * at no screen at all — the moment the method changed. Every entry therefore names the SECTION it
 * lives in, and `client/src/lib/service-form-steps.ts` resolves that to this branch's step number.
 * One placement authority, consulted by the form's renderer and by this list alike.
 */
import {
  stepForSection,
  stepNumberForSection,
  type SectionKey,
  type StepKey,
} from "./service-form-steps";

export interface MissingRequiredField {
  /** 1-based step in THIS listing's flow (branch-dependent), for the jump link. */
  step: number;
  /** The step's stable identity — what the form matches on when rendering. */
  stepKey: StepKey;
  /** The section that holds the field; the step above is derived from it. */
  section: SectionKey;
  label: string;
}

export interface RequiredCategoryField {
  fieldKey: string;
  label: string;
  /** `category_field_schema.type` — boolean | select | multiselect | text | number | url */
  type: string;
  required?: boolean;
}

export interface ServiceFormRequiredInput {
  role: "provider" | "expert";
  isEditMode: boolean;
  name: string;
  categoryId: string;
  /** FP-1 / A1: the category is empty BECAUSE the chosen offering resolves to none. */
  offeringCategoryUnresolved: boolean;
  serviceOfferingTypeId: string;
  expertOfferingTypeId: string;
  /** in-person / hybrid — the same predicate that renders the Meeting Location card. */
  needsMeetingPoint: boolean;
  meetingPoint: string;
  /** The wizard's UI delivery value (`pdf` is the artifact one). */
  deliveryMethod: string;
  serviceFile: string;
  deliverableUploaded: boolean;
  /** The wizard's price-type label; "Package tiers" derives its scalar from the tiers. */
  priceType: string;
  basePrice: number | string;
  pricingTiers: ReadonlyArray<{ price: number | string }>;
  categoryFields: ReadonlyArray<RequiredCategoryField>;
  categoryAttributes: Record<string, unknown>;
  /** True when the server's attestation publish gate would refuse this write today. */
  attestationGateBlocked: boolean;
}

/**
 * The effective price the server will judge. `package_tiers` listings have their scalar
 * recomputed server-side from the LOWEST positive tier (see POST /api/provider/services), so the
 * client checks the same thing rather than the base-price box the provider never filled in.
 * Returns `null` when there is no positive price to state — never a fabricated 0 (§13).
 */
export function effectivePriceScalar(input: Pick<ServiceFormRequiredInput, "priceType" | "basePrice" | "pricingTiers">): number | null {
  if (input.priceType === "Package tiers") {
    const positives = input.pricingTiers
      .map((t) => Number(t.price))
      .filter((n) => Number.isFinite(n) && n > 0);
    return positives.length > 0 ? Math.min(...positives) : null;
  }
  const base = Number(input.basePrice);
  return Number.isFinite(base) && base > 0 ? base : null;
}

/** True when a required category field has no answer. A BOOLEAN answers itself — `false` is a
 *  real answer, not a blank — so it can never be "missing" (§13: a deliberate no is not silence). */
export function categoryFieldUnanswered(field: RequiredCategoryField, value: unknown): boolean {
  if (!field.required) return false;
  if (field.type === "boolean") return false;
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function missingRequiredForFinal(input: ServiceFormRequiredInput): MissingRequiredField[] {
  const missing: MissingRequiredField[] = [];
  /** One place resolves section → step, for this listing's branch (Wave 2 / A1). */
  const at = (section: SectionKey, label: string): MissingRequiredField => ({
    section,
    stepKey: stepForSection(section, input.deliveryMethod),
    step: stepNumberForSection(section, input.deliveryMethod),
    label,
  });

  if (!input.name) missing.push(at("identity", "Service name"));

  if (!input.categoryId) {
    missing.push(
      at(
        "identity",
        input.offeringCategoryUnresolved
          ? "Category — this offering resolves to no category (see Basics)"
          : "Category",
      ),
    );
  }

  if (input.role === "provider" && !input.isEditMode && !input.serviceOfferingTypeId) {
    missing.push(at("offering", "An offering from the catalog"));
  }
  if (input.role === "expert" && !input.isEditMode && !input.expertOfferingTypeId) {
    missing.push(at("identity", "Service tier"));
  }

  // FP-2: the price asterisk finally binds. Mirrors PRICE_REQUIRED, provider-only (see header).
  if (input.role === "provider" && effectivePriceScalar(input) == null) {
    missing.push(
      at(
        "identity",
        input.priceType === "Package tiers" ? "A package tier with a price above zero" : "Price",
      ),
    );
  }

  // A1: the meeting point moved with the rest of the spatial questions onto the Logistics step.
  if (input.needsMeetingPoint && !input.meetingPoint.trim()) {
    missing.push(at("place", "Meeting point"));
  }

  // FP-1 / B7: a downloadable listing cannot go live with an empty deliverable.
  if (
    input.role === "provider" &&
    input.deliveryMethod === "pdf" &&
    !input.serviceFile.trim() &&
    !input.deliverableUploaded
  ) {
    missing.push(at("deliverable", "Deliverable file (upload or link)"));
  }

  // FP-2: the asterisks the category schema draws now bind too.
  for (const field of input.categoryFields) {
    if (categoryFieldUnanswered(field, input.categoryAttributes[field.fieldKey])) {
      missing.push(at("categoryFields", field.label));
    }
  }

  // FP-2, the other direction: an enforced block that wore no asterisk now names itself here.
  if (input.attestationGateBlocked) {
    missing.push(at("attestations", "The confirmations on Review & submit"));
  }

  return missing;
}
