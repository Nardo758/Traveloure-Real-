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

/**
 * ── WAVE 2 / LANE S2 ADDITION ─────────────────────────────────────────────────────────────────
 * A single row descriptor, computed once and consumed TWO ways: `missingRequiredForFinal` keeps
 * asking "what's still missing" (unchanged output, unchanged tests), and the listing-home
 * checklist (`deriveServiceChecklist` below) asks "show me the whole row, ticked or not" — off
 * the SAME `applicable`/`done` predicates, so the two can never drift apart ("FP-2 aligned the
 * sets; don't fork them", execution-map lane S2). This is the ONE place a required check is
 * defined; nothing downstream re-implements a condition already written here.
 */
interface RequiredItem {
  id: string;
  section: SectionKey;
  label: string;
  applicable: boolean;
  done: boolean;
}

/** Order matches the pre-refactor `missingRequiredForFinal` exactly — a "still needed" list that
 *  silently reordered itself would be its own small dishonesty. */
function buildRequiredItems(input: ServiceFormRequiredInput): RequiredItem[] {
  return [
    {
      id: "name",
      section: "identity",
      label: "Service name",
      applicable: true,
      done: !!input.name,
    },
    {
      id: "category",
      section: "identity",
      label: input.offeringCategoryUnresolved
        ? "Category — this offering resolves to no category (see Basics)"
        : "Category",
      applicable: true,
      done: !!input.categoryId,
    },
    {
      id: "offering",
      section: "offering",
      label: "An offering from the catalog",
      // EDIT mode grandfathers the offering link (an existing row need not re-pick one) —
      // which is also why this row never appears on the listing-home checklist: that surface
      // only exists for a row that already has an id, i.e. is always in edit mode.
      applicable: input.role === "provider" && !input.isEditMode,
      done: !!input.serviceOfferingTypeId,
    },
    {
      id: "tier",
      section: "identity",
      label: "Service tier",
      applicable: input.role === "expert" && !input.isEditMode,
      done: !!input.expertOfferingTypeId,
    },
    {
      id: "price",
      section: "identity",
      // FP-2: the price asterisk finally binds. Mirrors PRICE_REQUIRED, provider-only (see header).
      label: input.priceType === "Package tiers" ? "A package tier with a price above zero" : "Price",
      applicable: input.role === "provider",
      done: effectivePriceScalar(input) != null,
    },
    {
      id: "meetingPoint",
      section: "place",
      // A1: the meeting point moved with the rest of the spatial questions onto the Logistics step.
      label: "Meeting point",
      applicable: input.needsMeetingPoint,
      done: !!input.meetingPoint.trim(),
    },
    {
      id: "deliverable",
      section: "deliverable",
      // FP-1 / B7: a downloadable listing cannot go live with an empty deliverable.
      label: "Deliverable file (upload or link)",
      applicable: input.role === "provider" && input.deliveryMethod === "pdf",
      done: !!input.serviceFile.trim() || input.deliverableUploaded,
    },
  ];
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

  for (const item of buildRequiredItems(input)) {
    if (item.applicable && !item.done) missing.push(at(item.section, item.label));
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

/**
 * ── WAVE 2 / LANE S2 — THE LISTING HOME'S DERIVED CHECKLIST ─────────────────────────────────
 * Where a row NAVIGATES: either into the wizard at a named step (`stepForSection`, A1's placement
 * authority — never a literal step number) or, for the one row this module does not own, into
 * Catalog's availability section (ruling C9's home for it; see `docs/DECISIONS.md`).
 */
export type ChecklistNavTarget =
  | { kind: "step"; section: SectionKey; stepKey: StepKey; step: number }
  | { kind: "availability" };

export interface ChecklistRow {
  /** Stable across saves — what a test or a click handler matches on, never an index. */
  id: string;
  label: string;
  hint: string;
  /** Read back from the SAVED record — a row never ticks itself (§13). */
  done: boolean;
  target: ChecklistNavTarget;
}

export interface ServiceChecklistInput extends ServiceFormRequiredInput {
  /** Whether ANY attestation applies to this listing's method + category — the same predicate
   *  `resolveApplicableAttestations` (`shared/service-attestations.ts`) already gives the wizard.
   *  A method/category pair with nothing applicable never renders the row (§13: never a hollow
   *  tick for a confirmation that was never asked). */
  attestationsApplicable: boolean;
  /** Real published-slot count for this listing (`GET /api/me/services/:id/slots`). */
  availabilitySlotCount: number;
}

const REQUIRED_HINTS: Readonly<Record<string, string>> = {
  name: "What travelers see as this listing's title.",
  category: "Which shelf this sits on in the catalog.",
  price: "What a traveler pays. A package-tiers listing is judged on its lowest positive tier.",
  meetingPoint: "Confirmed on the Logistics step — a typed address alone is not a location.",
  deliverable: "Travelers receive this the moment they buy. Nothing is on the draft yet.",
  attestations: "The safety and honesty confirmations this method and category ask for.",
};

/**
 * The listing home's row list: the SAME required items `missingRequiredForFinal` mirrors the
 * server's publish gate with (never a second, forked set — see the header note above
 * `buildRequiredItems`), turned into always-shown rows instead of only-when-missing ones, plus
 * the two method-specific/record-state additions the wizard's own gate does not cover:
 * attestations (gated on real applicability, not just the gate's current verdict) and
 * availability (never part of the publish gate — a listing can be approved with none — but the
 * one thing that makes an approved listing actually sellable, so the row still names it).
 *
 * A branch this listing does not have never contributes a row: `buildRequiredItems`'s own
 * `applicable` flags already say a pdf listing has no meeting point and a remote listing has no
 * deliverable, so nothing downstream needs to re-derive method applicability a second time.
 */
export function deriveServiceChecklist(input: ServiceChecklistInput): ChecklistRow[] {
  const rows: ChecklistRow[] = [];
  const stepTarget = (section: SectionKey): ChecklistNavTarget => ({
    kind: "step",
    section,
    stepKey: stepForSection(section, input.deliveryMethod),
    step: stepNumberForSection(section, input.deliveryMethod),
  });

  for (const item of buildRequiredItems(input)) {
    if (!item.applicable) continue;
    rows.push({
      id: item.id,
      label: item.label,
      hint: REQUIRED_HINTS[item.id] ?? "",
      done: item.done,
      target: stepTarget(item.section),
    });
  }

  // Only the REQUIRED category fields get a row — an optional field was never part of the
  // asterisk set `missingRequiredForFinal` mirrors, so it stays off the checklist too.
  for (const field of input.categoryFields) {
    if (!field.required) continue;
    rows.push({
      id: `categoryField:${field.fieldKey}`,
      label: field.label,
      hint: "Required for this category.",
      done: !categoryFieldUnanswered(field, input.categoryAttributes[field.fieldKey]),
      target: stepTarget("categoryFields"),
    });
  }

  if (input.attestationsApplicable) {
    rows.push({
      id: "attestations",
      label: "The confirmations on Review & submit",
      hint: REQUIRED_HINTS.attestations,
      done: !input.attestationGateBlocked,
      target: stepTarget("attestations"),
    });
  }

  // Never part of the publish gate — see the function doc above — so this row's `done` can be
  // false on an otherwise-complete, already-approved listing, and that is an honest state, not a
  // bug: an approved listing with no slots can be approved and still sell nothing.
  rows.push({
    id: "availability",
    label: "Publish some availability",
    hint: "Nothing else here makes this bookable — a listing with no slots can be approved and still sell nothing.",
    done: input.availabilitySlotCount > 0,
    target: { kind: "availability" },
  });

  return rows;
}
