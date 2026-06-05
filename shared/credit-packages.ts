/**
 * Canonical credit packages (LB-P5a).
 *
 * Single source of truth — previously defined in 5 places (server/routes.ts,
 * server/routes/payments.routes.ts, client/src/pages/{pricing,credits,
 * credits-billing}.tsx) with three different shapes and one different price
 * ladder. Server consumers use { id, credits, price }; client consumers use
 * the richer shape with display metadata (popular, savings, features).
 *
 * Long-term home: until a credit_packages DB table exists (Phase 2 FEE
 * workstream), this constants file is the contract. Admin UI + DB-backed
 * config will replace it.
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
