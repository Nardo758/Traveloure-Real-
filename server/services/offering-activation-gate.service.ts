/**
 * ACTIVATION VALIDATION — a listing may not go live if nothing can say how it is sold.
 *
 * Lane OC-A4 of `docs/superpowers/specs/2026-09-11-offering-commerce-contract-implementation-plan.md`
 * (ledger `2026-09-11-offering-activation-validation`), implementing the design's §15 closing rule:
 * "activation of a new unclassifiable listing must fail with a machine-readable reason", and
 * folding in the dropped OC-A3's refusal surface — the reason is shown to the SELLER, who is the
 * only person who can act on it.
 *
 * THE SCOPING TO TRANSITIONS IS LOAD-BEARING, NOT A SOFTENING. The gate fires only where a write
 * moves a listing INTO `active` from something else — the shape the SS-5a attestation gate beside
 * it already uses. Production's 61 demo listings are KEPT by ruling (`2026-09-11-oc-a1-ratified`)
 * and resolve as unclassified, so a validator that ran over rows that are ALREADY active would
 * refuse the corpus the platform is currently being tested with. §15's own wording: unknown
 * delivery behaviour stays readable for historical rows. No backfill, and nothing already live is
 * ever deactivated by this.
 *
 * IT IS ONE MORE CALLER OF ONE RESOLVER (§18 rule 1). Every decision is
 * `resolveOfferingCommerceContract`'s; this module only assembles the effective shape from the DB
 * and the write, and turns a refusal into an HTTP body. A second "is this listing classifiable?"
 * test beside the resolver is the derivation-drift class §18 rule 1 names.
 *
 * NEGATIVE SPACE, stated because green means green-within-stated-bounds (§18d):
 *   · It gates the two rails that can put a `provider_services` row into `active`: POST and PATCH
 *     `/api/provider/services`. Admin approval moves `approval_status`, not `status`, and is not
 *     gated here.
 *   · It checks that a CONTRACT can be resolved. It does NOT check that the archetype's required
 *     context is present — that is OC-B3, and a listing can pass this gate and still be missing
 *     facts a purchase will need.
 *   · A FINDING never refuses. A disagreement between an archetype and the service fundamentals is
 *     reported by the resolver for a human; it is not a publishing error.
 *   · It reads the OWNER's role to set `sellerClass`, and deliberately does NOT feed
 *     `local_expert_forms.offering_type_key` in as the listing's offering key: that key is the
 *     expert's ACCOUNT-level role, not this listing's offering, and filing every one of their
 *     listings under it would be a claim the row does not make (§13).
 *
 * THE GATE REFUSES ON A NARROWER SET THAN THE RESOLVER REFUSES ON, AND THAT IS THE FINDING THIS
 * LANE MADE. The plan's OC-A4 brief reads "a listing transitioning INTO active that resolves to no
 * contract is refused". Taken literally that includes `catalog_keys_unrecognised` — and a listing
 * with NO CATEGORY AT ALL is a normal, supported shape on this platform (the F2 publish-gate suite
 * creates and publishes exactly that), while `impactClassFor` also returns nothing for a listing
 * whose category row carries no `category_key`, which is the taxonomy defect ruling 31's amendment
 * describes and migration 289 repairs. Both are facts about OUR tables, not about what the seller
 * stated, and refusing a seller for them would say "choose a category" to someone who did.
 *
 * So `catalog_keys_unrecognised` is REPORTED, NEVER REFUSED: it is `logger.warn`ed with the
 * listing id so the gap is observable rather than silent (the §18d posture — a standing exemption
 * that is never re-read becomes a baseline), and `scripts/audit-offering-classification.ts` counts
 * it against any database. What the gate DOES refuse is the design's own activation enumeration:
 * §15 invariant 12's unknown delivery behaviour, §11's two invalid combinations, and a
 * `service_type` outside the declared vocabulary. Those are all facts the seller stated and can
 * change. `GATE_REFUSING_REASONS` below is that set, written down once.
 */
import { eq } from "drizzle-orm";

import { db } from "../db";
import { logger } from "../infrastructure/logger";
import { providerServices, serviceCategories, serviceProviderForms, users } from "@shared/schema";
import {
  resolveOfferingCommerceContract,
  type OfferingListingInput,
  type UnresolvableReason,
} from "./offering-commerce-contract";

export interface ActivationGateRefusal {
  status: number;
  body: {
    message: string;
    code: "OFFERING_CONTRACT_UNRESOLVABLE";
    reason: UnresolvableReason;
    detail: string;
  };
}

/**
 * The fields a write may change that the contract reads. `undefined` = not part of this write;
 * `null` = being cleared. Same convention as `resolveAttestationShape`.
 */
export interface ActivationOverrides {
  serviceType?: string | null;
  deliveryMethod?: string | null;
  productShape?: string | null;
  priceType?: string | null;
  bookingMode?: string | null;
  categoryId?: string | null;
  depositEnabled?: boolean | null;
  meetingPoint?: string | null;
}

/**
 * SELLER-FACING sentences. The refusal reason is machine-readable AND said out loud — a refusal is
 * a sentence, never a greyed-out button (§13). Each one names the field the seller can change.
 */
const REFUSAL_MESSAGE: Readonly<Record<UnresolvableReason, string>> = {
  service_type_outside_declared_vocabulary:
    "This listing's service type isn't one we can sell against yet, so we can't say how it should be booked. Pick one of the standard service types before publishing — save as draft to finish later.",
  delivery_shape_unclassifiable:
    "Tell us how this is delivered before publishing — in person, on a call or video, as a file, or as messages. Without that we can't say how it is fulfilled. Save as draft to finish later.",
  catalog_keys_unrecognised:
    "Choose a category for this listing before publishing. Without one we can't say what buying it adds to a traveler's plan. Save as draft to finish later.",
  archetype_unresolvable:
    "We can't work out how this listing should be sold from the details given. Check the category, delivery method and product type, or save as draft and contact support.",
  instant_commitment_with_custom_quote:
    "A custom-quote listing can't be booked instantly — the quote has to come first. Set booking to \"request\" on this listing, or change the price type.",
  artifact_delivery_with_meeting_point:
    "A downloadable listing can't also require a meeting point. Remove the meeting point, or change the delivery method.",
};

/**
 * THE REASONS THAT BLOCK A PUBLISH, written down once (see the header for why this is narrower
 * than the resolver's own refusal set). Every member is a fact the SELLER stated on the listing and
 * can change; the one non-member — `catalog_keys_unrecognised` — is a fact about the catalog.
 */
const GATE_REFUSING_REASONS: ReadonlySet<UnresolvableReason> = new Set<UnresolvableReason>([
  // §15 invariant 12: no listing may use unknown delivery behaviour once it is newly activated.
  "delivery_shape_unclassifiable",
  // §11's two activation-time invalid combinations.
  "instant_commitment_with_custom_quote",
  "artifact_delivery_with_meeting_point",
  // A value the seller typed that no behavioural reading covers. Existing rows are untouched —
  // only a NEW transition into active is judged.
  "service_type_outside_declared_vocabulary",
  // Unreachable today, and refusing is the right answer for the day a shape lands that no
  // archetype covers: publishing a listing nothing can sell is worse than refusing it.
  "archetype_unresolvable",
]);

/**
 * Assemble the shape the listing will HAVE after this write — the live row overlaid with the
 * write's own fields — so the gate cannot be walked past by omitting a field from the body. On a
 * create there is no live row and the overrides are the whole of it.
 */
async function resolveActivationInput(opts: {
  serviceId?: string | null;
  ownerUserId: string;
  overrides?: ActivationOverrides;
}): Promise<OfferingListingInput> {
  let serviceType: string | null = null;
  let deliveryMethod: string | null = null;
  let productShape: string | null = null;
  let priceType: string | null = null;
  let bookingMode: string | null = null;
  let categoryId: string | null = null;
  let depositEnabled: boolean | null = null;
  let meetingPoint: string | null = null;

  if (opts.serviceId) {
    const [row] = await db
      .select({
        serviceType: providerServices.serviceType,
        deliveryMethod: providerServices.deliveryMethod,
        productShape: providerServices.productShape,
        priceType: providerServices.priceType,
        bookingMode: providerServices.bookingMode,
        categoryId: providerServices.categoryId,
        depositEnabled: providerServices.depositEnabled,
        meetingPoint: providerServices.meetingPoint,
      })
      .from(providerServices)
      .where(eq(providerServices.id, opts.serviceId));
    serviceType = row?.serviceType ?? null;
    deliveryMethod = row?.deliveryMethod ?? null;
    productShape = row?.productShape ?? null;
    priceType = row?.priceType ?? null;
    bookingMode = row?.bookingMode ?? null;
    categoryId = row?.categoryId ?? null;
    depositEnabled = row?.depositEnabled ?? null;
    meetingPoint = row?.meetingPoint ?? null;
  }

  const o = opts.overrides ?? {};
  if (o.serviceType !== undefined) serviceType = o.serviceType;
  if (o.deliveryMethod !== undefined) deliveryMethod = o.deliveryMethod;
  if (o.productShape !== undefined) productShape = o.productShape;
  if (o.priceType !== undefined) priceType = o.priceType;
  if (o.bookingMode !== undefined) bookingMode = o.bookingMode;
  if (o.categoryId !== undefined) categoryId = o.categoryId;
  if (o.depositEnabled !== undefined) depositEnabled = o.depositEnabled;
  if (o.meetingPoint !== undefined) meetingPoint = o.meetingPoint;

  let categoryKey: string | null = null;
  if (categoryId) {
    const [cat] = await db
      .select({ categoryKey: serviceCategories.categoryKey })
      .from(serviceCategories)
      .where(eq(serviceCategories.id, categoryId));
    categoryKey = cat?.categoryKey ?? null;
  }

  // The owner's role decides `sellerClass`. Anyone who is not an expert and owns a row on the
  // provider table is selling as a provider — that is what the row IS, not a guess about them.
  const [owner] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, opts.ownerUserId));

  // `instant_booking` UNCOERCED: a missing form row and a stored `false` resolve to the same
  // booking mode but are different facts, and the contract's `commitmentModeSource` is the one
  // reader that can tell them apart (ledger `2026-09-11-booking-mode-provenance`).
  const [form] = await db
    .select({ instantBooking: serviceProviderForms.instantBooking })
    .from(serviceProviderForms)
    .where(eq(serviceProviderForms.userId, opts.ownerUserId));

  return {
    kind: "listing",
    sellerClass: owner?.role === "expert" ? "expert" : "provider",
    serviceType,
    deliveryMethod,
    productShape,
    priceType,
    bookingMode,
    ownerInstantBooking: form ? form.instantBooking ?? null : undefined,
    categoryKey,
    depositEnabled,
    hasMeetingPoint: !!(meetingPoint ?? "").toString().trim(),
  };
}

/**
 * THE GATE. Returns `null` when the write may proceed to `active`; otherwise the exact 422 to send.
 *
 * CALL IT ONLY ON A TRANSITION INTO ACTIVE. The caller owns that condition, exactly as it does for
 * the attestation gate: create with `status: "active"`, or a PATCH where the target is `active`
 * and the stored status is not. A caller that runs this over an already-active row would refuse
 * the demo corpus, which the ruling keeps.
 */
export async function checkOfferingActivationGate(opts: {
  serviceId?: string | null;
  ownerUserId: string;
  overrides?: ActivationOverrides;
}): Promise<ActivationGateRefusal | null> {
  const input = await resolveActivationInput(opts);
  const resolution = resolveOfferingCommerceContract(input);
  if (resolution.resolved) return null;

  // A reason the seller cannot act on does not block them (see the header). It is reported, so the
  // gap stays visible; the audit script is where it is counted.
  if (!GATE_REFUSING_REASONS.has(resolution.reason)) {
    logger.warn(
      {
        serviceId: opts.serviceId ?? null,
        reason: resolution.reason,
        detail: resolution.detail,
      },
      "[offering-contract] activation allowed with an unresolvable contract",
    );
    return null;
  }

  return {
    // 422, matching the VERIFICATION_REQUIRED gate on the same rail: the request is well-formed
    // and the listing is the seller's own — what fails is a rule about its content.
    status: 422,
    body: {
      message: REFUSAL_MESSAGE[resolution.reason],
      code: "OFFERING_CONTRACT_UNRESOLVABLE",
      reason: resolution.reason,
      // The resolver's own sentence, so support and the seller see the same words the audit prints.
      detail: resolution.detail,
    },
  };
}

/** Exported for the pin: every refusal reason the resolver can return has a seller-facing sentence. */
export const ACTIVATION_REFUSAL_MESSAGES = REFUSAL_MESSAGE;

/** Exported for the pin: which of those reasons actually BLOCK a publish, and which only report. */
export const ACTIVATION_BLOCKING_REASONS = GATE_REFUSING_REASONS;
