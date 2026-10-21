/**
 * Saved payment methods — display fields only, mapped from Stripe.
 *
 * Ledger `2026-10-21-saved-method-list-and-express` (Leon Dixon, Oct 21, 2026).
 * The list is every type Stripe returns. A field Stripe did not send stays null.
 * Brand, last4, and expiry are never filled in with a stand-in.
 *
 * Apple Pay and Google Pay are cards whose wallet type is `apple_pay` or
 * `google_pay` (a device PAN, with a real brand and last4). Link is type `link`.
 */

export type SavedWallet = "apple_pay" | "google_pay";

export interface SavedPaymentMethod {
  id: string;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  wallet: SavedWallet | null;
  email: string | null;
}

/** Stripe's own product names for types we already know. An unknown type keeps its key with underscores as spaces. */
const PRODUCT_NAMES: Record<string, string> = {
  card: "Card",
  link: "Link",
  cashapp: "Cash App",
  us_bank_account: "US bank account",
  sepa_debit: "SEPA debit",
  paypal: "PayPal",
  amazon_pay: "Amazon Pay",
  klarna: "Klarna",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** A month or year of 0 is not an expiry Stripe displayed. Leave it null so the row does not say "Expires 00/0". */
function expiryOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function capBrand(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

/**
 * Map one Stripe PaymentMethod. Non-card last4 and email come only from that
 * type's own object (`pm[type]`), never from `pm.card`.
 */
export function mapStripePaymentMethod(raw: unknown): SavedPaymentMethod | null {
  const pm = asRecord(raw);
  if (!pm) return null;
  const id = stringOrNull(pm.id);
  if (!id) return null;
  const type = stringOrNull(pm.type) ?? "unknown";
  const card = type === "card" ? asRecord(pm.card) : null;
  const walletType = card ? stringOrNull(asRecord(card.wallet)?.type) : null;
  const wallet: SavedWallet | null =
    walletType === "apple_pay" || walletType === "google_pay" ? walletType : null;
  const own = type === "card" ? null : asRecord(pm[type]);
  return {
    id,
    type,
    brand: card ? stringOrNull(card.brand) : null,
    last4: card ? stringOrNull(card.last4) : own ? stringOrNull(own.last4) : null,
    expMonth: card ? expiryOrNull(card.exp_month) : null,
    expYear: card ? expiryOrNull(card.exp_year) : null,
    wallet,
    email: own ? stringOrNull(own.email) : null,
  };
}

/** "Visa ••4242", "Apple Pay · Visa ••4242", "Link · a@b.c", or the type name when the details are absent. */
export function savedPaymentMethodLabel(method: {
  type?: string | null;
  brand?: string | null;
  last4?: string | null;
  wallet?: string | null;
  email?: string | null;
}): string {
  const brand = method.brand ?? null;
  const last4 = method.last4 ?? null;
  const email = method.email ?? null;
  const type = method.type ?? (brand ? "card" : "unknown");
  const wallet = method.wallet === "apple_pay" || method.wallet === "google_pay" ? method.wallet : null;
  if (wallet === "apple_pay" || wallet === "google_pay") {
    const prefix = wallet === "apple_pay" ? "Apple Pay" : "Google Pay";
    if (brand && last4) return `${prefix} · ${capBrand(brand)} ••${last4}`;
    return prefix;
  }
  if (type === "card" && brand && last4) return `${capBrand(brand)} ••${last4}`;
  if (type === "link") return email ? `Link · ${email}` : "Link";
  const base = PRODUCT_NAMES[type] ?? type.replace(/_/g, " ");
  if (email) return `${base} · ${email}`;
  if (last4) return `${base} ••${last4}`;
  return base;
}

/**
 * Hide a Payment Element wallet only when the Express Checkout Element is already
 * showing it. A null report (the Express element failed to load) hides nothing,
 * so the Payment Element keeps the wallets it has today.
 */
export function paymentElementWalletsToHide(
  available: { applePay: boolean; googlePay: boolean } | null,
): { applePay?: "never"; googlePay?: "never" } | null {
  if (!available) return null;
  const hide: { applePay?: "never"; googlePay?: "never" } = {};
  if (available.applePay) hide.applePay = "never";
  if (available.googlePay) hide.googlePay = "never";
  return hide.applePay || hide.googlePay ? hide : null;
}

export function paymentElementOptions(
  hide: { applePay?: "never"; googlePay?: "never" } | null,
): { wallets: { applePay?: "never"; googlePay?: "never" } } | undefined {
  return hide ? { wallets: hide } : undefined;
}

/**
 * Express Checkout buttons for this sheet. PayPal stays off: the help center
 * already says the site does not accept it. Apple Pay, Google Pay, and Link
 * follow the device. `link` is `never` on the hold sheet (Smoke 13 #8).
 */
export function expressCheckoutPaymentMethods(link: "auto" | "never"): {
  applePay: "auto";
  googlePay: "auto";
  link: "auto" | "never";
  paypal: "never";
} {
  return { applePay: "auto", googlePay: "auto", link, paypal: "never" };
}
