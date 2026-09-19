/**
 * SERVICE QUOTES — the vocabulary, the pure lifecycle reading, and the two admission allowlists.
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-28 / D-29 / D-30 / D-31, all option A; ledger
 * `2026-09-15-d28-d31-service-quotes`). Content of record: `docs/design/CUSTOM_QUOTE_BRIEF.md`.
 *
 * A custom quote is a REAL OBJECT with an EXPIRY (`service_quotes`, migration 305): the provider
 * issues a quoted amount with an explicit `expires_at`, the traveler accepts inside the window
 * through an atomic claim whose WHERE clause carries the expiry (§15), and acceptance mints the
 * `service_bookings` row with the quote's amount as the SERVER-derived total (§14). An expired
 * quote is RE-QUOTED — a new row, `superseded_by` on the old — never silently honoured and never
 * silently refused.
 *
 * WHAT LIVES HERE, and why in `shared/`:
 *   · the STATUS VOCABULARY — `service_quotes.status` is `varchar(20)` with NO DB CHECK (the LD
 *     44(e) publish-trap posture), so this list is the ONE authority on the legal values;
 *   · the LIFECYCLE reading — `expired` is DERIVED from `status = 'quoted' AND expires_at <= now`,
 *     never stored; a stored `expired` would be a second authority that disagrees with the column
 *     the moment a clock differs. Both the server's projection and a future client read it here
 *     (§18 rule 1 — one derivation);
 *   · the two `.strict()` pick-based ADMISSION schemas (§19). There is deliberately NO
 *     `createInsertSchema(serviceQuotes)` anywhere: under a denylist schema a privileged column is
 *     client-settable BY DEFAULT, and every column on this table that is not a note is privileged
 *     (`amount_cents`, `expires_at`, `accepted_at`, `superseded_by`, `booking_id`, `status`,
 *     `position`). The server writes them by explicit column, never from a parsed body.
 *
 * §13 — the absences are answers. `amount_cents` NULL = NOT YET QUOTED and is never rendered as
 * $0.00; `expires_at` NULL on a `requested` row = no offer exists yet, never "no deadline"; a
 * `withdrawn` (provider) and a `declined` (traveler) quote are different facts and are named
 * differently. Nothing here reads a fee, a rate or a band (§8).
 */
import { z } from "zod";

/** The app-enforced value set of `service_quotes.status` (no DB CHECK — see the header). */
export const SERVICE_QUOTE_STATUSES = [
  "requested",  // the traveler asked; no amount, no expiry yet
  "quoted",     // the provider issued an amount with an expiry; acceptable until `expires_at`
  "accepted",   // the traveler accepted inside the window; `booking_id` names the minted row
  "declined",   // the traveler said no — terminal, never re-offered automatically
  "withdrawn",  // the provider took the offer back — terminal, a different fact from declined
  "superseded", // a re-quote replaced it; `superseded_by` names the newer row
] as const;
export type ServiceQuoteStatus = (typeof SERVICE_QUOTE_STATUSES)[number];

/** Until a currency decision exists every quote is USD, and a quote is never converted (brief §6). */
export const SERVICE_QUOTE_CURRENCY = "USD";

/**
 * The upper bound of a Postgres INTEGER column — the COLUMN's limit, not a price rule. A quote
 * above it cannot be stored, so the admission schema refuses it with the bound stated rather than
 * letting the insert fail. This is not a fee, a rate or a cap on what a provider may charge.
 */
export const AMOUNT_CENTS_COLUMN_MAX = 2147483647;

/** What a reader may say about a quote: its stored status, or the ONE derived state. */
export type ServiceQuoteLifecycle = ServiceQuoteStatus | "expired";

/** The columns the lifecycle reading depends on. */
export interface QuoteLifecycleRow {
  status: string | null | undefined;
  expiresAt: Date | string | null | undefined;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The ONE lifecycle derivation. `expired` exists only here: a `quoted` row whose `expires_at` is
 * at or before `now`. Every other row reads as its stored status. A `quoted` row with NO
 * `expires_at` cannot exist by construction (the issue rail always derives one), so it is read as
 * `quoted` rather than guessed expired — an absent deadline is never invented (§13).
 */
export function quoteLifecycle(row: QuoteLifecycleRow, now: Date = new Date()): ServiceQuoteLifecycle {
  const status = (row.status ?? "requested") as ServiceQuoteLifecycle;
  if (status !== "quoted") return status;
  const expires = toDate(row.expiresAt);
  if (expires && expires.getTime() <= now.getTime()) return "expired";
  return "quoted";
}

/** Pure mirror of the accept claim's WHERE clause, for readers that want to say "acceptable". */
export function isQuoteAcceptable(
  row: QuoteLifecycleRow & { acceptedAt?: Date | string | null; supersededBy?: string | null },
  now: Date = new Date(),
): boolean {
  if (quoteLifecycle(row, now) !== "quoted") return false;
  if (row.acceptedAt) return false;
  if (row.supersededBy) return false;
  return true;
}

/** Integer cents to the `decimal(10,2)` string `service_bookings.total_amount` holds — exact. */
export function centsToAmount(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`centsToAmount: not a non-negative integer cent count: ${String(cents)}`);
  }
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  return `${dollars}.${rem < 10 ? "0" : ""}${rem}`;
}

/**
 * §19 — the ONE body a traveler's quote REQUEST may carry: their words, and — since migration
 * 314 (ledger `2026-09-19-quote-plan-link`) — the plan they are asking from. `.strict()` REFUSES
 * an unknown key rather than silently stripping it. There is deliberately no amount (a traveler
 * does not price a quote), no `serviceId` (the path names the listing) and no status.
 *
 * `tripId` and `itineraryItemId` are the same shape as every other client-supplied FOREIGN KEY on
 * this platform (LD 40 / `resolveItemEventLink` posture, §14): admission here proves only that a
 * non-empty string arrived, never that the trip is this traveler's or that the item belongs to
 * it. `resolveQuotePlanLink` (`server/services/quote-plan-link.service.ts`) does that verification
 * server-side; the route calls it, never trusting these fields beyond parsing. `itineraryItemId`
 * REQUIRES `tripId` — an item cannot be named without the plan it is on.
 */
export const quoteRequestBodySchema = z
  .object({
    note: z.string().trim().max(2000).nullish(),
    tripId: z.string().trim().min(1).nullish(),
    itineraryItemId: z.string().trim().min(1).nullish(),
  })
  .strict()
  .refine((v) => !(v.itineraryItemId && !v.tripId), {
    message: "itineraryItemId requires tripId.",
    path: ["itineraryItemId"],
  });
export type QuoteRequestBody = z.infer<typeof quoteRequestBodySchema>;

/**
 * §19 — the ONE body the listing OWNER's issue rail may carry. The amount is the provider's own
 * price for this traveler (owner business data, like `provider_services.price`); it is NOT a fee,
 * a rate or a band, and §14 binds it in the other direction — the TRAVELER's accept carries no
 * amount at all and reads it off the row the server wrote. `validityDays` is OPTIONAL and, when
 * present, is checked server-side against `QUOTE_VALIDITY_CEILING_DAYS` (refused with the number
 * stated, never silently clamped — D-29). `.strict()`: `expiresAt`, `status`, `travelerId`,
 * `position` and `bookingId` are not admissible under any spelling.
 */
export const quoteIssueBodySchema = z
  .object({
    amountCents: z.number().int().min(1).max(AMOUNT_CENTS_COLUMN_MAX),
    validityDays: z.number().int().min(1).optional(),
    note: z.string().trim().max(2000).nullish(),
  })
  .strict();
export type QuoteIssueBody = z.infer<typeof quoteIssueBodySchema>;

/**
 * §19 — the ONE body `POST /api/checkout`'s QUOTE-BORN ARM may carry (ledger
 * `2026-09-18-quote-born-charge`). `.strict()` REFUSES an unknown key rather than silently
 * stripping it, which is also what makes the two arms MUTUALLY EXCLUSIVE by construction: a cart
 * body's `idempotencyKey` / `tripId` / `notes` / `ref` cannot ride alongside `quoteBookingId`, and
 * a quote body cannot smuggle a cart term.
 *
 * §14 — there is deliberately NO amount, NO price, NO `userId`, NO quote id and NO deposit choice
 * here. The charge is composed from the BOOKING ROW the accept rail wrote, the actor is the
 * session, and whether a deposit applies was decided at accept time by `resolveDepositPlan`. The
 * only other key is the one-click preference, which is a PREFERENCE and not a money input — the
 * same field name `/api/checkout`'s cart arm and `/api/optimization-payments` already use.
 */
export const quoteCheckoutBodySchema = z
  .object({
    quoteBookingId: z.string().trim().min(1).max(128),
    useSavedCard: z.boolean().optional(),
  })
  .strict();
export type QuoteCheckoutBody = z.infer<typeof quoteCheckoutBodySchema>;
