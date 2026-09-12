/**
 * offering-listing-input.ts — THE ONE assembly of a `provider_services` row into the shape
 * `resolveOfferingCommerceContract` reads.
 *
 * EXTRACTED, NOT COPIED (§18 rule 1). This was `resolveActivationInput`, private to
 * `offering-activation-gate.service.ts` (lane OC-A4). Lane OC-B1 needs exactly the same assembly at
 * a second moment — when a `service_bookings` row is committed — and a second function reading the
 * same four tables into the same shape is the derivation-drift class: the day the gate learns about
 * a new column, a snapshot composed by a private twin would keep resolving the listing the old way,
 * and a seller would be refused an activation on terms their sold bookings never recorded.
 *
 * ONE implementation, TWO callers: the activation gate (which overlays a pending write) and the
 * contract snapshot (which reads the row as it stands).
 *
 * WHAT IT DOES NOT DO. It resolves nothing — every decision stays in
 * `resolveOfferingCommerceContract`. It writes nothing. It reads no request: the owner is passed in
 * by the caller from a server-side fact (the write's session, or the booking's own `provider_id`),
 * never from a body (§14).
 *
 * §13 — ABSENCE IS CARRIED, NOT COERCED. `ownerInstantBooking` is `undefined` when the owner has NO
 * `service_provider_forms` row at all and `null` when the row exists with an unset flag; both
 * resolve to the same booking mode and they are DIFFERENT FACTS, which is the whole point of
 * `resolveBookingModeWithProvenance` (ledger `2026-09-11-booking-mode-provenance`). Coercing either
 * to `false` here would make 64 of 67 production listings claim their owner chose "request".
 */
import { eq } from "drizzle-orm";

import { db } from "../db";
import { providerServices, serviceCategories, serviceProviderForms, users } from "@shared/schema";
import type { OfferingListingInput } from "./offering-commerce-contract";

/**
 * The fields a pending write may change that the contract reads. `undefined` = not part of this
 * write; `null` = being cleared. Same convention as `resolveAttestationShape`.
 */
export interface OfferingListingOverrides {
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
 * The listing facts, plus the two joined facts the row cannot state about itself (its owner's role
 * and its owner's account-level instant-booking flag) and the category key the offering catalogs
 * are read by.
 *
 * `serviceId` absent ⇒ there is no stored row and the overrides are the whole of it (the create
 * rail). `ownerUserId` absent ⇒ taken from the stored row's own `user_id`, which is NOT NULL; a
 * caller that already holds the owner passes it.
 *
 * Returns `null` only when a `serviceId` was given, no such row exists and the caller named no
 * owner either — there is then nothing to describe, and neither caller invents a listing (§13).
 */
export async function loadOfferingListingInput(opts: {
  serviceId?: string | null;
  ownerUserId?: string | null;
  overrides?: OfferingListingOverrides;
}): Promise<OfferingListingInput | null> {
  let serviceType: string | null = null;
  let deliveryMethod: string | null = null;
  let productShape: string | null = null;
  let priceType: string | null = null;
  let bookingMode: string | null = null;
  let categoryId: string | null = null;
  let depositEnabled: boolean | null = null;
  let meetingPoint: string | null = null;
  let ownerUserId: string | null = opts.ownerUserId ?? null;

  if (opts.serviceId) {
    const [row] = await db
      .select({
        userId: providerServices.userId,
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
    if (!row && !opts.ownerUserId) return null;
    serviceType = row?.serviceType ?? null;
    deliveryMethod = row?.deliveryMethod ?? null;
    productShape = row?.productShape ?? null;
    priceType = row?.priceType ?? null;
    bookingMode = row?.bookingMode ?? null;
    categoryId = row?.categoryId ?? null;
    depositEnabled = row?.depositEnabled ?? null;
    meetingPoint = row?.meetingPoint ?? null;
    ownerUserId = ownerUserId ?? row?.userId ?? null;
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
  const [owner] = ownerUserId
    ? await db.select({ role: users.role }).from(users).where(eq(users.id, ownerUserId))
    : [undefined];

  // `instant_booking` UNCOERCED — see the header.
  const [form] = ownerUserId
    ? await db
        .select({ instantBooking: serviceProviderForms.instantBooking })
        .from(serviceProviderForms)
        .where(eq(serviceProviderForms.userId, ownerUserId))
    : [undefined];

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
