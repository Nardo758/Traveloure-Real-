// CITY-1 (ledger `2026-11-04-city1-marquee-defaults`; Leon, Nov 3: "only the marquee market runs the full planner").
// The trip mint (POST /api/trips) refuses a destination whose OPERATING market is neither the marquee nor listed as
// live — 409 { code: "market_not_open", market }. Admin and QA-domain accounts pass, as at the waitlist purchase gate
// (waitlist-purchase-gate.ts), so the planner stays testable end to end. Existing trips are never touched.
// A destination that resolves to NO operating market is refused the same way, with `market: null` (Leon, Nov 4,
// 2026, on #1882) — the client then says "We're not planning in {city} yet", never a waitlist link.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { marketIsOpen } from "@shared/ticker";
import { getLaunchMarketSlug, getLiveMarketSlugs } from "./platform-flags";
import { isQaDomainAccount } from "./qa-trip-pass.service";
import { resolveMarketSlug } from "./trend-engine/operating-markets";
import { isAdminRole } from "@shared/roles";

export const MARKET_NOT_OPEN = "market_not_open" as const;

export type MarketOpenDecision = { allowed: true } | { allowed: false; code: typeof MARKET_NOT_OPEN; market: string | null };

/** Pure: may a plan be minted in `market` (null = the destination is no operating market)? */
export function decideMarketOpen(input: {
  market: string | null;
  launch: string | null;
  live: readonly string[];
  user: { role?: string | null; email?: string | null } | null | undefined;
  qaDomain: string | undefined;
}): MarketOpenDecision {
  if (input.market && marketIsOpen(input.market, { launch: input.launch, live: input.live, beta: [], dates: {} })) return { allowed: true };
  if (isAdminRole(input.user?.role)) return { allowed: true };
  if (isQaDomainAccount(input.user?.email ?? null, input.qaDomain)) return { allowed: true };
  return { allowed: false, code: MARKET_NOT_OPEN, market: input.market };
}

/** The decision for a signed-in user minting a plan for `destination`. */
export async function marketOpenDecisionFor(userId: string, destination: string | null | undefined): Promise<MarketOpenDecision> {
  const market = resolveMarketSlug(destination);
  const [launch, live] = await Promise.all([getLaunchMarketSlug(), getLiveMarketSlugs()]);
  if (market && marketIsOpen(market, { launch, live, beta: [], dates: {} })) return { allowed: true };
  const [user] = await db.select({ role: users.role, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return decideMarketOpen({ market, launch, live, user, qaDomain: process.env.QA_ACCOUNT_EMAIL_DOMAIN });
}
