/**
 * booking-actions.service.ts
 * DB-touching helpers extracted from booking-actions.routes.ts.
 * Routes → this service → db. No raw db calls in route handlers.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

// ─── Expert Requests ──────────────────────────────────────────────────────────

/**
 * Mark an expert request as completed. If the request's optimization_context
 * flags it as Partnerize-assisted (partnerizeAssisted: true), also increments
 * total_bookings_assisted on the assigned expert's local_expert_forms row —
 * the metric used to surface booking-assist volume in expert/admin dashboards.
 *
 * Returns null if the request doesn't exist, isn't assigned to expertUserId,
 * or is already completed (idempotent no-op on repeat calls).
 */
export async function completeExpertRequest(
  requestId: string,
  expertUserId: string,
): Promise<{ id: string; partnerizeAssisted: boolean } | null> {
  const existing = await db.execute(sql`
    SELECT id, status, assigned_expert_id, optimization_context
    FROM expert_requests
    WHERE id = ${requestId} AND assigned_expert_id = ${expertUserId}
    LIMIT 1
  `);
  const row = existing.rows?.[0] as any;
  if (!row) return null;
  if (row.status === 'completed') return { id: row.id, partnerizeAssisted: false };

  const optimizationContext = row.optimization_context || {};
  const partnerizeAssisted = optimizationContext?.partnerizeAssisted === true;

  await db.execute(sql`
    UPDATE expert_requests
    SET status = 'completed', completed_at = NOW()
    WHERE id = ${requestId}
  `);

  if (partnerizeAssisted) {
    await db.execute(sql`
      UPDATE local_expert_forms
      SET total_bookings_assisted = COALESCE(total_bookings_assisted, 0) + 1
      WHERE user_id = ${expertUserId}
    `);
  }

  return { id: row.id, partnerizeAssisted };
}

export async function getExpertRequestsByUser(
  userId: string,
  tripId?: string,
): Promise<any[]> {
  const base = `
    SELECT id, user_id, trip_id, variant_id, comparison_id, destination_city,
           request_type, expert_fee, status, assigned_expert_id, queue_position,
           notes, optimization_context, created_at, assigned_at, completed_at
    FROM expert_requests
    WHERE user_id = $1
  `;
  if (tripId) {
    const result = await db.execute(
      sql`SELECT id, user_id, trip_id, variant_id, comparison_id, destination_city,
             request_type, expert_fee, status, assigned_expert_id, queue_position,
             notes, optimization_context, created_at, assigned_at, completed_at
          FROM expert_requests
          WHERE user_id = ${userId} AND trip_id = ${tripId}
          ORDER BY created_at DESC`,
    );
    return result.rows || [];
  }
  const result = await db.execute(
    sql`SELECT id, user_id, trip_id, variant_id, comparison_id, destination_city,
           request_type, expert_fee, status, assigned_expert_id, queue_position,
           notes, optimization_context, created_at, assigned_at, completed_at
        FROM expert_requests
        WHERE user_id = ${userId}
        ORDER BY created_at DESC`,
  );
  return result.rows || [];
}

// ─── Saved Trips ──────────────────────────────────────────────────────────────

export async function getVariantCost(variantId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT total_cost FROM itinerary_variants WHERE id = ${variantId}
  `);
  return Number(result.rows?.[0]?.total_cost) || 0;
}

// Owner + cost for a variant, in one query — used by the expert-service PaymentIntent path to
// (a) enforce ownership (IDOR) and (b) derive the charge amount server-side. The variant's
// totalCost is the server-side source of truth; the client must never send its own amount.
export async function getVariantOwnerAndCost(
  variantId: string,
): Promise<{ ownerUserId: string; totalCost: number } | null> {
  const result = await db.execute(sql`
    SELECT c.user_id AS owner_user_id, v.total_cost
    FROM itinerary_variants v
    JOIN itinerary_comparisons c ON c.id = v.comparison_id
    WHERE v.id = ${variantId}
    LIMIT 1
  `);
  const row = result.rows?.[0];
  if (!row) return null;
  return { ownerUserId: String(row.owner_user_id), totalCost: Number(row.total_cost) || 0 };
}

// Expert-review service tiers — SERVER-SIDE source of truth for the charge amount. The client
// previously computed these and sent `amount` in the body (a live amount-tampering hole: a caller
// could POST amount:0.01). The price is a flat base + a percentage of the variant's stored
// totalCost, resolved here and never from the request body.
// Migration 137: the live rates are admin-editable fee_bands rows; these constants survive ONLY
// as the safe-failure fallback when a band is absent/invalid (the coordination-floor posture, §8).
const EXPERT_REVIEW_TIERS: Record<
  string,
  { base: number; pct: number; flatBand: string; pctBand: string | null }
> = {
  review:          { base: 50,  pct: 0,    flatBand: "expert_review_flat",      pctBand: null },                        // fee-literal-ok: fallback default
  review_and_book: { base: 50,  pct: 0.05, flatBand: "expert_review_book_flat", pctBand: "expert_review_book_percent" }, // fee-literal-ok: fallback default
  full_concierge:  { base: 100, pct: 0.08, flatBand: "full_concierge_flat",     pctBand: "full_concierge_percent" },     // fee-literal-ok: fallback default
};

async function bandRateOr(fallback: number, bandKey: string, expectType: "flat" | "percent"): Promise<number> {
  const { getBand } = await import("./commission");
  const band = await getBand(bandKey);
  // Wrong rate_type or non-positive → the band is misconfigured; charge the documented default
  // rather than a wrong amount (a fee's safe failure mode — same as the coordination floor).
  if (!band || band.rateType !== expectType || !(band.rate > 0)) return fallback;
  return band.rate;
}

export async function resolveExpertReviewAmount(serviceType: string, variantTotalCost: number): Promise<number | null> {
  const tier = EXPERT_REVIEW_TIERS[serviceType];
  if (!tier) return null;
  const cost = Number.isFinite(variantTotalCost) && variantTotalCost > 0 ? variantTotalCost : 0;
  const base = await bandRateOr(tier.base, tier.flatBand, "flat");
  const pct = tier.pctBand ? await bandRateOr(tier.pct, tier.pctBand, "percent") : 0;
  return Math.round((base + cost * pct) * 100) / 100;
}

export async function insertSavedTrip(values: {
  userId: string;
  variantId: string;
  comparisonId: string;
  notes?: string | null;
  priceSnapshot: number;
  expiresAt: Date;
}): Promise<string> {
  const result = await db.execute(sql`
    INSERT INTO saved_trips (
      id, user_id, variant_id, comparison_id, notes,
      saved_at, expires_at, price_snapshot, status
    ) VALUES (
      ${crypto.randomUUID()}, ${values.userId}, ${values.variantId},
      ${values.comparisonId}, ${values.notes ?? null},
      NOW(), ${values.expiresAt.toISOString()}, ${values.priceSnapshot}, 'active'
    ) RETURNING id
  `);
  return String(result.rows?.[0]?.id);
}

export async function getSavedTripsForUser(userId: string): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT
      st.id, st.variant_id, st.comparison_id, st.notes,
      st.saved_at, st.expires_at, st.price_snapshot, st.status,
      iv.name as variant_name, iv.total_cost as variant_cost,
      ic.destination, ic.start_date, ic.end_date, ic.travelers, ic.trip_id
    FROM saved_trips st
    LEFT JOIN itinerary_variants iv ON iv.id = st.variant_id
    LEFT JOIN itinerary_comparisons ic ON ic.id = st.comparison_id
    WHERE st.user_id = ${userId} AND st.status = 'active'
    ORDER BY st.saved_at DESC
  `);
  return result.rows || [];
}

// ─── Shared Trips (variant-based) ─────────────────────────────────────────────

export async function insertSharedTrip(values: {
  variantId: string;
  comparisonId: string;
  sharedBy: string;
  shareToken: string;
  expiresAt: Date;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO shared_trips (
      id, variant_id, comparison_id, shared_by,
      share_token, expires_at, views, bookings, created_at
    ) VALUES (
      ${crypto.randomUUID()}, ${values.variantId}, ${values.comparisonId},
      ${values.sharedBy}, ${values.shareToken}, ${values.expiresAt.toISOString()},
      0, 0, NOW()
    )
  `);
}

export async function getSharedTripByVariantToken(token: string): Promise<any | null> {
  const result = await db.execute(sql`
    SELECT st.*, iv.*, ic.*
    FROM shared_trips st
    JOIN itinerary_variants iv ON st.variant_id = iv.id
    JOIN itinerary_comparisons ic ON st.comparison_id = ic.id
    WHERE st.share_token = ${token} AND st.expires_at > NOW()
  `);
  return result.rows?.[0] ?? null;
}

export async function incrementSharedTripViews(token: string): Promise<void> {
  await db.execute(sql`
    UPDATE shared_trips SET views = views + 1 WHERE share_token = ${token}
  `);
}

// ─── Trip-based sharing ───────────────────────────────────────────────────────

export async function getTripOwnerCheck(tripId: string, userId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT id FROM trips WHERE id = ${tripId} AND user_id = ${userId}
  `);
  return !!(result.rows && result.rows.length > 0);
}

export async function upsertTripShareToken(
  tripId: string,
  userId: string,
  shareToken: string,
  expiresAt: Date,
): Promise<void> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO shared_trips (id, trip_id, shared_by, share_token, expires_at, views, bookings, created_at)
    VALUES (${id}, ${tripId}, ${userId}, ${shareToken}, ${expiresAt.toISOString()}, 0, 0, NOW())
    ON CONFLICT (trip_id) DO NOTHING
  `);
}

export async function getCanonicalTripShareToken(tripId: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT share_token FROM shared_trips WHERE trip_id = ${tripId} LIMIT 1
  `);
  return String(result.rows?.[0]?.share_token ?? "") || null;
}

export async function getTripByShareToken(token: string): Promise<{ row: any; sharedTripId: string } | null> {
  const result = await db.execute(sql`
    SELECT
      st.id as shared_trip_id,
      t.id, t.title, t.destination, t.start_date, t.end_date,
      t.number_of_travelers, t.status,
      gi.itinerary_data
    FROM shared_trips st
    JOIN trips t ON t.id = st.trip_id
    LEFT JOIN generated_itineraries gi ON gi.trip_id = t.id AND gi.status = 'generated'
    WHERE st.share_token = ${token}
      AND (st.expires_at IS NULL OR st.expires_at > NOW())
    LIMIT 1
  `);
  if (!result.rows || result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return { row, sharedTripId: String(row.shared_trip_id) };
}

export async function insertSharedTripView(sharedTripId: string, viewerIp: string | null): Promise<void> {
  await db.execute(sql`
    INSERT INTO shared_trip_views (id, shared_trip_id, viewer_ip, viewed_at)
    VALUES (${crypto.randomUUID()}, ${sharedTripId}::uuid, ${viewerIp}, NOW())
  `);
}

// ─── Trip Experts ─────────────────────────────────────────────────────────────

export async function getApprovedExperts(destination?: string): Promise<any[]> {
  if (destination && destination.trim()) {
    const destPattern = `%${destination.trim().toLowerCase()}%`;
    const result = await db.execute(sql`
      SELECT
        lef.id, lef.user_id, lef.first_name, lef.last_name,
        lef.bio, lef.specialties, lef.destinations,
        lef.hourly_rate, lef.years_of_experience,
        lef.availability, lef.response_time,
        u.profile_image_url,
        COALESCE(AVG(rr.rating), 0)::numeric(3,1) as avg_rating,
        COUNT(rr.id) as review_count
      FROM local_expert_forms lef
      JOIN users u ON u.id = lef.user_id
      LEFT JOIN review_ratings rr ON rr.local_expert_id = lef.user_id
      WHERE lef.status = 'approved'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(lef.destinations) d
          WHERE lower(d) LIKE ${destPattern}
        )
      GROUP BY lef.id, lef.user_id, lef.first_name, lef.last_name, lef.bio,
               lef.specialties, lef.destinations, lef.hourly_rate,
               lef.years_of_experience, lef.availability, lef.response_time,
               u.profile_image_url
      ORDER BY avg_rating DESC, review_count DESC
      LIMIT 20
    `);
    return result.rows || [];
  }
  const result = await db.execute(sql`
    SELECT
      lef.id, lef.user_id, lef.first_name, lef.last_name,
      lef.bio, lef.specialties, lef.destinations,
      lef.hourly_rate, lef.years_of_experience,
      lef.availability, lef.response_time,
      u.profile_image_url,
      COALESCE(AVG(rr.rating), 0)::numeric(3,1) as avg_rating,
      COUNT(rr.id) as review_count
    FROM local_expert_forms lef
    JOIN users u ON u.id = lef.user_id
    LEFT JOIN review_ratings rr ON rr.local_expert_id = lef.user_id
    WHERE lef.status = 'approved'
    GROUP BY lef.id, lef.user_id, lef.first_name, lef.last_name, lef.bio,
             lef.specialties, lef.destinations, lef.hourly_rate,
             lef.years_of_experience, lef.availability, lef.response_time,
             u.profile_image_url
    ORDER BY avg_rating DESC, review_count DESC
    LIMIT 20
  `);
  return result.rows || [];
}

// ─── Trip Expert Advisor ──────────────────────────────────────────────────────

export async function getTripExpertAdvisor(tripId: string): Promise<any | null> {
  const result = await db.execute(sql`
    SELECT
      tea.id as advisor_id, tea.status, tea.message, tea.expert_response, tea.assigned_at,
      lef.id as expert_form_id, lef.first_name, lef.last_name,
      lef.bio, lef.specialties, lef.destinations, lef.hourly_rate,
      u.profile_image_url,
      COALESCE(AVG(rr.rating), 0)::numeric(3,1) as avg_rating,
      COUNT(rr.id) as review_count
    FROM trip_expert_advisors tea
    JOIN local_expert_forms lef ON lef.user_id = tea.local_expert_id
    JOIN users u ON u.id = tea.local_expert_id
    LEFT JOIN review_ratings rr ON rr.local_expert_id = tea.local_expert_id
    WHERE tea.trip_id = ${tripId} AND tea.status IN ('pending', 'accepted')
    GROUP BY tea.id, tea.status, tea.message, tea.expert_response, tea.assigned_at,
             lef.id, lef.first_name, lef.last_name, lef.bio, lef.specialties,
             lef.destinations, lef.hourly_rate, u.profile_image_url
    ORDER BY tea.assigned_at DESC
    LIMIT 1
  `);
  return result.rows?.[0] ?? null;
}

export async function getExistingAdvisorRecord(tripId: string): Promise<{ id: string; status: string } | null> {
  const result = await db.execute(sql`
    SELECT id, status FROM trip_expert_advisors
    WHERE trip_id = ${tripId} AND status IN ('pending', 'accepted')
    LIMIT 1
  `);
  if (!result.rows || result.rows.length === 0) return null;
  return result.rows[0] as { id: string; status: string };
}

export async function isExpertApproved(expertUserId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT user_id FROM local_expert_forms
    WHERE user_id = ${expertUserId} AND status = 'approved'
  `);
  return !!(result.rows && result.rows.length > 0);
}

export async function getTripDestination(tripId: string): Promise<string> {
  const result = await db.execute(sql`SELECT destination FROM trips WHERE id = ${tripId}`);
  return String((result.rows?.[0] as any)?.destination || "unknown");
}

export async function getExpertQueuePosition(destination: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(MAX(queue_position), 0) + 1 as next_position
    FROM expert_requests
    WHERE destination_city = ${destination.toLowerCase()} AND status IN ('queued', 'assigned')
  `);
  return Number((result.rows?.[0] as any)?.next_position) || 1;
}

/**
 * Persist a successful lead-routing decision onto an existing expert_requests
 * row (created by POST /api/expert-requests). Distinct from assignExpertAdvisor
 * below, which inserts a brand-new row for the older advisor-assignment flow.
 * Non-fatal on failure — caller is fire-and-forget.
 */
export async function assignExpertAdvisorToRequest(
  requestId: string,
  expertUserId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE expert_requests
    SET assigned_expert_id = ${expertUserId}, status = 'assigned', assigned_at = NOW()
    WHERE id = ${requestId}
  `);
}

/**
 * F1 (workstation-flows audit, ratified 2026-07-26): materialize a routed lead in the expert's
 * request inbox. The auto-routed path stamped only `expert_requests.assigned_expert_id` — but
 * Assigned Trips reads `trip_expert_advisors`, and workspace auth requires the advisor row, so a
 * PAID request never reached the workstation (the notification pointed at work the expert could
 * not open). This creates the same `pending` advisor row the direct-pick path
 * (`assignExpertAdvisor`) writes, idempotently: an existing pending/accepted advisor row for
 * this (trip, expert) pair short-circuits, so re-routing or a direct pick + a routed lead never
 * duplicates the assignment.
 */
export async function ensureTripAdvisorRow(
  tripId: string,
  expertUserId: string,
  message?: string | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, message, assigned_at)
    SELECT ${crypto.randomUUID()}, ${tripId}, ${expertUserId}, 'pending', ${message ?? null}, NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM trip_expert_advisors
      WHERE trip_id = ${tripId} AND local_expert_id = ${expertUserId}
        AND status IN ('pending', 'accepted')
    )
  `);
}

export async function assignExpertAdvisor(values: {
  userId: string;
  tripId: string;
  expertUserId: string;
  destination: string;
  queuePosition: number;
  message?: string | null;
}): Promise<{ expertRequestId: string; advisorId: string }> {
  const expertRequestId = crypto.randomUUID();
  const advisorId = crypto.randomUUID();

  await db.execute(sql`BEGIN`);
  try {
    await db.execute(sql`
      INSERT INTO expert_requests (
        id, user_id, trip_id, destination_city, request_type,
        status, queue_position, notes, assigned_expert_id, created_at
      ) VALUES (
        ${expertRequestId}, ${values.userId}, ${values.tripId},
        ${values.destination.toLowerCase()}, 'review',
        'queued', ${values.queuePosition}, ${values.message ?? null},
        ${values.expertUserId}, NOW()
      )
    `);
    await db.execute(sql`
      INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, message, assigned_at)
      VALUES (${advisorId}, ${values.tripId}, ${values.expertUserId}, 'pending', ${values.message ?? null}, NOW())
    `);
    await db.execute(sql`COMMIT`);
  } catch (err) {
    await db.execute(sql`ROLLBACK`);
    throw err;
  }

  return { expertRequestId, advisorId };
}

export async function createExpertAssignmentNotification(
  expertUserId: string,
  tripId: string,
  tripLabel: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO notifications (id, user_id, type, title, message, data, is_read, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${expertUserId}, 'booking_request',
      'New trip assignment',
      ${`You've been assigned to ${tripLabel}. Open the workspace to start planning.`},
      ${JSON.stringify({ tripId, workspacePath: `/expert/workspace/${tripId}` })}::jsonb,
      false, NOW()
    )
  `);
}

export async function getTripLabel(tripId: string): Promise<string> {
  const result = await db.execute(sql`
    SELECT title, destination FROM trips WHERE id = ${tripId} LIMIT 1
  `);
  const row = (result.rows?.[0] as any) || {};
  return row.title || row.destination || "a new trip";
}

// ─── Expert Assigned Trips ────────────────────────────────────────────────────

export async function getExpertAssignedTrips(expertId: string): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT
      t.id as trip_id, t.title as trip_title, t.destination,
      t.start_date, t.end_date,
      tea.id as assignment_id, tea.status, tea.assigned_at,
      u.id as traveler_user_id,
      u.first_name as traveler_first_name,
      u.last_name as traveler_last_name,
      COALESCE(
        (SELECT COUNT(*) FROM trip_suggestions ts WHERE ts.trip_id = t.id AND ts.expert_id = ${expertId}),
        0
      )::int as suggestion_count
    FROM trip_expert_advisors tea
    JOIN trips t ON t.id = tea.trip_id
    JOIN users u ON u.id = t.user_id
    WHERE tea.local_expert_id = ${expertId} AND tea.status IN ('pending', 'accepted')
    ORDER BY tea.assigned_at DESC
  `);
  return (result.rows || []).map((row: any) => ({
    ...row,
    traveler_name: [row.traveler_first_name, row.traveler_last_name].filter(Boolean).join(" ") || "Traveler",
  }));
}

// ─── Trip Suggestions ─────────────────────────────────────────────────────────

export async function isTripOwner(tripId: string, userId: string): Promise<boolean> {
  const result = await db.execute(sql`SELECT id FROM trips WHERE id = ${tripId} AND user_id = ${userId}`);
  return !!(result.rows && result.rows.length > 0);
}

export async function isExpertAssignedToTrip(tripId: string, userId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT id FROM trip_expert_advisors
    WHERE trip_id = ${tripId} AND local_expert_id = ${userId} AND status IN ('pending', 'accepted')
    LIMIT 1
  `);
  return !!(result.rows && result.rows.length > 0);
}

export async function tripExistsById(tripId: string): Promise<boolean> {
  const result = await db.execute(sql`SELECT id FROM trips WHERE id = ${tripId}`);
  return !!(result.rows && result.rows.length > 0);
}

export async function getTripSuggestions(tripId: string, expertIdFilter?: string): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT
      ts.id, ts.trip_id, ts.expert_id, ts.type, ts.day_number,
      ts.title, ts.description, ts.estimated_cost, ts.status,
      ts.rejection_note, ts.created_at, ts.reviewed_at,
      u.first_name as expert_first_name, u.last_name as expert_last_name,
      u.profile_image_url as expert_profile_image_url
    FROM trip_suggestions ts
    JOIN users u ON u.id = ts.expert_id
    WHERE ts.trip_id = ${tripId}
      ${expertIdFilter ? sql`AND ts.expert_id = ${expertIdFilter}` : sql``}
    ORDER BY ts.created_at DESC
  `);
  return result.rows || [];
}

export async function createTripSuggestion(values: {
  tripId: string;
  expertId: string;
  type: string;
  dayNumber?: number | null;
  title: string;
  description?: string | null;
  estimatedCost?: string | null;
}): Promise<string> {
  const suggestionId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO trip_suggestions (id, trip_id, expert_id, type, day_number, title, description, estimated_cost, status, created_at)
    VALUES (${suggestionId}, ${values.tripId}, ${values.expertId}, ${values.type},
            ${values.dayNumber ?? null}, ${values.title}, ${values.description ?? null},
            ${values.estimatedCost ?? null}, 'pending', NOW())
  `);
  return suggestionId;
}

export async function getPendingSuggestion(suggestionId: string, tripId: string): Promise<any | null> {
  const result = await db.execute(sql`
    SELECT id, type, day_number, title, description, estimated_cost
    FROM trip_suggestions
    WHERE id = ${suggestionId} AND trip_id = ${tripId} AND status = 'pending'
  `);
  return result.rows?.[0] ?? null;
}

export async function updateSuggestionStatus(
  suggestionId: string,
  tripId: string,
  status: string,
  rejectionNote?: string | null,
): Promise<void> {
  await db.execute(sql`
    UPDATE trip_suggestions
    SET status = ${status}, rejection_note = ${rejectionNote ?? null}, reviewed_at = NOW()
    WHERE id = ${suggestionId} AND trip_id = ${tripId}
  `);
}

export async function getGeneratedItinerary(tripId: string): Promise<{ id: string; itinerary_data: any } | null> {
  const result = await db.execute(sql`
    SELECT id, itinerary_data FROM generated_itineraries
    WHERE trip_id = ${tripId} AND status = 'generated'
    ORDER BY created_at DESC LIMIT 1
  `);
  return result.rows?.[0] as { id: string; itinerary_data: any } | null ?? null;
}

export async function updateGeneratedItineraryData(itineraryId: string, data: any): Promise<void> {
  await db.execute(sql`
    UPDATE generated_itineraries
    SET itinerary_data = ${JSON.stringify(data)}::jsonb, updated_at = NOW()
    WHERE id = ${itineraryId}
  `);
}

// ─── Traveler Profile ─────────────────────────────────────────────────────────

export async function getTravelerProfile(tripId: string): Promise<any | null> {
  const result = await db.execute(sql`
    SELECT
      t.id as trip_id, t.title as trip_title, t.destination,
      t.start_date, t.end_date, t.number_of_travelers,
      u.id as traveler_user_id,
      u.first_name, u.last_name, u.email, u.profile_image_url
    FROM trips t
    JOIN users u ON u.id = t.user_id
    WHERE t.id = ${tripId}
    LIMIT 1
  `);
  return result.rows?.[0] ?? null;
}
