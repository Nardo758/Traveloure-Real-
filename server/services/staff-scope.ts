/**
 * staff-scope.ts — the ONE market-scope predicate for staff (slice 0, Addendum A v2).
 *
 * The blanket `/api/admin` guard decides WHICH routes a role may reach (shared/staff-permissions.ts). This file decides
 * WHICH ROWS a market-scoped role (regional_manager, moderator) may act on: the row's market must be one of the
 * person's live `staff_market_assignments`. owner and platform_admin (and the `admin` alias) act everywhere.
 *
 * A row outside scope gets ONE 404 — "no such thing" and "not yours" are the same answer (LD 40). An empty scope acts
 * on nothing (§13: never "all"). A row whose market does not resolve is in no market, so a scoped role never acts on
 * it, and nothing is guessed (Phase 0 F3). A second copy of this predicate is the §18-rule-1 drift.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { providerServices, serviceProviderForms, staffMarketAssignments } from "@shared/schema";
import { isAdminRole, isMarketScopedRole } from "@shared/roles";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { resolveMarketSlug } from "./trend-engine/operating-markets";

export const OPERATING_MARKET_KEYS: readonly string[] = OPERATING_MARKETS.map((m) => m.marketKey);

export function isOperatingMarketKey(v: unknown): v is string {
  return typeof v === "string" && OPERATING_MARKET_KEYS.includes(v);
}

export interface StaffActor {
  id: string;
  role: string | null | undefined;
}

/** A person's live market grants (revoked rows excluded), sorted. */
export async function assignedMarkets(userId: string): Promise<string[]> {
  const rows = await db
    .select({ market: staffMarketAssignments.marketSlug })
    .from(staffMarketAssignments)
    .where(and(eq(staffMarketAssignments.userId, userId), isNull(staffMarketAssignments.revokedAt)));
  return Array.from(new Set(rows.map((r) => r.market))).sort();
}

/**
 * The markets an actor may act in: `"all"` for owner/platform_admin, the assigned list for a market-scoped role, and
 * an empty list for anyone else.
 */
export async function actorMarketScope(actor: StaffActor): Promise<"all" | string[]> {
  if (isAdminRole(actor.role)) return "all";
  if (isMarketScopedRole(actor.role)) return assignedMarkets(actor.id);
  return [];
}

/** Pure: may an actor whose scope is `scope` act on a row in `market`? */
export function scopeCovers(scope: "all" | readonly string[], market: string | null | undefined): boolean {
  if (scope === "all") return true;
  if (!market) return false;
  return scope.includes(market);
}

/** THE predicate: may this actor act on a row whose market is `market`? */
export async function staffMayActOn(actor: StaffActor, market: string | null | undefined): Promise<boolean> {
  return scopeCovers(await actorMarketScope(actor), market);
}

/** A provider form's market: its declared city, resolved; nothing else. */
export function marketForProviderFormRow(row: { city?: string | null } | null | undefined): string | null {
  if (!row) return null;
  return resolveMarketSlug(row.city ?? null);
}

/** A listing's market: its location, resolved; else its owner's provider-form city. Unresolved ⇒ null. */
export async function marketForListing(serviceId: string): Promise<string | null> {
  const [svc] = await db
    .select({ location: providerServices.location, userId: providerServices.userId })
    .from(providerServices)
    .where(eq(providerServices.id, serviceId))
    .limit(1);
  if (!svc) return null;
  const fromLocation = resolveMarketSlug(svc.location ?? null);
  if (fromLocation) return fromLocation;
  const [form] = await db
    .select({ city: serviceProviderForms.city })
    .from(serviceProviderForms)
    .where(eq(serviceProviderForms.userId, svc.userId))
    .limit(1);
  return marketForProviderFormRow(form ?? null);
}

/** A provider form's market, by the form's id. */
export async function marketForProviderForm(formId: string): Promise<string | null> {
  const [form] = await db
    .select({ city: serviceProviderForms.city })
    .from(serviceProviderForms)
    .where(eq(serviceProviderForms.id, formId))
    .limit(1);
  return marketForProviderFormRow(form ?? null);
}
