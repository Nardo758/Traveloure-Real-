/**
 * SERVICE QUOTES — request, issue, withdraw, decline, ACCEPT, in ONE place.
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-28 / D-29 / D-30 / D-31, all option A; ledger
 * `2026-09-15-d28-d31-service-quotes`). Content of record: `docs/design/CUSTOM_QUOTE_BRIEF.md` §2
 * (the state machine) and §3 (the money posture). Table: `service_quotes` (migration 305).
 *
 * THE RULES THIS MODULE IS BOUND BY, each of which the brief states as non-negotiable:
 *
 *  1. §14 — THE ACTOR IS THE SESSION, AND THE AMOUNT IS THE ROW'S. Every entry point takes an
 *     actor id the route read off the session. The traveler's ACCEPT carries a quote id and
 *     nothing else; the amount the booking is minted at is read off the `service_quotes` row the
 *     server itself wrote. The provider's ISSUE carries the amount — that is owner business data
 *     (their price for this traveler, like `provider_services.price`), not a fee, a rate or a band,
 *     and it reaches a booking only through acceptance.
 *  2. §15 — ACCEPTANCE IS AN ATOMIC CLAIM WITH THE EXPIRY IN ITS WHERE CLAUSE.
 *     `UPDATE service_quotes SET status='accepted', accepted_at=now() WHERE id=? AND status='quoted'
 *     AND accepted_at IS NULL AND superseded_by IS NULL AND expires_at > now()` — the statement is
 *     the guard; a check-then-mint is the TOCTOU bug. The window is enforced by the transition, not
 *     by a prior read that could go stale.
 *  3. §15b — THE CLAIM AND THE MINT ARE ONE TRANSACTION FROM THE QUOTE'S SIDE. The accept runs
 *     under a `SELECT … FOR UPDATE` on the quote row: the claim, the mint through the EXISTING
 *     birth-rail writer, and the `booking_id` stamp commit together, and a second concurrent
 *     accept WAITS on the lock, then reads the stamped row and returns the SAME booking. A double
 *     call mints exactly ONE booking. If the mint throws, the claim rolls back and the quote is
 *     still `quoted` — nothing accepted, nothing minted, retry allowed — rather than an "accepted"
 *     row with no booking behind it.
 *  4. §18 rule 1 — NO SECOND BOOKING-BIRTH RAIL. The mint is `storage.createServiceBookingAtomic`,
 *     the writer the client-facing birth rail (`POST /api/bookings`) already uses, with §19d's
 *     layer-2 strips on it; the rate is `resolveServiceOwnerShareRate` (the ONE call into
 *     `fee_bands`) and the deposit split is `resolveDepositPlan` (the ONE deposit derivation) fed
 *     the quoted amount as the line total — "same function, same listing config, a different line
 *     total" (brief §3). `stripePaymentIntentId` keeps its sole writers (§19a): the row is born
 *     UNPAID, in the same `pending` state `POST /api/bookings` births.
 *  5. §19 — the two admissible bodies are the `.strict()` picks in `shared/service-quotes.ts`.
 *     Nothing here spreads a parsed body into a row.
 *  6. D-29 — VALIDITY IS CONFIG. `resolveQuoteValidityDays` (server/config/quote-validity.config.ts)
 *     answers the window; a provider choice above the ceiling is REFUSED with the ceiling stated,
 *     never silently clamped. No day count is written in this file.
 *  7. §13 — A QUOTE IS NEVER EDITED; IT IS SUPERSEDED. A re-quote writes a NEW row and stamps
 *     `superseded_by` on the old, so "expired on X" stays a fact rather than a reconstruction. An
 *     expired quote is refused WITH ITS EXPIRY, a withdrawn one and a declined one by their own
 *     names — never one undifferentiated "cannot accept".
 *
 * NEGATIVE SPACE — what this lane deliberately does NOT build, so nobody reads it as built:
 *  · THE CHARGE. The quote-born booking is BORN unpaid (`pending`); feeding the quoted amount
 *    into `POST /api/checkout`'s line-price derivation so CLAIM → AUTHORIZE → PROMOTE charges it
 *    is a separate lane (that derivation runs in two loops and two previews and needs its own
 *    brief). Today no rail charges a `pending` service booking — quote-born or request-born alike.
 *  · ANY SURFACE. The provider's issue/withdraw affordance on Catalog and the traveler's quote
 *    card on the slip are brief §6 lane 5; this lane exposes rails and reads only.
 *  · A NEGOTIATION THREAD beyond the existing LD 40 conversation, partner quotes, multi-currency.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { providerServices, serviceQuotes, trips, type ServiceQuote } from "@shared/schema";
import { isProviderRole } from "@shared/roles";
import {
  SERVICE_QUOTE_CURRENCY,
  centsToAmount,
  quoteLifecycle,
  type ServiceQuoteLifecycle,
} from "@shared/service-quotes";

import { db } from "../db";
import { storage } from "../storage";
import { quoteExpiresAt, resolveQuoteValidityDays } from "../config/quote-validity.config";
import { buildListingBuyAction } from "./buy-action-payload";
import { resolveServiceOwnerShareRate } from "./commission";
import { resolveDepositPlan } from "./deposit.service";
import { resolveQuotePlanLink } from "./quote-plan-link.service";
import { syncItemProjection } from "./cart-projection.service";
import { logger } from "../infrastructure/logger";
// Ledger `2026-09-20-quote-fee-preaccept`: the SAME snapshot shape/resolver the charge arm uses
// (§18 rule 1) — a list-time reader and the charge arm must never carry two formulas for one fee.
import { resolveTravelerServiceFeeSnapshot, type TravelerServiceFeeSnapshot } from "./fee-resolution.service";
import { coversAction } from "./trip-entitlement.service";

// ─── Refusals ─────────────────────────────────────────────────────────────────────────────────

/** Machine-readable refusals. §13: a refusal is a sentence, and it says WHICH fact refused it. */
export type QuoteRefusalCode =
  | "not_found"
  | "listing_not_found"
  | "own_listing"
  | "not_requestable"
  | "validity_exceeds_ceiling"
  | "validity_not_positive"
  | "wrong_status"
  | "not_yet_quoted"
  | "quote_expired"
  | "quote_withdrawn"
  | "quote_declined"
  | "quote_superseded"
  | "lost_race"
  // Ledger `2026-09-19-quote-plan-link`: `resolveQuotePlanLink`'s two refusals.
  | "trip_not_found"
  | "item_not_on_plan";

export interface QuoteRefusal {
  ok: false;
  status: number;
  code: QuoteRefusalCode;
  message: string;
  /** Present on `quote_expired` only — WHEN it expired, stated (§13). */
  expiresAt?: string;
  /** Present on the validity refusals — the NUMBERS, stated, never a bare "too long" (§13). */
  ceilingDays?: number;
  requestedDays?: number;
}

const refuse = (
  status: number,
  code: QuoteRefusalCode,
  message: string,
  extra: Partial<Pick<QuoteRefusal, "expiresAt" | "ceilingDays" | "requestedDays">> = {},
): QuoteRefusal => ({ ok: false, status, code, message, ...extra });

/**
 * "No such quote" and "not yours" are the SAME sentence (the LD 40 / custom-venues posture), so
 * neither rail can be used to probe which quotes exist.
 */
const NOT_FOUND = () => refuse(404, "not_found", "Quote not found.");

// ─── Projection ───────────────────────────────────────────────────────────────────────────────

/**
 * What a reader is handed. NO `users.id` of either party (LD 40 — an id is internal; the
 * provider answers the traveler through the conversation the request opened, the traveler is
 * addressed by the plan/listing, never by a row id). Absent facts are OMITTED, never zero-filled.
 */
export interface ServiceQuoteView {
  id: string;
  serviceId: string;
  serviceName?: string;
  position: number;
  status: string;
  lifecycle: ServiceQuoteLifecycle;
  amountCents?: number;
  amount?: string;
  currency?: string;
  requestNote?: string;
  note?: string;
  quotedAt?: string;
  expiresAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  withdrawnAt?: string;
  supersededBy?: string;
  bookingId?: string;
  createdAt?: string;
  /** Ledger `2026-09-19-quote-plan-link`: present only when the quote was asked from a plan the
   *  reader may still resolve a title for (a deleted plan leaves `tripId` NULL on this row per
   *  ON DELETE SET NULL — the same SET-NULL posture every other plan-child link takes). */
  tripId?: string;
  tripTitle?: string;
  /**
   * Ledger `2026-09-20-quote-fee-preaccept`: the READ-ONLY, LIST-TIME disclosure of the ruled
   * traveler service fee, present on every ISSUED quote (a row that carries an `amountCents`).
   * Nothing is stamped by computing this — the charge-time snapshot `claimQuoteBornBooking` writes
   * stays the record, and if the band moves between list and charge the CHARGE-TIME figure wins and
   * the payment sheet re-discloses (§13). Absent on a `requested` row (no amount yet ⇒ nothing to
   * fee — never rendered as a $0 fee).
   */
  travelerServiceFee?: TravelerServiceFeeSnapshot;
}

const iso = (d: Date | string | null | undefined): string | undefined => {
  if (d === null || d === undefined) return undefined;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
};

export function presentQuote(
  row: ServiceQuote,
  serviceName?: string | null,
  now: Date = new Date(),
  tripTitle?: string | null,
  /** Ledger `2026-09-20-quote-fee-preaccept`: the caller's already-resolved list-time fee snapshot,
   *  or undefined when the caller does not compute one (every caller but `listQuotesForTraveler`
   *  today — the owner list, and every mutation result, have no traveler-facing fee to disclose). */
  travelerServiceFee?: TravelerServiceFeeSnapshot,
): ServiceQuoteView {
  const view: ServiceQuoteView = {
    id: row.id,
    serviceId: row.serviceId,
    position: row.position,
    status: row.status,
    lifecycle: quoteLifecycle(row, now),
  };
  if (serviceName) view.serviceName = serviceName;
  if (row.amountCents !== null && row.amountCents !== undefined) {
    view.amountCents = row.amountCents;
    view.amount = centsToAmount(row.amountCents);
  }
  if (row.currency) view.currency = row.currency;
  if (row.requestNote) view.requestNote = row.requestNote;
  if (row.note) view.note = row.note;
  const quotedAt = iso(row.quotedAt); if (quotedAt) view.quotedAt = quotedAt;
  const expiresAt = iso(row.expiresAt); if (expiresAt) view.expiresAt = expiresAt;
  const acceptedAt = iso(row.acceptedAt); if (acceptedAt) view.acceptedAt = acceptedAt;
  const declinedAt = iso(row.declinedAt); if (declinedAt) view.declinedAt = declinedAt;
  const withdrawnAt = iso(row.withdrawnAt); if (withdrawnAt) view.withdrawnAt = withdrawnAt;
  if (row.supersededBy) view.supersededBy = row.supersededBy;
  if (row.bookingId) view.bookingId = row.bookingId;
  if (row.tripId) {
    view.tripId = row.tripId;
    if (tripTitle) view.tripTitle = tripTitle;
  }
  if (travelerServiceFee) view.travelerServiceFee = travelerServiceFee;
  const createdAt = iso(row.createdAt); if (createdAt) view.createdAt = createdAt;
  return view;
}

// ─── Reads ────────────────────────────────────────────────────────────────────────────────────

interface QuoteWithOwner {
  quote: ServiceQuote;
  ownerUserId: string | null;
  serviceName: string | null;
}

async function loadQuote(quoteId: string): Promise<QuoteWithOwner | null> {
  const [row] = await db
    .select({
      quote: serviceQuotes,
      ownerUserId: providerServices.userId,
      serviceName: providerServices.serviceName,
    })
    .from(serviceQuotes)
    .innerJoin(providerServices, eq(providerServices.id, serviceQuotes.serviceId))
    .where(eq(serviceQuotes.id, quoteId));
  return row ?? null;
}

/** Every quote on the caller's OWN listings, newest first. The owner is the session (§14). */
export async function listQuotesForOwner(ownerUserId: string): Promise<ServiceQuoteView[]> {
  const rows = await db
    .select({ quote: serviceQuotes, serviceName: providerServices.serviceName })
    .from(serviceQuotes)
    .innerJoin(providerServices, eq(providerServices.id, serviceQuotes.serviceId))
    .where(eq(providerServices.userId, ownerUserId))
    .orderBy(desc(serviceQuotes.createdAt));
  const now = new Date();
  return rows.map((r) => presentQuote(r.quote, r.serviceName, now));
}

/**
 * Ledger `2026-09-20-quote-fee-preaccept`: the LIST-TIME traveler-service-fee disclosure for ONE
 * issued quote, READ ONLY — nothing is stamped here. Computed through the SAME
 * `resolveTravelerServiceFeeSnapshot` the charge arm calls (§18 rule 1), over the quote's OWN
 * `amountCents` (never the listing's live price — a quote IS the price). `coversAction` is
 * consulted only when the quote already carries a `tripId` (ledger `2026-09-19-quote-plan-link`);
 * a quote asked with no plan in mind resolves `false` and the fee is disclosed in full. A best-effort
 * failure of the coverage check never fails the LIST — it just discloses the uncovered fee, the same
 * posture `resolveQuoteCharge` takes at charge time.
 *
 * §13: a quote with no amount yet (`requested`) has nothing to fee — this returns undefined, and
 * `presentQuote` omits the field entirely rather than rendering a $0.00 fee.
 *
 * NOTE — WHICH FIGURE WINS. This is a DISCLOSURE read, not a claim: if `fee_bands` moves between
 * this list read and the actual charge, the CHARGE-TIME snapshot `claimQuoteBornBooking` stamps is
 * the one that is ever billed, and the payment sheet re-discloses from that snapshot (see
 * `quote-charge.service.ts`'s own header and `resolveQuoteCharge`'s re-drive branch). This figure is
 * never written back to the row.
 */
async function resolveListTravelerServiceFee(quote: ServiceQuote): Promise<TravelerServiceFeeSnapshot | undefined> {
  if (quote.amountCents === null || quote.amountCents === undefined) return undefined;
  const subtotal = quote.amountCents / 100;
  let tripPassCovers = false;
  if (quote.tripId) {
    try {
      tripPassCovers = await coversAction(quote.tripId, "traveler_service_fee");
    } catch (tpErr: any) {
      logger.error(
        { quoteId: quote.id, tripId: quote.tripId, err: tpErr?.message ?? tpErr },
        "list-quotes: trip-pass coverage check failed (disclosing the uncovered fee)",
      );
      tripPassCovers = false;
    }
  }
  return resolveTravelerServiceFeeSnapshot(subtotal, tripPassCovers ? "trip_pass" : null);
}

/**
 * Every quote the caller REQUESTED, newest first. The traveler is the session (§14).
 *
 * Ledger `2026-09-19-quote-plan-link`: a LEFT JOIN to `trips` — most quotes carry no `tripId` and
 * must still list (§13: absent is not an error) — so `presentQuote` can name the plan the read-only
 * `TravelerQuotesPanel` shows a quote as coming from.
 *
 * Ledger `2026-09-20-quote-fee-preaccept`: each row also carries the READ-ONLY list-time fee
 * disclosure (above) so the accept card can state the fee BEFORE the traveler accepts, not one
 * screen later at the payment sheet.
 */
export async function listQuotesForTraveler(travelerId: string): Promise<ServiceQuoteView[]> {
  const rows = await db
    .select({ quote: serviceQuotes, serviceName: providerServices.serviceName, tripTitle: trips.title })
    .from(serviceQuotes)
    .innerJoin(providerServices, eq(providerServices.id, serviceQuotes.serviceId))
    .leftJoin(trips, eq(trips.id, serviceQuotes.tripId))
    .where(eq(serviceQuotes.travelerId, travelerId))
    .orderBy(desc(serviceQuotes.createdAt));
  const now = new Date();
  return Promise.all(
    rows.map(async (r) => {
      const travelerServiceFee = await resolveListTravelerServiceFee(r.quote);
      return presentQuote(r.quote, r.serviceName, now, r.tripTitle, travelerServiceFee);
    }),
  );
}

/** The OPEN offer between one traveler and one listing — `requested`, or `quoted` and unexpired. */
async function findOpenQuote(serviceId: string, travelerId: string): Promise<ServiceQuote | null> {
  const [row] = await db
    .select()
    .from(serviceQuotes)
    .where(
      and(
        eq(serviceQuotes.serviceId, serviceId),
        eq(serviceQuotes.travelerId, travelerId),
        sql`(${serviceQuotes.status} = 'requested' OR (${serviceQuotes.status} = 'quoted' AND ${serviceQuotes.expiresAt} > NOW()))`,
      ),
    )
    .orderBy(desc(serviceQuotes.position))
    .limit(1);
  return row ?? null;
}

// ─── REQUEST (D-30: creates NO booking row) ───────────────────────────────────────────────────

export interface RequestQuoteResult {
  ok: true;
  quote: ServiceQuoteView;
  /** false when the traveler already held an open quote on this listing — the same row is handed back. */
  created: boolean;
}

/**
 * A traveler asks for a quote on a listing. Creates ONE `service_quotes` row in `requested` state
 * and NOTHING ELSE: no `service_bookings` row, no cart line, no PaymentIntent, no earning (D-30,
 * brief §3 "what moves: nothing, until acceptance"). The words live in the LD 40 conversation the
 * client opens beside this; this rail adds no messaging.
 *
 * WHICH LISTINGS MAY BE REQUESTED is not re-decided here: `resolveBuyAction` (ruling 9, the sole
 * author of the buy/landing rule) already lands a `request`-mode, unpriced or calendar-less listing
 * on `store: "booking_request"`, and this rail admits exactly the listings it lands there — read
 * through the ONE gatherer `buildListingBuyAction` (§18 rule 1). A listing the resolver sends to
 * checkout is refused: a quote beside a published instant price would be a second price path.
 *
 * IDEMPOTENT: a traveler who already holds an open quote (requested, or quoted and unexpired) on
 * this listing gets that row back with `created: false` rather than a second request.
 */
export async function requestQuote(input: {
  serviceId: string;
  travelerId: string;
  note?: string | null;
  /** Ledger `2026-09-19-quote-plan-link`: the plan this request is being asked from, and — when
   *  one already exists — that plan's own item for this listing. Both server-verified below
   *  through `resolveQuotePlanLink`; never trusted beyond parsing (§14). */
  tripId?: string | null;
  itineraryItemId?: string | null;
}): Promise<RequestQuoteResult | QuoteRefusal> {
  const service = await storage.getProviderServiceById(input.serviceId);
  // ONE 404 for absent, unapproved and inactive alike — the F2 read gate, never a 403 that says
  // "exists but not for you".
  if (!service || service.status !== "active" || service.approvalStatus !== "approved") {
    return refuse(404, "listing_not_found", "Listing not found.");
  }
  if (service.userId === input.travelerId) {
    return refuse(400, "own_listing", "You cannot request a quote on your own listing.");
  }
  const buy = await buildListingBuyAction(
    {
      id: service.id,
      ownerUserId: service.userId,
      bookingMode: (service as { bookingMode?: string | null }).bookingMode ?? null,
      deliveryMethod: service.deliveryMethod ?? null,
      productShape: (service as { productShape?: string | null }).productShape ?? null,
      price: service.price ?? null,
      isLive: true,
    },
    { principal: "member", plans: "none" },
  );
  if (!buy || buy.landing?.store !== "booking_request") {
    return refuse(
      409,
      "not_requestable",
      "This listing is bought at checkout rather than quoted — add it to your plan or book it directly.",
    );
  }

  // Ledger `2026-09-19-quote-plan-link`: verify the pairing BEFORE touching any row — a refused
  // link must store nothing (P2/P3).
  const link = await resolveQuotePlanLink({
    travelerId: input.travelerId,
    serviceId: service.id,
    tripId: input.tripId ?? null,
    itineraryItemId: input.itineraryItemId ?? null,
  });
  if (!link.ok) {
    return refuse(link.status, link.code as QuoteRefusalCode, link.message);
  }

  const existing = await findOpenQuote(service.id, input.travelerId);
  if (existing) {
    return { ok: true, created: false, quote: presentQuote(existing, service.serviceName) };
  }

  const note = input.note && input.note.trim().length > 0 ? input.note.trim() : null;
  try {
    const [row] = await db
      .insert(serviceQuotes)
      .values({
        serviceId: service.id,
        travelerId: input.travelerId,
        // Derived server-side from the rows already on the pair; the UNIQUE index is the race guard.
        position: sql<number>`(SELECT COALESCE(MAX(${serviceQuotes.position}), 0) + 1 FROM ${serviceQuotes} WHERE ${serviceQuotes.serviceId} = ${service.id} AND ${serviceQuotes.travelerId} = ${input.travelerId})`,
        status: "requested",
        requestNote: note,
        ...(link.tripId ? { tripId: link.tripId } : {}),
        ...(link.itineraryItemId ? { itineraryItemId: link.itineraryItemId } : {}),
      })
      .returning();
    return { ok: true, created: true, quote: presentQuote(row, service.serviceName) };
  } catch (err: unknown) {
    // 23505 on the (service, traveler, position) index: a concurrent request landed first. Hand
    // back the winner's row — the same single effect (§15) — rather than a second request.
    if ((err as { code?: string })?.code === "23505") {
      const winner = await findOpenQuote(service.id, input.travelerId);
      if (winner) return { ok: true, created: false, quote: presentQuote(winner, service.serviceName) };
      return refuse(409, "lost_race", "A concurrent request landed first; try again.");
    }
    throw err;
  }
}

// ─── ISSUE (owner; D-29 validity) ─────────────────────────────────────────────────────────────

export interface IssueQuoteResult {
  ok: true;
  quote: ServiceQuoteView;
  /** Present on a RE-QUOTE: the older row this one replaced (its `superseded_by` now names `quote.id`). */
  supersededQuoteId?: string;
}

/**
 * The listing OWNER issues an amount with an expiry.
 *   · on a `requested` row: the row becomes `quoted` (filling in the first offer is issuing, not
 *     editing — there was no amount to destroy);
 *   · on a `quoted` row (expired or not): a RE-QUOTE — a NEW row is inserted and the old one is
 *     stamped `superseded_by` + `superseded`, in one transaction whose second statement is an
 *     atomic conditional; a concurrent accept that won the old row makes the re-quote roll back;
 *   · on a terminal row (`accepted`, `declined`, `withdrawn`, `superseded`): refused by name.
 * The validity is `resolveQuoteValidityDays` (config default, or the provider's choice under the
 * ceiling — refused with the number stated). No day count is written here.
 */
export async function issueQuote(input: {
  quoteId: string;
  actorUserId: string;
  amountCents: number;
  validityDays?: number | null;
  note?: string | null;
  now?: Date;
}): Promise<IssueQuoteResult | QuoteRefusal> {
  const ctx = await loadQuote(input.quoteId);
  if (!ctx || ctx.ownerUserId !== input.actorUserId) return NOT_FOUND();
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1) {
    return refuse(400, "wrong_status", "A quote needs a positive whole number of cents.");
  }

  const validity = resolveQuoteValidityDays(input.validityDays ?? null);
  if (!validity.ok) {
    return validity.reason === "exceeds_ceiling"
      ? refuse(
          400,
          "validity_exceeds_ceiling",
          `A quote may stand for at most ${validity.ceilingDays} days; ${validity.requestedDays} was asked.`,
          { ceilingDays: validity.ceilingDays, requestedDays: validity.requestedDays },
        )
      : refuse(
          400,
          "validity_not_positive",
          "A quote's validity must be a positive whole number of days.",
          { ceilingDays: validity.ceilingDays, requestedDays: validity.requestedDays },
        );
  }
  const now = input.now ?? new Date();
  const expiresAt = quoteExpiresAt(validity.days, now);
  const note = input.note && input.note.trim().length > 0 ? input.note.trim() : null;
  const { quote, serviceName } = ctx;

  if (quote.status === "requested") {
    const [row] = await db
      .update(serviceQuotes)
      .set({
        status: "quoted",
        amountCents: input.amountCents,
        currency: SERVICE_QUOTE_CURRENCY,
        note,
        quotedBy: input.actorUserId,
        quotedAt: now,
        expiresAt,
        updatedAt: now,
      })
      .where(and(eq(serviceQuotes.id, quote.id), eq(serviceQuotes.status, "requested")))
      .returning();
    if (!row) return refuse(409, "lost_race", "The request changed while you were quoting it; reload and try again.");
    return { ok: true, quote: presentQuote(row, serviceName, now) };
  }

  if (quote.status === "quoted") {
    try {
      const inserted = await db.transaction(async (tx) => {
        const [fresh] = await tx
          .insert(serviceQuotes)
          .values({
            serviceId: quote.serviceId,
            travelerId: quote.travelerId,
            position: sql<number>`(SELECT COALESCE(MAX(${serviceQuotes.position}), 0) + 1 FROM ${serviceQuotes} WHERE ${serviceQuotes.serviceId} = ${quote.serviceId} AND ${serviceQuotes.travelerId} = ${quote.travelerId})`,
            status: "quoted",
            amountCents: input.amountCents,
            currency: SERVICE_QUOTE_CURRENCY,
            requestNote: quote.requestNote,
            note,
            quotedBy: input.actorUserId,
            quotedAt: now,
            expiresAt,
          })
          .returning();
        // §15: the statement is the guard. If the traveler accepted the old offer between our read
        // and this write, ZERO rows match and the whole re-quote rolls back — an accepted quote is
        // never superseded out from under its booking.
        const superseded = await tx
          .update(serviceQuotes)
          .set({ status: "superseded", supersededBy: fresh.id, updatedAt: now })
          .where(
            and(
              eq(serviceQuotes.id, quote.id),
              eq(serviceQuotes.status, "quoted"),
              sql`${serviceQuotes.acceptedAt} IS NULL`,
              sql`${serviceQuotes.supersededBy} IS NULL`,
            ),
          )
          .returning({ id: serviceQuotes.id });
        if (superseded.length === 0) throw new LostRace();
        return fresh;
      });
      return { ok: true, quote: presentQuote(inserted, serviceName, now), supersededQuoteId: quote.id };
    } catch (err: unknown) {
      if (err instanceof LostRace || (err as { code?: string })?.code === "23505") {
        return refuse(409, "lost_race", "The quote changed while you were re-quoting it; reload and try again.");
      }
      throw err;
    }
  }

  return refuse(409, "wrong_status", `A ${quote.status} quote cannot be quoted again.`);
}

class LostRace extends Error {}

// ─── WITHDRAW (owner) / DECLINE (traveler) ────────────────────────────────────────────────────

export interface QuoteTransitionResult {
  ok: true;
  quote: ServiceQuoteView;
}

/** The owner takes an open offer (or an unanswered request) back. Terminal; never reused. */
export async function withdrawQuote(input: {
  quoteId: string;
  actorUserId: string;
  now?: Date;
}): Promise<QuoteTransitionResult | QuoteRefusal> {
  const ctx = await loadQuote(input.quoteId);
  if (!ctx || ctx.ownerUserId !== input.actorUserId) return NOT_FOUND();
  const now = input.now ?? new Date();
  const [row] = await db
    .update(serviceQuotes)
    .set({ status: "withdrawn", withdrawnAt: now, updatedAt: now })
    .where(
      and(
        eq(serviceQuotes.id, ctx.quote.id),
        sql`${serviceQuotes.status} IN ('requested', 'quoted')`,
        sql`${serviceQuotes.acceptedAt} IS NULL`,
      ),
    )
    .returning();
  if (!row) return refuse(409, "wrong_status", `A ${ctx.quote.status} quote cannot be withdrawn.`);
  return { ok: true, quote: presentQuote(row, ctx.serviceName, now) };
}

/** The traveler says no to an offer. Terminal — it is their answer and is never re-offered automatically. */
export async function declineQuote(input: {
  quoteId: string;
  travelerId: string;
  now?: Date;
}): Promise<QuoteTransitionResult | QuoteRefusal> {
  const ctx = await loadQuote(input.quoteId);
  if (!ctx || ctx.quote.travelerId !== input.travelerId) return NOT_FOUND();
  const now = input.now ?? new Date();
  const [row] = await db
    .update(serviceQuotes)
    .set({ status: "declined", declinedAt: now, updatedAt: now })
    .where(
      and(
        eq(serviceQuotes.id, ctx.quote.id),
        eq(serviceQuotes.status, "quoted"),
        sql`${serviceQuotes.acceptedAt} IS NULL`,
      ),
    )
    .returning();
  if (!row) return refuse(409, "wrong_status", `A ${ctx.quote.status} quote cannot be declined.`);
  return { ok: true, quote: presentQuote(row, ctx.serviceName, now) };
}

// ─── ACCEPT (traveler; the claim, then the mint through the EXISTING writer) ─────────────────

export interface AcceptQuoteResult {
  ok: true;
  quote: ServiceQuoteView;
  bookingId: string;
  /** false when this call found the quote already accepted and minted — the SAME booking is returned. */
  minted: boolean;
}

/** Say WHY the claim matched zero rows, from the row as it stands (§13 — never one bare refusal). */
function explainUnclaimable(row: ServiceQuote, now: Date): QuoteRefusal {
  const lifecycle = quoteLifecycle(row, now);
  switch (lifecycle) {
    case "expired": {
      const when = iso(row.expiresAt);
      return refuse(
        409,
        "quote_expired",
        `This quote expired${when ? ` on ${when}` : ""}. Ask the provider for a new one.`,
        when ? { expiresAt: when } : {},
      );
    }
    case "withdrawn":
      return refuse(409, "quote_withdrawn", "The provider withdrew this quote.");
    case "declined":
      return refuse(409, "quote_declined", "You declined this quote; ask the provider for a new one.");
    case "superseded":
      return refuse(409, "quote_superseded", "A newer quote replaced this one; accept that one instead.");
    case "requested":
      return refuse(409, "not_yet_quoted", "The provider has not quoted this request yet.");
    default:
      return refuse(409, "wrong_status", `A ${row.status} quote cannot be accepted.`);
  }
}

/**
 * The traveler accepts a quote inside its window, and the booking is minted.
 *
 * Under `SELECT … FOR UPDATE` on the quote row (see header rule 3):
 *   1. the CLAIM — an atomic conditional with the expiry in its WHERE clause (rule 2);
 *   2. the MINT — `storage.createServiceBookingAtomic`, the existing birth-rail writer, with the
 *      quote's amount as the server-derived total (§14), the `fee_bands` share through the ONE
 *      resolver, and the listing's deposit config through the ONE deposit derivation fed the quoted
 *      amount as the line total (brief §3);
 *   2b. Ledger `2026-09-19-quote-plan-link`: WHEN THE QUOTE NAMES A PLAN, the link rides along —
 *      `trip_id` onto the booking (a plain column) and `booking_details.itineraryItemId` by a
 *      direct UPDATE (`createServiceBookingAtomic` would silently strip that key from its own
 *      `bookingDetails` param, §19d), and the linked item is routed `in_planning ->
 *      ready_for_checkout` so the EXISTING paid promotion's `markItemPurchased` can flip it later
 *      with no new call site (LD 39). The cart's derived `cart_items` projection is reconciled
 *      through `syncItemProjection` AFTER this transaction commits — best-effort, never allowed to
 *      fail the accept (§15b).
 *   3. the STAMP — `booking_id` on the quote row.
 * A second concurrent call waits on the lock, then reads `accepted` + `booking_id` and returns the
 * same booking with `minted: false`. A claim that matches zero rows is explained from the row.
 */
export async function acceptQuote(input: {
  quoteId: string;
  travelerId: string;
}): Promise<AcceptQuoteResult | QuoteRefusal> {
  // Ledger `2026-09-19-quote-plan-link`: the linked item, captured INSIDE the transaction below
  // but synced OUTSIDE it (§15b — a projection failure must never fail the accept, and
  // `syncItemProjection` reads through the plain `db`, so it must run only after the routing flip
  // and the booking link actually COMMIT, never against a row still mid-transaction).
  let linkedItemToSync: string | null = null;

  const result: AcceptQuoteResult | QuoteRefusal = await db.transaction(async (tx): Promise<AcceptQuoteResult | QuoteRefusal> => {
    const locked = await tx.execute(sql`
      SELECT q.*, s.user_id AS owner_user_id, s.service_name
      FROM service_quotes q
      JOIN provider_services s ON s.id = q.service_id
      WHERE q.id = ${input.quoteId}
      FOR UPDATE OF q
    `);
    const raw = locked.rows[0] as Record<string, unknown> | undefined;
    if (!raw || raw.traveler_id !== input.travelerId) return NOT_FOUND();
    const serviceName = (raw.service_name as string | null) ?? null;
    const now = new Date();

    // Already accepted and minted (by an earlier call, or by the call this one waited behind):
    // the same single effect, handed back (§15).
    if (raw.status === "accepted" && raw.booking_id) {
      const [row] = await tx.select().from(serviceQuotes).where(eq(serviceQuotes.id, input.quoteId));
      return { ok: true, minted: false, bookingId: String(raw.booking_id), quote: presentQuote(row, serviceName, now) };
    }

    // 1 · THE CLAIM. The statement is the guard; `expires_at > NOW()` is enforced by the transition.
    const claimed = await tx
      .update(serviceQuotes)
      .set({ status: "accepted", acceptedAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(
        and(
          eq(serviceQuotes.id, input.quoteId),
          eq(serviceQuotes.travelerId, input.travelerId),
          eq(serviceQuotes.status, "quoted"),
          sql`${serviceQuotes.acceptedAt} IS NULL`,
          sql`${serviceQuotes.supersededBy} IS NULL`,
          sql`${serviceQuotes.expiresAt} > NOW()`,
        ),
      )
      .returning();
    let quote: ServiceQuote | undefined = claimed[0];
    if (!quote) {
      const [current] = await tx.select().from(serviceQuotes).where(eq(serviceQuotes.id, input.quoteId));
      if (!current) return NOT_FOUND();
      // The one state the claim cannot match that is NOT a refusal: accepted earlier, but the
      // booking_id stamp never landed (a mint that committed on its own connection just before a
      // crash). Re-drive the mint for the same traveler; the lock serializes it.
      if (current.status === "accepted" && !current.bookingId && current.acceptedAt) {
        quote = current;
      } else {
        return explainUnclaimable(current, now);
      }
    }
    if (quote.amountCents === null || quote.amountCents === undefined) {
      // Cannot happen for a `quoted` row by construction; stated rather than minted at $0 (§13).
      return refuse(409, "not_yet_quoted", "This quote carries no amount and cannot be accepted.");
    }

    // 2 · THE MINT, through the EXISTING writer (§18 rule 1). Amount from the ROW (§14).
    const service = await storage.getProviderServiceById(quote.serviceId);
    if (!service) return refuse(404, "listing_not_found", "Listing not found.");
    const totalAmount = centsToAmount(quote.amountCents);
    const amountNum = quote.amountCents / 100;
    const owner = service.userId ? await storage.getUser(service.userId) : undefined;
    // §8/ruling 42: the split comes from fee_bands through the one existing resolver — the SAME call
    // `POST /api/bookings` makes. A null resolution leaves the derived columns at their DB defaults
    // rather than inventing a rate.
    const ownerShareRate = await resolveServiceOwnerShareRate({
      ownerUserId: service.userId ?? null,
      ownerIsProvider: isProviderRole(owner?.role),
      feeCategory: service.categoryId
        ? (await storage.getServiceCategorySlugsByIds([service.categoryId]))[0]?.slug ?? null
        : null,
    });
    // The listing's deposit config, UNCHANGED, fed the quoted amount as the line total (brief §3).
    // `null` (deposits off, or a deposit that would be the whole quote) ⇒ full charge, columns NULL.
    const depositPlan = resolveDepositPlan(
      {
        depositEnabled: (service as { depositEnabled?: boolean | null }).depositEnabled,
        depositType: (service as { depositType?: string | null }).depositType,
        depositPercentage: (service as { depositPercentage?: number | null }).depositPercentage,
        depositFlatAmount: (service as { depositFlatAmount?: string | number | null }).depositFlatAmount,
      },
      amountNum,
    );
    const booking = await storage.createServiceBookingAtomic({
      serviceId: service.id,
      travelerId: input.travelerId,
      providerId: service.userId,
      // The same UNPAID state `POST /api/bookings` births. The charge is a separate lane (header).
      status: "pending",
      totalAmount,
      // Ledger `2026-09-19-quote-plan-link`: the SAME spelling the cart rail uses
      // (payments.routes.ts:1976). A plain column, never a SERVER_AUTHORED_BOOKING_DETAIL_KEY, so
      // it rides this writer untouched — unlike `bookingDetails.itineraryItemId` below.
      ...(quote.tripId ? { tripId: quote.tripId } : {}),
      ...(ownerShareRate !== null
        ? {
            platformFee: (amountNum * (1 - ownerShareRate)).toFixed(2),
            providerEarnings: (amountNum * ownerShareRate).toFixed(2),
          }
        : {}),
      ...(depositPlan
        ? {
            depositAmount: depositPlan.depositAmount.toFixed(2),
            balanceAmount: depositPlan.balanceAmount.toFixed(2),
          }
        : {}),
      ...(quote.requestNote ? { bookingDetails: { notes: quote.requestNote } } : {}),
    } as Parameters<typeof storage.createServiceBookingAtomic>[0]);

    // Ledger `2026-09-19-quote-plan-link`: copy `itinerary_item_id` onto the booking's
    // `booking_details` (the SAME spelling the cart rail uses, payments.routes.ts:1997) and route
    // the linked item into `ready_for_checkout` — both inside THIS transaction, the same posture
    // `claimQuoteBornBooking` already takes for `booking_details.travelerCharge`:
    // `createServiceBookingAtomic` would SILENTLY STRIP `itineraryItemId` if it were passed
    // through its own `bookingDetails` param (§19d layer 2, correctly — that writer is the
    // client-facing birth rail), so this is a direct, server-composed UPDATE instead, never a
    // client-supplied value.
    if (quote.itineraryItemId && quote.tripId) {
      await tx.execute(sql`
        UPDATE service_bookings
           SET booking_details = COALESCE(booking_details, '{}'::jsonb)
                 || jsonb_build_object('itineraryItemId', ${quote.itineraryItemId}::text),
               updated_at = NOW()
         WHERE id = ${booking.id}
      `);

      // The `in_planning -> ready_for_checkout` edge (ROUTING_STATE_CONTRACT §1), guarded exactly
      // as `routing.routes.ts` guards every other traveler-driven crossing of it: the accept IS
      // the traveler's purchase intent for this item. LD 39: the routing state is the source of
      // truth here, not `cart_items` — `syncItemProjection` (called after commit, below) is the
      // derived VIEW, and its own failure must never undo this flip or fail the accept.
      const flipped = await tx.execute(sql`
        UPDATE itinerary_items
           SET routing_status = 'ready_for_checkout', updated_at = NOW()
         WHERE id = ${quote.itineraryItemId}
           AND trip_id = ${quote.tripId}
           AND routing_status = 'in_planning'
        RETURNING id
      `);
      if (flipped.rows.length === 1) {
        linkedItemToSync = quote.itineraryItemId;
      } else {
        // 0 rows: the traveler routed the item elsewhere between request and accept (or it is
        // already ready_for_checkout/purchased/with_expert). The booking still stands — it is the
        // money truth (item-routing.service.ts's own posture) — logged, never fatal (§15b).
        logger.warn(
          { quoteId: quote.id, itemId: quote.itineraryItemId, tripId: quote.tripId },
          "accept-quote: linked item was not in_planning at accept time; routing left untouched",
        );
      }
    }

    // 3 · THE STAMP, in the same transaction as the claim.
    const [stamped] = await tx
      .update(serviceQuotes)
      .set({ bookingId: booking.id, updatedAt: sql`NOW()` })
      .where(eq(serviceQuotes.id, quote.id))
      .returning();
    return { ok: true, minted: true, bookingId: booking.id, quote: presentQuote(stamped, serviceName, now) };
  });

  // Ledger `2026-09-19-quote-plan-link`: the cart's derived view, reconciled AFTER commit — best
  // effort, never allowed to fail the (already-committed) accept (§15b).
  if (linkedItemToSync) {
    try {
      await syncItemProjection(linkedItemToSync);
    } catch (err) {
      logger.error(
        { err, itemId: linkedItemToSync },
        "accept-quote: cart projection sync failed after linking the plan item (re-runnable)",
      );
    }
  }

  return result;
}
