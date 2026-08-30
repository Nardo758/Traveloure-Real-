/**
 * RETIRED (FP-3, decision-maker ratified): the credits system has been retired.
 * The per-use fee funnel (see /pricing's Pay-Per-Use section) plus saved-card
 * one-click checkout is the AI monetization model — credits had zero real
 * consumers (deductCredits had no callers). All BUY surfaces (client pages
 * `credits.tsx` / `credits-billing.tsx`, the "Credits" nav/CTA links, the
 * dashboard wallet-balance display) have been removed, and the server
 * purchase/grant endpoints (`POST /api/credits/purchase`,
 * `POST /api/wallet/add-credits`, `GET /api/wallet`, `GET /api/wallet/transactions`)
 * now return 410 Gone.
 *
 * This file is kept (not deleted) only because server code may still import
 * it; the `wallets` / `credit_transactions` tables and their storage methods
 * stay dormant per the roadmap (no migration, no drops). Do not add new
 * client imports of this file, and do not wire these packages back up
 * without a real decision-maker-approved monetization change.
 *
 * --- Original doc (historical, LB-P5a) ---
 * Canonical credit packages. Single source of truth — previously defined in
 * 5 places (server/routes.ts, server/routes/payments.routes.ts,
 * client/src/pages/{pricing,credits,credits-billing}.tsx) with three
 * different shapes and one different price ladder. Server consumers use
 * { id, credits, price }; client consumers used the richer shape with
 * display metadata (popular, savings, features).
 */

export interface CreditPackage {
  id: number;
  credits: number;
  price: number;            // USD
  popular?: boolean;
  savings?: string;         // e.g. "Save 11%" — display only
  features?: string[];      // bullet list shown on the pricing-style cards
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 1,
    credits: 50,
    price: 49,
    features: [
      "50 AI queries",
      "Basic expert access",
      "Email support",
    ],
  },
  {
    id: 2,
    credits: 100,
    price: 89,
    popular: true,
    savings: "Save 11%",
    features: [
      "100 AI queries",
      "Priority expert access",
      "Chat support",
      "Itinerary exports",
    ],
  },
  {
    id: 3,
    credits: 250,
    price: 199,
    savings: "Save 20%",
    features: [
      "250 AI queries",
      "VIP expert access",
      "Priority support",
      "Unlimited exports",
    ],
  },
  {
    id: 4,
    credits: 500,
    price: 349,
    savings: "Save 30%",
    features: [
      "500 AI queries",
      "VIP expert access",
      "Priority support",
      "Unlimited exports",
      "Early access to features",
    ],
  },
];
