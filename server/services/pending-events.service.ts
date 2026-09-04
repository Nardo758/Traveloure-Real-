/**
 * pending-events.service.ts — drain the PRE-TRIP holding pen at plan birth.
 * Ledger `2026-09-04-plan-mint`, CLAUDE.md entry 30 (b). ONE implementation, every mint site.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────
 * `2026-09-03-switch-readers` shipped the edit panel's step 5 ("What's happening"): each ticked
 * chip becomes ONE event, and an event inside a plan IS a `user_experiences` row bound to the trip
 * (entry 29 — there is no second event artifact). That write needs a trip id, so when the panel
 * runs before any trip exists the chips are HELD in the caller's `trip_contexts` row as
 * `pendingEventTitles` (on `PUT /api/trip-context`'s hand-written allowlist). That lane closed
 * stating its own gap out loud: **nothing ever drained the pen**, so a traveler who chose their
 * events before the plan existed silently lost them. This is the drain.
 *
 * ── RULES THAT MUST NOT BE WEAKENED ─────────────────────────────────────────────────────────
 * 1. **ONE implementation, many callers.** Every mint site calls this function; none of them
 *    re-derives "what a held chip becomes". A second copy is the derivation-drift class §18
 *    rule 1 names.
 * 2. **The route's ownership rule is never bypassed.** The row is written by the SAME
 *    `storage.createUserExperience` that the `.pick()`-allowlisted `POST /api/user-experiences`
 *    uses (`server/routes/content.routes.ts` — `userExperienceBodySchema`), with the same field
 *    set. `userId` comes from the mint's own owner and never from a body; that route then
 *    ownership-checks `tripId` against the caller, and here the trip is owned BY CONSTRUCTION —
 *    it is the row this very mint just created for this very user.
 * 3. **A failed drain NEVER fails the trip mint.** Every failure is logged and swallowed, and the
 *    pen is left INTACT so a later mint can retry. §15b's shape: an ancillary effect may not break
 *    the operation that authorizes it, and a lost pen would be exactly the silent loss this
 *    function exists to end.
 * 4. **Idempotent.** A held title that already has an event of that name on this trip is SKIPPED,
 *    and the pen is cleared once every title has a row — so a second run creates nothing.
 * 5. **An occasion is never invented (§13).** `user_experiences.experience_type_id` is NOT NULL,
 *    so an event cannot be created without one. When the held context names no resolvable
 *    `experience_types` row, this creates NOTHING and leaves the pen for a later mint — filing a
 *    traveler's events under a nearest-looking occasion would be a fabricated answer, and losing
 *    them would be the original bug.
 *
 * NOT DRAINED HERE: the sibling `mainMomentTime` hold (a `temporal_anchors` row) — a different
 * artifact on a different rail, deliberately out of this lane's scope and still held, not lost.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../infrastructure/logger";

/** The pen's key inside the `trip_contexts.context` jsonb blob. */
const PEN_KEY = "pendingEventTitles";
/** Mirrors the `PUT /api/trip-context` allowlist cap (`z.array(str(120)).max(20)`). */
const MAX_TITLES = 20;
const MAX_TITLE_LEN = 120;

export type DrainOutcome = {
  created: number;
  skipped: number;
  /** Present only when nothing was drained; states WHY, so a caller's log is never mute (§13). */
  reason?:
    | "no_pen"
    | "no_titles"
    | "occasion_unresolved"
    | "failed";
};

/**
 * Promote every title held in the caller's pre-trip pen into one `user_experiences` row bound to
 * the freshly minted trip, then clear the pen. Never throws.
 *
 * @param userId      the trip's OWNER (from the mint site's own server-side value, never a body)
 * @param tripId      the trip row that was just created for that owner
 * @param destination the trip's destination — becomes the event's `location`, exactly as the
 *                    panel's own POST does
 * @param startDate   the trip's start date (YYYY-MM-DD) — becomes the event's `eventDate`, again
 *                    matching the panel
 */
export async function drainPendingEventsIntoTrip(input: {
  userId: string | null | undefined;
  tripId: string;
  destination?: string | null;
  startDate?: string | null;
}): Promise<DrainOutcome> {
  const { userId, tripId } = input;
  // An authoring-mode / owner-less trip has no traveler principal whose pen this could be.
  if (!userId || !tripId) return { created: 0, skipped: 0, reason: "no_pen" };

  try {
    // The pen lives on the LEGACY per-user row (`trip_id IS NULL`) — by definition, the chips were
    // ticked while no trip existed, so no trip-scoped row could have held them.
    const penRows = await db.execute(sql`
      SELECT context FROM trip_contexts WHERE user_id = ${userId} AND trip_id IS NULL LIMIT 1
    `);
    const context: any = (penRows as any).rows?.[0]?.context;
    if (!context || typeof context !== "object") return { created: 0, skipped: 0, reason: "no_pen" };

    const held: unknown = context[PEN_KEY];
    if (!Array.isArray(held) || held.length === 0) return { created: 0, skipped: 0, reason: "no_titles" };

    // Normalize exactly as the write route would have: trim, drop empties, cap length and count,
    // and collapse duplicates within the pen itself (two identical chips are one event).
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const raw of held) {
      if (typeof raw !== "string") continue;
      const title = raw.trim().slice(0, MAX_TITLE_LEN);
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      titles.push(title);
      if (titles.length >= MAX_TITLES) break;
    }
    if (titles.length === 0) {
      await clearPen(userId);
      return { created: 0, skipped: 0, reason: "no_titles" };
    }

    // Lazily imported to keep `server/storage.ts` → this module a one-way edge: storage calls the
    // drain, so a top-level `import { storage }` here would close the cycle. Same pattern and same
    // reason as `server/services/booking-actions.service.ts`.
    const { storage } = await import("../storage");

    // Rule 5: resolve the occasion or create NOTHING. The held context names it as a slug
    // (`experienceSlug`) or as the display value the experience-template flow writes
    // (`experienceType`, which may itself be a slug or a name) — try each against the real rows,
    // never a nearest match.
    const experienceTypeId = await resolveExperienceTypeId(storage, context);
    if (!experienceTypeId) {
      logger.warn(
        { userId, tripId, heldTitles: titles.length },
        "[pending-events] pen held but its occasion does not resolve — creating nothing, pen kept for a later mint",
      );
      return { created: 0, skipped: 0, reason: "occasion_unresolved" };
    }

    // Rule 4: an event of this name already on this trip is somebody else's row (a previous drain,
    // or the panel's own POST once a trip existed) — skip it rather than duplicate it.
    const existingRows = await db.execute(sql`
      SELECT title FROM user_experiences WHERE trip_id = ${tripId} AND user_id = ${userId}
    `);
    const existing = new Set<string>(
      ((existingRows as any).rows ?? [])
        .map((r: any) => (typeof r.title === "string" ? r.title.trim().toLowerCase() : ""))
        .filter(Boolean),
    );

    let created = 0;
    let skipped = 0;
    for (const title of titles) {
      if (existing.has(title.toLowerCase())) {
        skipped++;
        continue;
      }
      // The SAME storage writer and the SAME field set as POST /api/user-experiences (rule 2).
      await storage.createUserExperience({
        userId,
        tripId,
        experienceTypeId,
        title,
        eventDate: input.startDate || null,
        location: input.destination || null,
      } as any);
      created++;
    }

    // Every held title now has a row (created or already present) — the pen has done its job.
    await clearPen(userId);
    logger.info({ userId, tripId, created, skipped }, "[pending-events] pre-trip pen drained at plan mint");
    return { created, skipped };
  } catch (err) {
    // Rule 3: the mint stands, the pen stays, and the failure is visible rather than silent.
    logger.error({ err, userId, tripId }, "[pending-events] drain failed — trip mint unaffected, pen left intact");
    return { created: 0, skipped: 0, reason: "failed" };
  }
}

/** Remove ONLY the pen key; every other held planning field (dates, title, origin) is untouched. */
async function clearPen(userId: string): Promise<void> {
  await db.execute(sql`
    UPDATE trip_contexts
    SET context = context - ${PEN_KEY}, updated_at = NOW()
    WHERE user_id = ${userId} AND trip_id IS NULL
  `);
}

/**
 * The held context's occasion, resolved against the REAL `experience_types` rows — the one runtime
 * vocabulary every picker reads. Returns null when nothing matches, which is the honest answer:
 * the panel writes `experienceSlug`, older surfaces write a display NAME into `experienceType`,
 * and a legacy value may match neither.
 */
async function resolveExperienceTypeId(storage: any, context: any): Promise<string | null> {
  const candidates = [context?.experienceSlug, context?.experienceType]
    .filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
  for (const candidate of candidates) {
    const bySlug = await storage.getExperienceTypeBySlug(candidate);
    if (bySlug?.id) return bySlug.id;
  }
  if (candidates.length === 0) return null;
  // A display NAME (e.g. "Wedding") is the other shape a stored value takes — match it against the
  // real rows case-insensitively. Still an exact match on a real row, never a nearest one.
  const wanted = new Set(candidates.map((c) => c.toLowerCase()));
  const all = await storage.getExperienceTypes();
  const byName = (all ?? []).find(
    (t: any) =>
      (typeof t?.name === "string" && wanted.has(t.name.toLowerCase())) ||
      (typeof t?.slug === "string" && wanted.has(t.slug.toLowerCase())),
  );
  return byName?.id ?? null;
}
