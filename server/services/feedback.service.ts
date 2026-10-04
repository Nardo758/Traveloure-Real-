/**
 * Feedback events (ledger `2026-10-04-feedback-phase-a`; migration 345). The registry is
 * `shared/feedback.ts`; this module only writes and reads `feedback_events`.
 *
 *   · ONE ROW per plan per moment per user. No UNIQUE index was ruled, so the write serialises on
 *     the PLAN's row (`SELECT … FOR UPDATE` on trips) and updates-or-inserts inside that transaction:
 *     a second tap — or two taps racing — leaves one row, carrying the latest answer.
 *   · Everything but the answer is SERVER-FILLED: surface (from the moment), group_key (the group
 *     manifest's group for the plan's occasion), city (the plan's destination city), build_sha (the
 *     serving build), user (the session). The body carries only {moment, code, text?}.
 *   · Undo deletes the caller's own row for that moment.
 */
import crypto from "node:crypto";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { aiGeneratedItineraries, feedbackEvents, tripFinals, trips } from "@shared/schema";
import { FEEDBACK_SURFACE, postTripOpen, type FeedbackMoment } from "@shared/feedback";
import { experienceGroupFor } from "@shared/experience-group";
import { manifestFor } from "@shared/group-manifest";
import { getBuildInfo } from "./build-info";
import { readPlanPenOccasionSlug } from "./plan-pen-occasion.service";
import { storage } from "../storage";

/** The plan's group (manifest key) and city, read from the plan itself. */
async function planContext(tripId: string): Promise<{ groupKey: string; city: string | null; exists: boolean }> {
  const [trip] = await db.select({ userId: trips.userId, destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return { groupKey: manifestFor(null).group, city: null, exists: false };
  const slug = await readPlanPenOccasionSlug(trip.userId, tripId);
  const row = slug ? await storage.getExperienceTypeBySlug(slug) : null;
  const groupKey = manifestFor(experienceGroupFor(row as any), slug).group;
  const city = (trip.destination ?? "").split(",")[0].trim() || null;
  return { groupKey, city, exists: true };
}

export async function recordFeedback(input: {
  tripId: string;
  userId: string;
  moment: FeedbackMoment;
  code: string;
  text: string | null;
}): Promise<{ id: string; updated: boolean }> {
  const ctx = await planContext(input.tripId);
  const build = getBuildInfo();
  const buildSha = build.commit ?? null;
  return db.transaction(async (tx) => {
    // Serialise per plan: one row per plan × moment × user, with no unique index to lean on.
    await tx.execute(sql`SELECT id FROM trips WHERE id = ${input.tripId} FOR UPDATE`);
    const [existing] = await tx
      .select({ id: feedbackEvents.id })
      .from(feedbackEvents)
      .where(and(eq(feedbackEvents.planId, input.tripId), eq(feedbackEvents.userId, input.userId), eq(feedbackEvents.moment, input.moment)))
      .limit(1);
    const values = {
      surface: FEEDBACK_SURFACE[input.moment],
      code: input.code,
      text: input.text,
      groupKey: ctx.groupKey,
      city: ctx.city,
      buildSha,
      createdAt: new Date(),
    };
    if (existing) {
      await tx.update(feedbackEvents).set(values).where(eq(feedbackEvents.id, existing.id));
      return { id: existing.id, updated: true };
    }
    const id = crypto.randomUUID();
    await tx.insert(feedbackEvents).values({ id, planId: input.tripId, userId: input.userId, moment: input.moment, ...values });
    return { id, updated: false };
  });
}

/** Undo: the caller's own row for that moment. Returns whether a row was removed. */
export async function clearFeedback(input: { tripId: string; userId: string; moment: FeedbackMoment }): Promise<boolean> {
  const rows = await db
    .delete(feedbackEvents)
    .where(and(eq(feedbackEvents.planId, input.tripId), eq(feedbackEvents.userId, input.userId), eq(feedbackEvents.moment, input.moment)))
    .returning({ id: feedbackEvents.id });
  return rows.length > 0;
}

/**
 * What the caller's tap reads: their own answers by moment, and which moments are OPEN — `post_draft`
 * once the plan has a draft row. A moment already answered or dismissed is not open (it never
 * reappears for that plan and moment).
 */
export async function feedbackState(tripId: string, userId: string): Promise<{
  answers: Partial<Record<FeedbackMoment, { code: string }>>;
  open: FeedbackMoment[];
  /** The plan's group (manifest key) — the tap words time in the group's own unit. */
  groupKey: string;
}> {
  const rows = await db
    .select({ moment: feedbackEvents.moment, code: feedbackEvents.code })
    .from(feedbackEvents)
    .where(and(eq(feedbackEvents.planId, tripId), eq(feedbackEvents.userId, userId)));
  const answers: Partial<Record<FeedbackMoment, { code: string }>> = {};
  for (const r of rows) if (r.moment && r.code) answers[r.moment as FeedbackMoment] = { code: r.code };
  const open: FeedbackMoment[] = [];
  const [draft] = await db.select({ id: aiGeneratedItineraries.id }).from(aiGeneratedItineraries).where(eq(aiGeneratedItineraries.tripId, tripId)).limit(1);
  if (draft && !answers.post_draft) open.push("post_draft");
  // Step 6: the Trip Card's post-trip tap, from T+1 on a plan that was made final.
  if (!answers.post_trip) {
    const [t] = await db.select({ endDate: trips.endDate }).from(trips).where(eq(trips.id, tripId)).limit(1);
    const [fin] = await db.select({ id: tripFinals.id }).from(tripFinals).where(eq(tripFinals.tripId, tripId)).limit(1);
    if (postTripOpen(t?.endDate as any, !!fin, new Date())) open.push("post_trip");
  }
  return { answers, open, groupKey: (await planContext(tripId)).groupKey };
}

/** Admin read: counts by city × group_key × moment × code for a range, and that filter's text rows. */
export async function feedbackReport(filter: {
  from?: Date | null;
  to?: Date | null;
  city?: string | null;
  groupKey?: string | null;
  moment?: string | null;
  code?: string | null;
}): Promise<{
  counts: Array<{ city: string | null; groupKey: string | null; moment: string | null; code: string | null; n: number }>;
  texts: Array<{ id: string; planId: string | null; city: string | null; groupKey: string | null; moment: string | null; text: string; buildSha: string | null; createdAt: Date | null }>;
}> {
  const where: SQL[] = [];
  if (filter.from) where.push(gte(feedbackEvents.createdAt, filter.from));
  if (filter.to) where.push(lte(feedbackEvents.createdAt, filter.to));
  if (filter.city) where.push(sql`lower(${feedbackEvents.city}) = lower(${filter.city})`);
  if (filter.groupKey) where.push(eq(feedbackEvents.groupKey, filter.groupKey));
  if (filter.moment) where.push(eq(feedbackEvents.moment, filter.moment));
  if (filter.code) where.push(eq(feedbackEvents.code, filter.code));
  const cond = where.length ? and(...where) : undefined;
  const counts = await db
    .select({
      city: feedbackEvents.city,
      groupKey: feedbackEvents.groupKey,
      moment: feedbackEvents.moment,
      code: feedbackEvents.code,
      n: sql<number>`count(*)::int`,
    })
    .from(feedbackEvents)
    .where(cond)
    .groupBy(feedbackEvents.city, feedbackEvents.groupKey, feedbackEvents.moment, feedbackEvents.code)
    .orderBy(feedbackEvents.city, feedbackEvents.groupKey, feedbackEvents.moment, feedbackEvents.code);
  const texts = await db
    .select({
      id: feedbackEvents.id,
      planId: feedbackEvents.planId,
      city: feedbackEvents.city,
      groupKey: feedbackEvents.groupKey,
      moment: feedbackEvents.moment,
      text: feedbackEvents.text,
      buildSha: feedbackEvents.buildSha,
      createdAt: feedbackEvents.createdAt,
    })
    .from(feedbackEvents)
    .where(cond ? and(cond, sql`${feedbackEvents.text} IS NOT NULL`) : sql`${feedbackEvents.text} IS NOT NULL`)
    .orderBy(desc(feedbackEvents.createdAt))
    .limit(500);
  return {
    counts: counts.map((c) => ({ ...c, n: Number(c.n) })),
    texts: texts.filter((t): t is typeof t & { text: string } => typeof t.text === "string"),
  };
}
