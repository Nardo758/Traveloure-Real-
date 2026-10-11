/**
 * FD-1 — THE FREE-DRAFT CAP (decision-maker rulings, Oct 9, 2026; ledger `2026-10-09-fd1-free-draft-cap`;
 * brief docs/planning/briefs/fd-1-free-draft-cap.md; migration 363). The ONE writer of `free_draft_runs`.
 *
 *   · CLAIM before the model call (§15b): under a per-subject advisory lock, count the subject's counting runs
 *     in the window, refuse at the limit or a second run on the same plan (the partial UNIQUE is the backstop),
 *     else insert `claimed`. A paid-tier plan (`planGetsRoutedLegs`) is not a free draft and claims nothing;
 *     a QA account is exempt and makes no row; the count is the PLAN OWNER's, whoever pressed (ruling 5).
 *   · PROMOTE to `drafted` when the draft commits; RELEASE to `released` when it fails on OUR side (provider
 *     error, our exception — ruling 3), which never counts. Both are atomic conditionals on `status='claimed'`.
 *     A crash after the model call leaves `claimed`, which counts (ruling 3, recorded).
 *   · Guests count only on a SERVER guest record (ruling 6); none exists yet, so no guest rail calls this.
 */
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { freeDraftRuns, trips, users } from "@shared/schema";
import { decideFreeDraft, freeDraftSubject, type FreeDraftRail, type FreeDraftSubject } from "@shared/free-draft-cap";
import { freeDraftsPerGuest, freeDraftsPerWindow, freeDraftWindowDays } from "../config/free-draft.config";
import { isQaDomainAccount } from "./qa-trip-pass.service";

export type FreeDraftClaim =
  | { kind: "claimed"; runId: string; used: number; limit: number; windowDays: number }
  | { kind: "exempt" }
  | { kind: "not_free" }
  | { kind: "refused"; reason: "cap_reached"; used: number; limit: number; windowDays: number }
  | { kind: "refused"; reason: "plan_already_drafted" };

const COUNTING = ["claimed", "drafted"] as const;

function subjectLockKey(s: FreeDraftSubject): string {
  return s.kind === "user" ? `free-draft:user:${s.userId}` : `free-draft:guest:${s.guestKey}`;
}

async function planIsPaidTier(tripId: string | null): Promise<boolean> {
  if (!tripId) return false;
  const { tripGetsRoutedLegs } = await import("./routing/plan-routed-legs.service");
  return tripGetsRoutedLegs(tripId);
}

async function ownerIsQa(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return isQaDomainAccount(u?.email ?? null, process.env.QA_ACCOUNT_EMAIL_DOMAIN);
}

/**
 * Claim one free draft. `tripId` is the plan the draft is written into (null when the draft mints it);
 * `countedUserId` is the account counted when there is no plan yet (the requester, who will own what it
 * mints). With a plan, the plan's own `trips.user_id` is counted, whoever pressed (ruling 5).
 */
export async function claimFreeDraft(input: { rail: FreeDraftRail; tripId: string | null; countedUserId: string | null }): Promise<FreeDraftClaim> {
  let ownerId = input.countedUserId;
  if (input.tripId) {
    const [t] = await db.select({ userId: trips.userId }).from(trips).where(eq(trips.id, input.tripId)).limit(1);
    ownerId = t?.userId ?? ownerId;
  }
  const paid = await planIsPaidTier(input.tripId);
  const subject = freeDraftSubject({
    rail: input.rail,
    planOwnerId: ownerId,
    planIsPaidTier: paid,
    ownerIsQa: await ownerIsQa(ownerId),
  });
  if (!subject) return paid ? { kind: "not_free" } : { kind: "exempt" };
  const windowDays = freeDraftWindowDays();
  const limit = subject.kind === "user" ? freeDraftsPerWindow() : freeDraftsPerGuest();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${subjectLockKey(subject)}))`);
      const since = new Date(Date.now() - windowDays * 86_400_000);
      const subjectWhere = subject.kind === "user" ? eq(freeDraftRuns.userId, subject.userId) : eq(freeDraftRuns.guestKey, subject.guestKey);
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(freeDraftRuns)
        .where(and(subjectWhere, inArray(freeDraftRuns.status, [...COUNTING]), subject.kind === "user" ? gt(freeDraftRuns.createdAt, since) : sql`true`));
      const planHasCountingRun = input.tripId
        ? (await tx.select({ id: freeDraftRuns.id }).from(freeDraftRuns)
            .where(and(eq(freeDraftRuns.tripId, input.tripId), inArray(freeDraftRuns.status, [...COUNTING]))).limit(1)).length > 0
        : false;
      const decision = decideFreeDraft({ usedInWindow: Number(n), planHasCountingRun, limit, windowDays });
      if (!decision.allowed) {
        const { allowed: _allowed, ...refusal } = decision;
        return { kind: "refused", ...refusal } as FreeDraftClaim;
      }
      const [row] = await tx.insert(freeDraftRuns).values({
        userId: subject.kind === "user" ? subject.userId : null,
        guestKey: subject.kind === "guest" ? subject.guestKey : null,
        tripId: input.tripId,
        rail: input.rail,
        status: "claimed",
      }).returning({ id: freeDraftRuns.id });
      return { kind: "claimed", runId: row.id, used: decision.used + 1, limit, windowDays };
    });
  } catch (err: any) {
    // The partial UNIQUE on trip_id is the statement-level backstop for one-per-plan.
    if (err?.code === "23505") return { kind: "refused", reason: "plan_already_drafted" };
    throw err;
  }
}

/** The draft committed: count it, and record the plan it was written into (a minted plan's id). */
export async function promoteFreeDraft(runId: string, tripId: string | null): Promise<void> {
  await db.update(freeDraftRuns)
    .set({ status: "drafted", ...(tripId ? { tripId: sql`COALESCE(${freeDraftRuns.tripId}, ${tripId})` } : {}) } as any)
    .where(and(eq(freeDraftRuns.id, runId), eq(freeDraftRuns.status, "claimed")));
}

/** Our failure (provider error, our exception): the run never counts (ruling 3). */
export async function releaseFreeDraft(runId: string): Promise<void> {
  await db.update(freeDraftRuns).set({ status: "released" }).where(and(eq(freeDraftRuns.id, runId), eq(freeDraftRuns.status, "claimed")));
}

/** `GET /api/me/free-drafts`: the server's own numbers, for the §6 copy. */
export async function freeDraftStatus(userId: string): Promise<{ used: number; limit: number; windowDays: number; exempt: boolean }> {
  const windowDays = freeDraftWindowDays();
  const limit = freeDraftsPerWindow();
  if (await ownerIsQa(userId)) return { used: 0, limit, windowDays, exempt: true };
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(freeDraftRuns)
    .where(and(eq(freeDraftRuns.userId, userId), inArray(freeDraftRuns.status, [...COUNTING]), gt(freeDraftRuns.createdAt, since)));
  return { used: Number(n), limit, windowDays, exempt: false };
}

/** The refusal body every rail returns: the numbers and the §6 sentence, from one place. */
export function freeDraftRefusalBody(claim: Extract<FreeDraftClaim, { kind: "refused" }>) {
  if (claim.reason === "plan_already_drafted") {
    return { error: "free_draft_plan_used", message: "This plan already had its free draft — Optimize or get a Trip Pass" };
  }
  return {
    error: "free_draft_cap_reached",
    message: "Free drafts used up — Optimize or get a Trip Pass",
    used: claim.used,
    limit: claim.limit,
    windowDays: claim.windowDays,
  };
}

/** HTTP status for a refused claim: 429 (a usage limit, not a fault in the request). */
export const FREE_DRAFT_REFUSAL_STATUS = 429;
