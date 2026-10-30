/**
 * Provider Accept payout block (row 292a).
 *
 * Architect rulings, Oct 29, 2026:
 *   (1) gross is the amount the traveler is charged. A purchase-time split already
 *       stored on the row is served as stored. The fee band is read only when that
 *       split is absent, and only then is the result snapshotted at accept.
 *   (2) A per-provider override is allowed. settingId is null for that source.
 *   (3) Accept does not compare a client id or rate. There is no stale refusal.
 *   (4) The snapshot column is service_bookings.payout_snapshot.
 *   (5) The provider status route only. The expert route is not this function's caller.
 *   (6) Currency is the booking's stored charge, else PLATFORM_CURRENCY. No currency literal.
 *
 * Earnings on the computed path are gross minus the platform fee. Stripe processing
 * cost is not applied. No rate literal and no fallback rate: the only rate source
 * is resolveProviderRate, which throws when nothing resolves.
 */
import { sql } from "drizzle-orm";
import { paidChargeOf } from "@shared/payment-on-record";
import { db } from "../db";
import {
  BandResolutionError,
  resolveProviderRate,
  round2,
} from "./fee-resolution.service";
import { travelerFeeChargedOf } from "./refund-breakdown";
import { travelerChargeForRow } from "./traveler-charge";

export const FEE_SETTING_UNRESOLVED = "fee_setting_unresolved" as const;

export type PayoutSource = "fee_band" | "provider_override";

export interface ProviderPayoutBlock {
  /** Amount the traveler is charged, as shown to the traveler. */
  gross: number;
  /** Platform fee amount. */
  fee: number;
  /** What the provider keeps. */
  keep: number;
  /** Fraction from the fee band or the provider override. */
  rate: number;
  currency: string;
  source: PayoutSource;
  /** fee_bands.id, or null for a provider override and for a stored split that named no band. */
  settingId: string | null;
}

export type PayoutBlockDecision =
  | { kind: "block"; block: ProviderPayoutBlock; writeSnapshot: boolean }
  | { kind: "unresolved" }
  | { kind: "omit" };

export interface PayoutBookingRow {
  providerId?: string | null;
  serviceId?: string | null;
  totalAmount?: string | number | null;
  platformFee?: string | number | null;
  insuranceFee?: string | number | null;
  providerEarnings?: string | number | null;
  stripePaymentIntentId?: string | null;
  stripeDepositIntentId?: string | null;
  stripeBalanceIntentId?: string | null;
  bookingDetails?: unknown;
  payoutSnapshot?: unknown;
}

/** True only for PATCH /api/provider/bookings/:id/status. The expert alias does not match. */
export function isProviderBookingStatusRequest(req: { originalUrl?: string; url?: string }): boolean {
  const re = /\/api\/provider\/bookings\/[^/?]+\/status(?:\?|$)/;
  return re.test(req.originalUrl || "") || re.test(req.url || "");
}

function money(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? round2(n) : null;
}

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

/**
 * A purchase-time split is provider_earnings being present. That column has no
 * default, so NULL means the row was never given a split. platform_fee's column
 * default is not a split by itself.
 */
function storedSplit(booking: PayoutBookingRow): { fee: number; keep: number } | null {
  if (booking.providerEarnings == null || String(booking.providerEarnings).trim() === "") return null;
  const keep = money(booking.providerEarnings);
  const fee = money(booking.platformFee);
  if (keep == null || fee == null) return null;
  return { fee, keep };
}

/** The traveler's charge. The paid stamp wins; otherwise the one charge composition. */
function travelerGross(booking: PayoutBookingRow): number | null {
  const paid = paidChargeOf(booking.bookingDetails);
  if (paid && paid.amount != null && Number.isFinite(paid.amount)) return round2(paid.amount);
  const details = booking.bookingDetails;
  const charge =
    details && typeof details === "object"
      ? (details as Record<string, unknown>).travelerCharge
      : null;
  const concierge =
    charge && typeof charge === "object"
      ? (charge as Record<string, unknown>).conciergeFee
      : null;
  const base = travelerChargeForRow({
    totalAmount: booking.totalAmount ?? null,
    platformFee: booking.platformFee ?? null,
    conciergeFeeSnapshot: concierge as string | number | null,
    insuranceFee: booking.insuranceFee ?? null,
  });
  if (!Number.isFinite(base.amount)) return null;
  return round2(base.amount + travelerFeeChargedOf(booking.bookingDetails));
}

function railsRecorded(details: unknown): boolean {
  if (!details || typeof details !== "object") return false;
  const rails = (details as Record<string, unknown>).railsAttribution;
  if (!rails || typeof rails !== "object") return false;
  const row = rails as Record<string, unknown>;
  if (row.attributed === true) return true;
  const rate = row.rate;
  return !!rate && typeof rate === "object" && (rate as Record<string, unknown>).railsApplied === true;
}

/** The rate the purchase already recorded on the row. Not a new resolution. */
function recordedRate(details: unknown): { rate: number; source: PayoutSource; settingId: string | null } | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  const direct = d.directRateResolution;
  const rails = d.railsAttribution;
  const directRate = direct && typeof direct === "object" ? (direct as Record<string, unknown>).rate : null;
  const railsRate = rails && typeof rails === "object" ? (rails as Record<string, unknown>).rate : null;
  const rate =
    directRate && typeof directRate === "object" && typeof (directRate as Record<string, unknown>).platformRate === "number"
      ? (directRate as Record<string, unknown>)
      : railsRate && typeof railsRate === "object" && typeof (railsRate as Record<string, unknown>).platformRate === "number"
        ? (railsRate as Record<string, unknown>)
        : null;
  if (!rate || typeof rate.platformRate !== "number" || !Number.isFinite(rate.platformRate)) return null;
  const override = rate.rateSource === "entity_override";
  const bandId = typeof rate.bandId === "string" && rate.bandId.trim() ? rate.bandId.trim() : null;
  return {
    rate: rate.platformRate,
    source: override ? "provider_override" : "fee_band",
    settingId: override ? null : bandId,
  };
}

function blockFromSnapshot(raw: unknown): ProviderPayoutBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.source !== "fee_band" && s.source !== "provider_override") return null;
  const gross = money(s.gross);
  const fee = money(s.fee);
  const keep = money(s.keep);
  const rate = typeof s.rate === "number" && Number.isFinite(s.rate) ? s.rate : null;
  const currency = text(s.currency);
  if (gross == null || fee == null || keep == null || rate == null || !currency) return null;
  if (s.settingId != null && typeof s.settingId !== "string") return null;
  return {
    gross,
    fee,
    keep,
    rate,
    currency,
    source: s.source,
    settingId: s.source === "provider_override" ? null : (typeof s.settingId === "string" ? s.settingId : null),
  };
}

async function currencyFromStoredCharge(booking: PayoutBookingRow): Promise<string | null> {
  const ids = [booking.stripePaymentIntentId, booking.stripeDepositIntentId, booking.stripeBalanceIntentId]
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  for (const id of ids) {
    const res = await db.execute(sql`
      SELECT currency FROM payment_intents
       WHERE stripe_payment_intent_id = ${id}
         AND currency IS NOT NULL
         AND btrim(currency) <> ''
       LIMIT 1
    `);
    const currency = text((res.rows?.[0] as { currency?: unknown } | undefined)?.currency);
    if (currency) return currency;
  }
  const details = booking.bookingDetails;
  if (details && typeof details === "object") {
    const paid = (details as Record<string, unknown>).paidCharge;
    if (paid && typeof paid === "object") {
      const currency = text((paid as Record<string, unknown>).currency);
      if (currency) return currency;
    }
  }
  return text(process.env.PLATFORM_CURRENCY);
}

async function categoryIdFor(
  booking: PayoutBookingRow,
  opts?: { categoryId?: string | null },
): Promise<string | null> {
  if (opts && Object.prototype.hasOwnProperty.call(opts, "categoryId")) return opts.categoryId ?? null;
  if (!booking.serviceId) return null;
  const res = await db.execute(sql`
    SELECT category_id FROM provider_services WHERE id = ${booking.serviceId} LIMIT 1
  `);
  const id = (res.rows?.[0] as { category_id?: unknown } | undefined)?.category_id;
  return typeof id === "string" && id.trim() ? id : null;
}

function storedBlock(
  booking: PayoutBookingRow,
  split: { fee: number; keep: number },
  currency: string,
): PayoutBlockDecision {
  const gross = travelerGross(booking);
  if (gross == null || gross < 0) return { kind: "omit" };
  const recorded = recordedRate(booking.bookingDetails);
  // No new resolution. A row that already recorded its rate keeps that fraction.
  // A row that recorded only the dollar split states the fee's share of the charge.
  const rate = recorded?.rate ?? (gross > 0 ? split.fee / gross : null);
  if (rate == null || !Number.isFinite(rate)) return { kind: "omit" };
  return {
    kind: "block",
    writeSnapshot: false,
    block: {
      gross,
      fee: split.fee,
      keep: split.keep,
      rate,
      currency,
      source: recorded?.source ?? "fee_band",
      settingId: recorded?.settingId ?? null,
    },
  };
}

/**
 * The block for one booking.
 * A snapshot already on the row is served as stored.
 * A purchase-time split is served as stored and is not re-resolved.
 * Otherwise the block is computed from resolveProviderRate. Nothing resolved,
 * or no currency, is `unresolved` (the provider accept refuses). `omit` is a
 * stored split that cannot be shown; accept of that row still proceeds.
 */
export async function resolvePayoutBlock(
  booking: PayoutBookingRow,
  opts?: { categoryId?: string | null },
): Promise<PayoutBlockDecision> {
  const snap = blockFromSnapshot(booking.payoutSnapshot);
  if (snap) return { kind: "block", block: snap, writeSnapshot: false };

  const currency = await currencyFromStoredCharge(booking);
  const split = storedSplit(booking);
  if (split) {
    if (!currency) return { kind: "omit" };
    return storedBlock(booking, split, currency);
  }
  if (!currency) return { kind: "unresolved" };

  const gross = travelerGross(booking);
  if (gross == null || gross < 0) return { kind: "unresolved" };

  try {
    const resolved = await resolveProviderRate({
      categoryId: await categoryIdFor(booking, opts),
      providerId: booking.providerId ?? null,
      isRails: railsRecorded(booking.bookingDetails),
    });
    const rate = resolved.platformRate;
    if (!Number.isFinite(rate)) return { kind: "unresolved" };
    const fee = round2(gross * rate);
    const keep = round2(gross - fee);
    const override = resolved.rateSource === "entity_override";
    return {
      kind: "block",
      writeSnapshot: true,
      block: {
        gross,
        fee,
        keep,
        rate,
        currency,
        source: override ? "provider_override" : "fee_band",
        settingId: override ? null : resolved.bandId,
      },
    };
  } catch (err) {
    if (err instanceof BandResolutionError) return { kind: "unresolved" };
    throw err;
  }
}
