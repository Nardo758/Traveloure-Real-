/**
 * occasion-drafts.service.ts — the Plus occasion draft scheduler + generator.
 *
 * Ledger 2026-08-27-plus-is-delivery. For each ACTIVE-Plus member with an active occasion inside
 * the 14-day lead window, this builds ONE AI-Concierge draft slip from the member's HOME CITY
 * (resident mode — the member's own city's gems, not a travel destination) and records the
 * occasion_drafts ledger row. It reuses the existing generation rail end-to-end — no new
 * generator, no new artifact type:
 *
 *   grokService.generateAutonomousItinerary   (generation; travelPulseContext = home-city gems)
 *     → normalizeGeneratedItineraryPayload      (shared normalizer)
 *     → saveGeneratedItinerarySnapshot          (writes a trips row + itinerary_items stamped
 *                                                 origin:'ai', routing_status defaulting to
 *                                                 'in_planning' — the optimizer/adopt rail)
 *
 * Idempotency follows the §15 CLAIM → generate → PROMOTE spine so a re-run, an hourly pass, or a
 * double-fire (external endpoint + in-process timer) yields exactly ONE draft per occasion cycle:
 *   1. CLAIM  — INSERT the ledger row ON CONFLICT (occasion_id, cycle_key) DO NOTHING RETURNING.
 *               Only the winner generates; a loser skips. A stale claim (a crash after claiming,
 *               before generating) is reclaimed after a TTL via an atomic conditional, never
 *               rolled back (§15b).
 *   2. GENERATE the slip (external AI call happens OUTSIDE any DB transaction).
 *   3. PROMOTE — stamp trip_id + generated_at via an atomic conditional (WHERE generated_at IS
 *               NULL). Then notify (email) and stamp notified_at, also atomically — one email
 *               per draft.
 */
import { and, eq, isNull, lt, isNotNull } from "drizzle-orm";
import { db } from "../db";
import {
  occasions,
  occasionDrafts,
  users,
  type Occasion,
  type OccasionDraft,
} from "@shared/schema";
import { grokService } from "./grok.service";
import { travelPulseService } from "./travelpulse.service";
import { saveGeneratedItinerarySnapshot } from "./content-query.service";
import {
  normalizeGeneratedItineraryPayload,
  normalizeGeneratedEstimatedCost,
} from "../utils/generated-itinerary";
import { resolveOccasionTemplate } from "./occasion-templates";
import { computeDueOccurrence, OCCASION_LEAD_DAYS, parseDateUTC, toDateKey, type DueOccurrence } from "./occasion-schedule";
import { isActivePlus } from "./plan-membership.service";
import { enqueueEmail } from "./email-outbox.service";
import { buildOccasionReminderEmailPayload } from "./email.service";

const TAG = "[occasion-drafts]";
/** A claim older than this with no generated_at is treated as crashed and reclaimable (§15b). */
export const OCCASION_RECLAIM_TTL_MS = 30 * 60 * 1000;

export type OccasionDraftOutcome =
  | "created"
  | "skipped_existing"
  | "skipped_not_due"
  | "skipped_no_home_city"
  | "skipped_not_plus"
  | "skipped_claim_lost"
  | "error";

export interface RunOccasionDraftsResult {
  scanned: number;
  created: number;
  skippedNotDue: number;
  skippedNotPlus: number;
  skippedNoHomeCity: number;
  skippedExisting: number;
  errors: number;
}

interface OccasionCandidate {
  occasion: Occasion;
  user: { id: string; email: string | null; firstName: string | null; homeCity: string | null };
}

/**
 * Batch entry point. Safe to call hourly and re-entrant. `today` is injectable for tests; `limit`
 * bounds a single pass. Never throws — a per-occasion failure is counted and the pass continues.
 */
export async function runOccasionDrafts(opts?: { today?: Date; limit?: number }): Promise<RunOccasionDraftsResult> {
  const today = opts?.today ?? new Date();
  const result: RunOccasionDraftsResult = {
    scanned: 0,
    created: 0,
    skippedNotDue: 0,
    skippedNotPlus: 0,
    skippedNoHomeCity: 0,
    skippedExisting: 0,
    errors: 0,
  };

  const candidates = await loadActiveOccasionCandidates(opts?.limit);
  result.scanned = candidates.length;

  // Cache the entitlement check so a member with many occasions is resolved once per pass.
  const plusCache = new Map<string, boolean>();
  const isPlus = async (userId: string): Promise<boolean> => {
    if (plusCache.has(userId)) return plusCache.get(userId)!;
    const v = await isActivePlus(userId);
    plusCache.set(userId, v);
    return v;
  };

  for (const candidate of candidates) {
    try {
      const outcome = await processOccasion(candidate, today, isPlus);
      switch (outcome) {
        case "created": result.created++; break;
        case "skipped_existing":
        case "skipped_claim_lost": result.skippedExisting++; break;
        case "skipped_not_due": result.skippedNotDue++; break;
        case "skipped_not_plus": result.skippedNotPlus++; break;
        case "skipped_no_home_city": result.skippedNoHomeCity++; break;
        case "error": result.errors++; break;
      }
    } catch (err) {
      result.errors++;
      console.error(`${TAG} occasion ${candidate.occasion.id} failed:`, err);
    }
  }

  console.log(
    `${TAG} pass complete — scanned=${result.scanned} created=${result.created} ` +
    `existing=${result.skippedExisting} notDue=${result.skippedNotDue} notPlus=${result.skippedNotPlus} ` +
    `noHomeCity=${result.skippedNoHomeCity} errors=${result.errors}`,
  );
  return result;
}

/** Active occasions belonging to live (non-deleted, non-suspended) users who have set a home city. */
async function loadActiveOccasionCandidates(limit?: number): Promise<OccasionCandidate[]> {
  const q = db
    .select({
      occasion: occasions,
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      homeCity: users.homeCity,
    })
    .from(occasions)
    .innerJoin(users, eq(users.id, occasions.userId))
    .where(
      and(
        eq(occasions.active, true),
        isNotNull(users.homeCity),
        eq(users.isDeleted, false),
        eq(users.isSuspended, false),
      ),
    );
  const rows = limit ? await q.limit(limit) : await q;
  return rows.map((r) => ({
    occasion: r.occasion,
    user: { id: r.userId, email: r.email, firstName: r.firstName, homeCity: r.homeCity },
  }));
}

/** Process one candidate occasion for one `today`. */
async function processOccasion(
  candidate: OccasionCandidate,
  today: Date,
  isPlus: (userId: string) => Promise<boolean>,
): Promise<OccasionDraftOutcome> {
  const { occasion, user } = candidate;

  if (!user.homeCity || !user.homeCity.trim()) return "skipped_no_home_city";

  const occasionDateStr = typeof occasion.occasionDate === "string"
    ? occasion.occasionDate
    : toDateKey(occasion.occasionDate as unknown as Date);
  const due = computeDueOccurrence(occasionDateStr, occasion.recurrence, today);
  if (!due) return "skipped_not_due";

  // Entitlement gate — only active Plus members get scheduled drafts.
  if (!(await isPlus(user.id))) return "skipped_not_plus";

  // ── 1. CLAIM ───────────────────────────────────────────────────────────────
  const claim = await claimDraftCycle(occasion.id, due);
  if (!claim.row) return "skipped_existing";      // active claim or already generated → skip
  const ledgerRow = claim.row;
  if (claim.alreadyGenerated) return "skipped_existing";

  // ── 2. GENERATE (external AI call; outside any DB transaction) ───────────────
  let tripId: string;
  try {
    tripId = await buildDraftSlip({
      userId: user.id,
      homeCity: user.homeCity.trim(),
      templateKey: occasion.templateKey,
      targetDate: due.targetDate,
      label: occasion.label,
    });
  } catch (err) {
    // Leave the claim un-promoted (generated_at stays NULL). It is reclaimable after the TTL,
    // so a transient AI failure retries on a later pass rather than permanently blocking.
    console.error(`${TAG} generation failed for occasion ${occasion.id}:`, err);
    return "error";
  }

  // ── 3. PROMOTE (atomic conditional) ─────────────────────────────────────────
  const [promoted] = await db
    .update(occasionDrafts)
    .set({ tripId, generatedAt: new Date() })
    .where(and(eq(occasionDrafts.id, ledgerRow.id), isNull(occasionDrafts.generatedAt)))
    .returning();
  if (!promoted) {
    // Extremely unlikely under the lease (only the claim holder generates). Another writer already
    // promoted this cycle; our slip is a harmless extra AI draft. Do not send a duplicate email.
    console.warn(`${TAG} promotion lost for occasion ${occasion.id} cycle ${due.cycleKey}; trip ${tripId} left as-is`);
    return "skipped_claim_lost";
  }

  // ── 3b. NOTIFY (Phase 3) — one email per draft, atomic on notified_at ────────
  await notifyOccasionDraft({
    draftId: promoted.id,
    userEmail: user.email,
    firstName: user.firstName,
    occasion,
    homeCity: user.homeCity.trim(),
    tripId,
    today,
    targetDate: due.targetDate,
  });

  return "created";
}

/**
 * Atomically claim (or reclaim a stale) ledger row for this occasion/cycle.
 * Returns { row: null } when an ACTIVE claim exists or the cycle was already generated (→ skip),
 * { row, alreadyGenerated:true } when a completed row already exists (→ skip),
 * { row, alreadyGenerated:false } when THIS caller holds the claim (→ proceed to generate).
 */
async function claimDraftCycle(
  occasionId: string,
  due: DueOccurrence,
): Promise<{ row: OccasionDraft | null; alreadyGenerated: boolean }> {
  const [claimed] = await db
    .insert(occasionDrafts)
    .values({ occasionId, cycleKey: due.cycleKey, occasionYear: due.occasionYear })
    .onConflictDoNothing({ target: [occasionDrafts.occasionId, occasionDrafts.cycleKey] })
    .returning();
  if (claimed) return { row: claimed, alreadyGenerated: false };

  // A row exists. If it's already generated, skip. If it's a stale un-generated claim (crashed
  // before promotion), reclaim it via an atomic conditional lease; otherwise an active claim holds.
  const staleBefore = new Date(Date.now() - OCCASION_RECLAIM_TTL_MS);
  const [reclaimed] = await db
    .update(occasionDrafts)
    .set({ claimedAt: new Date() })
    .where(
      and(
        eq(occasionDrafts.occasionId, occasionId),
        eq(occasionDrafts.cycleKey, due.cycleKey),
        isNull(occasionDrafts.generatedAt),
        lt(occasionDrafts.claimedAt, staleBefore),
      ),
    )
    .returning();
  if (reclaimed) return { row: reclaimed, alreadyGenerated: false };
  return { row: null, alreadyGenerated: false };
}

/**
 * Generate one resident-mode draft slip for a home city and return the new trip id. Reuses the
 * shared generation → normalize → snapshot rail; feeds the home city's own gems as context so the
 * plan is built from local inventory (thin-but-honest when the city is sparsely stocked).
 */
async function buildDraftSlip(input: {
  userId: string;
  homeCity: string;
  templateKey: string;
  targetDate: string;
  label: string | null;
}): Promise<string> {
  const template = resolveOccasionTemplate(input.templateKey);
  const start = input.targetDate;
  const end = input.targetDate; // resident occasions are single-day

  // Resident mode: pull the member's own home-city gems as generation context.
  let travelPulseContext: any = undefined;
  try {
    const cityIntelligence = await travelPulseService.getCityIntelligence(input.homeCity);
    if (cityIntelligence) {
      const city = cityIntelligence.city;
      travelPulseContext = {
        pulseScore: city?.pulseScore,
        trendingScore: city?.trendingScore,
        crowdLevel: city?.crowdLevel,
        aiLocalInsights: city?.aiLocalInsights,
        aiMustSeeAttractions: city?.aiMustSeeAttractions,
        hiddenGems: cityIntelligence.hiddenGems?.slice(0, 5).map((g: any) => ({
          name: g.name,
          description: g.description,
          gemScore: g.gemScore,
        })),
        happeningNow: cityIntelligence.happeningNow?.slice(0, 5).map((h: any) => ({
          name: h.name,
          type: h.type,
        })),
      };
    }
  } catch (err) {
    // No city intelligence → an honestly thinner draft, never a failure (§13 posture).
    console.warn(`${TAG} city intelligence unavailable for ${input.homeCity}:`, err);
  }

  const { result } = await grokService.generateAutonomousItinerary({
    destination: input.homeCity,
    dates: { start, end },
    travelers: 2,
    eventType: template.eventType,
    interests: template.interests,
    pacePreference: "moderate",
    specialRequests: template.specialRequests,
    travelPulseContext,
  });

  const normalized = normalizeGeneratedItineraryPayload(result as any, template.dayCount);
  const title = input.label?.trim() || normalized.title || `${template.defaultLabel} in ${input.homeCity}`;

  const snapshot = await saveGeneratedItinerarySnapshot({
    userId: input.userId,
    tripId: null,
    trip: {
      title,
      destination: input.homeCity,
      startDate: start,
      endDate: end,
      numberOfTravelers: 2,
      status: "draft",
      eventType: template.eventType,
      specialRequests: template.specialRequests,
    },
    generatedPlan: {
      destination: input.homeCity,
      startDate: start,
      endDate: end,
      title: normalized.title,
      summary: normalized.summary,
      totalEstimatedCost: normalized.totalEstimatedCost,
      itineraryData: normalized.dailyItinerary,
      accommodationSuggestions: normalized.accommodationSuggestions,
      packingList: normalized.packingList,
      travelTips: normalized.travelTips,
      provider: "grok",
      status: "generated",
    },
    canonicalItems: normalized.canonicalItems,
    comparison: {
      title,
      destination: input.homeCity,
      startDate: start,
      endDate: end,
      budget: normalizeGeneratedEstimatedCost(undefined),
      travelers: 2,
      status: "generating",
    },
  });

  return snapshot.trip.id;
}

/** Send the one reminder email for a freshly generated draft and stamp notified_at atomically. */
async function notifyOccasionDraft(input: {
  draftId: string;
  userEmail: string | null;
  firstName: string | null;
  occasion: Occasion;
  homeCity: string;
  tripId: string;
  today: Date;
  targetDate: string;
}): Promise<void> {
  if (!input.userEmail) return; // no address on file → nothing to send; ledger stays un-notified

  // Claim the notification atomically so a concurrent/retry pass cannot double-send.
  const [claimed] = await db
    .update(occasionDrafts)
    .set({ notifiedAt: new Date() })
    .where(and(eq(occasionDrafts.id, input.draftId), isNull(occasionDrafts.notifiedAt)))
    .returning();
  if (!claimed) return; // already notified

  const template = resolveOccasionTemplate(input.occasion.templateKey);
  const label = input.occasion.label?.trim() || template.defaultLabel;
  const daysUntil = Math.max(
    0,
    Math.round(
      (parseDateUTC(input.targetDate).getTime() - parseDateUTC(toDateKey(input.today)).getTime()) / 86_400_000,
    ),
  );

  const payload = buildOccasionReminderEmailPayload({
    firstName: input.firstName,
    occasionLabel: label,
    homeCity: input.homeCity,
    tripId: input.tripId,
    daysUntil,
  });

  try {
    await enqueueEmail({
      emailType: "occasion_reminder",
      to: input.userEmail,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      metadata: { draftId: input.draftId, tripId: input.tripId, occasionId: input.occasion.id },
    });
  } catch (err) {
    // enqueueEmail already never throws, but guard anyway: a send failure must not roll back the
    // draft. The notified_at stamp stands (one attempt per draft, by design).
    console.error(`${TAG} reminder email enqueue failed for draft ${input.draftId}:`, err);
  }
}

// Re-export the lead-days constant so callers/tests share one source of truth.
export { OCCASION_LEAD_DAYS };
