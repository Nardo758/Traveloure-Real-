/**
 * The signed-in user's supply application, read once for the dashboard, the denial
 * page, and the listing write gate.
 *
 * Role is a DB lookup on the session user, never the session snapshot. The provider
 * row is the same current-row read `storage.getServiceProviderForm` already owns.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { localExpertForms, users } from "@shared/schema";
import { isEarnerRole } from "@shared/roles";
import {
  buildExpertApplicationTimeline,
  buildProviderApplicationTimeline,
  listingWriteRefusal,
  type ApplicationPhase,
  type ListingWriteIntent,
} from "@shared/application-status";

export interface SupplyAccount {
  kind: "expert" | "provider" | null;
  applicationStatus: string | null;
  phase: ApplicationPhase;
  phaseTitle: string;
  phaseDetail: string;
  currentStepId: number | null;
  canSaveDraftListing: boolean;
  publishesFreely: boolean;
}

function openness(status: string | null): number {
  if (status === "approved") return 2;
  if (status === "rejected") return 1;
  if (status === "deleted" || status === "deactivated") return 0;
  return 3;
}

function text(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function readSupplyAccount(userId: string): Promise<SupplyAccount> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  const role = user?.role ?? "user";
  const earner = isEarnerRole(role);

  const [expert] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, userId)).limit(1);
  // Same current-row order as storage.getServiceProviderForm (non-rejected first).
  const provider = await storage.getServiceProviderForm(userId);

  const sides: Array<{ kind: "expert" | "provider"; status: string | null; rank: number }> = [];
  if (expert) sides.push({ kind: "expert", status: expert.status ?? null, rank: openness(expert.status ?? null) });
  if (provider) sides.push({ kind: "provider", status: provider.status ?? null, rank: openness(provider.status ?? null) });
  sides.sort((a, b) => b.rank - a.rank);
  const chosen = sides[0] ?? null;
  // An earner publishes. An admin with no supply application publishes too
  // (the verification gate's staff case). An unapproved application does not
  // get that pass. A missing or closed form is not an unapproved application.
  const unapprovedSupply = chosen != null && chosen.rank > 0 && chosen.status !== "approved";
  const publishesFreely = earner || (role === "admin" && !unapprovedSupply);

  const empty: SupplyAccount = {
    kind: null,
    applicationStatus: null,
    phase: "not_started",
    phaseTitle: "Not started",
    phaseDetail: "Submit an application to open this page. Nothing is in review yet.",
    currentStepId: null,
    canSaveDraftListing: false,
    publishesFreely,
  };
  if (!chosen || chosen.rank === 0) return empty;

  const canSaveDraftListing = !publishesFreely && chosen.rank >= 2;
  if (chosen.kind === "expert" && expert) {
    const destinations = Array.isArray(expert.destinations) ? expert.destinations.length : 0;
    const specialties = Array.isArray(expert.specialties) ? expert.specialties.length : 0;
    const cityKnowledgeFacts = expert.expertType === "local_expert"
      ? await (await import("./city-knowledge/attempt.service")).timelineFactsForForm(expert)
      : {};
    const timeline = buildExpertApplicationTimeline({
      hasForm: true,
      applicationStatus: expert.status ?? null,
      destinationsCount: destinations,
      specialtiesCount: specialties,
      hasBio: text(expert.bio),
      hasPortfolio: text(expert.portfolio),
      identityStatus: expert.identityVerificationStatus ?? "pending",
      basicCompletedAt: expert.createdAt ? new Date(expert.createdAt).toLocaleDateString() : null,
      ...cityKnowledgeFacts,
    });
    return {
      kind: "expert",
      applicationStatus: expert.status ?? null,
      phase: timeline.phase,
      phaseTitle: timeline.phaseTitle,
      phaseDetail: timeline.phaseDetail,
      currentStepId: timeline.currentStepId,
      canSaveDraftListing,
      publishesFreely,
    };
  }

  if (provider) {
    const offers = provider.serviceOffers;
    const timeline = buildProviderApplicationTimeline({
      hasForm: true,
      applicationStatus: provider.status ?? null,
      hasServiceOffers: Array.isArray(offers) && offers.length > 0,
      hasOfferingTypeKey: text(provider.offeringTypeKey),
      hasDescription: text(provider.description),
      hasLocation: text(provider.country) || text(provider.city) || text(provider.address),
      identityStatus: provider.identityVerificationStatus ?? "pending",
      businessStatus: provider.businessVerificationStatus ?? "pending",
      basicCompletedAt: provider.createdAt ? new Date(provider.createdAt).toLocaleDateString() : null,
    });
    return {
      kind: "provider",
      applicationStatus: provider.status ?? null,
      phase: timeline.phase,
      phaseTitle: timeline.phaseTitle,
      phaseDetail: timeline.phaseDetail,
      currentStepId: timeline.currentStepId,
      canSaveDraftListing,
      publishesFreely,
    };
  }

  return empty;
}

/** Null when the write may proceed. A pending account may still save a draft. */
export async function refuseUnapprovedListingWrite(
  userId: string,
  write: ListingWriteIntent,
): Promise<{ status: 403; body: { message: string; code: string } } | null> {
  const account = await readSupplyAccount(userId);
  const decision = listingWriteRefusal(account, write);
  if (!decision) return null;
  return { status: 403, body: decision };
}
