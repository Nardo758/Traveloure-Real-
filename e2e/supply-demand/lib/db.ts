/**
 * db.ts — direct-Postgres read helper for the supply/demand e2e harness.
 *
 * Used for: DB before/after diffs (evidence), fee_bands reads (R-2: never a
 * fee/commission literal in a test), and assertions about rows the UI cannot
 * surface directly (e.g. whether a ready-made item references the live
 * provider_services row rather than a copy).
 *
 * READ-ONLY by convention in the specs; the one exception is account seeding,
 * which is itself always logged as a finding per R-1.
 */
import { Pool } from 'pg';

let pool: Pool | null = null;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await db().query(sql, params);
  return res.rows as T[];
}

/** Read a fee_bands row by bandKey. Throws if missing — a test must never fall back to a literal. */
export async function feeBand(bandKey: string): Promise<{
  bandKey: string;
  rateType: string;
  defaultRate: string;
  maxAmount: string | null;
  isActive: boolean;
}> {
  const rows = await q(
    `SELECT band_key AS "bandKey", rate_type AS "rateType", default_rate AS "defaultRate",
            max_amount AS "maxAmount", is_active AS "isActive"
       FROM fee_bands WHERE band_key = $1`,
    [bandKey],
  );
  if (rows.length === 0) {
    throw new Error(`fee_bands row not found for band_key=${bandKey} (R-2: no literal fallback allowed)`);
  }
  return rows[0] as any;
}

export async function userByEmail(email: string): Promise<any | null> {
  // ILIKE, not `=`: users.email is server-normalized to lowercase on signup, and
  // e2eEmail() now lowercases too (see run-id.ts's comment on the bug this caused),
  // but this stays case-insensitive as defense in depth against a caller passing a
  // differently-cased email.
  const rows = await q(`SELECT * FROM users WHERE email ILIKE $1`, [email]);
  return rows[0] ?? null;
}

export async function serviceByTitle(titleLike: string): Promise<any | null> {
  const rows = await q(
    `SELECT * FROM provider_services WHERE service_name ILIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [`%${titleLike}%`],
  );
  return rows[0] ?? null;
}

export async function countRow(table: string, where: string, params: any[] = []): Promise<number> {
  const rows = await q(`SELECT count(*)::int AS c FROM ${table} ${where ? 'WHERE ' + where : ''}`, params);
  return rows[0]?.c ?? 0;
}

/**
 * seedProviderIdentityAndBusinessVerification — TEST-FIXTURE-ONLY write, lead-authorized
 * (Pass 2 coordinator review, R-1 exception). `service_provider_forms.identity_verification_status`
 * and `.business_verification_status` are written ONLY by Stripe Identity/Connect webhooks in
 * production (server/utils/earner-verification.ts) and there is NO admin UI control for either —
 * unlike the category background-check flag, which DOES have one (/admin/providers "Mark
 * Verified") and must always be driven through that UI first. This helper exists solely so this
 * CI environment's Stripe-stub key does not block every provider-listing spec from reaching the
 * step it exists to test; every call site must log the write as a `SPEC_DIVERGENCE`/P3 finding
 * tagged HELD:stripe (see findings.ts callers), never call this silently, and never call it
 * against anything but a run-id-tagged e2e account.
 */
export async function seedProviderIdentityAndBusinessVerification(userId: string): Promise<void> {
  await db().query(
    `UPDATE service_provider_forms
        SET identity_verification_status = 'verified',
            business_verification_status = 'verified'
      WHERE user_id = $1`,
    [userId],
  );
}

/**
 * seedExpertIdentityVerification — Part 1b (Pass 2). TEST-FIXTURE-ONLY write, R-1 fallback, the
 * same class as `seedProviderIdentityAndBusinessVerification` above: `local_expert_forms
 * .identity_verification_status` is written ONLY by Stripe Identity webhooks in production
 * (`server/utils/earner-verification.ts`) and has no admin UI override, so it cannot be driven
 * through the real UI with the CI Stripe stub key (HELD:stripe). An expert offering can be
 * `approval_status='approved'` and still stuck `status='draft'` (never visible) purely because
 * this column reads 'pending' — confirmed against `resolvePublishVerification`
 * (server/services/publish-verification.service.ts): the expert branch requires ONLY
 * `identity_verification_status='verified'` (no business-verification column exists for an
 * individual expert). Production flips the held row itself through the SAME idempotent sweep,
 * `activateVerificationHeldListings` (same file) — `UPDATE provider_services SET status='active'
 * WHERE user_id=$1 AND approval_status='approved' AND status='draft'` — fired from the Stripe
 * Identity webhook handler. Reproduced verbatim here (not a new decision, the exact published
 * logic) since this harness cannot receive that webhook. Every call site must log the write as a
 * SPEC_DIVERGENCE/P3 finding tagged HELD:stripe, deduped with the provider identity/business
 * verification finding where the two are filed in the same run (same underlying gap: no non-Stripe
 * verification path for either role).
 */
export async function seedExpertIdentityVerification(userId: string): Promise<{ activatedListingCount: number }> {
  await db().query(
    `UPDATE local_expert_forms
        SET identity_verification_status = 'verified',
            identity_verified_at = NOW()
      WHERE user_id = $1`,
    [userId],
  );
  const activated = await q(
    `UPDATE provider_services
        SET status = 'active', updated_at = NOW()
      WHERE user_id = $1 AND approval_status = 'approved' AND status = 'draft'
      RETURNING id`,
    [userId],
  );
  return { activatedListingCount: activated.length };
}

/**
 * seedMeetingPin — TEST-FIXTURE-ONLY write, R-1 fallback (brief: "Where a UI step is
 * impossible, record the finding and fall back to the smallest DB write, logged as a
 * seeded step finding"). The in-person Logistics step's meeting pin
 * (client/src/components/provider/service-map-authoring.tsx) is placed by clicking a
 * Leaflet canvas and then geocoding the typed address via a THIRD-PARTY lookup ("Could
 * not find that meeting area" on a bare click-to-place attempt) — not reliably driveable
 * headless without a real, resolvable street address for this fixture's business. The
 * DRAFT row (button-save-draft) is NOT gated on this field, only final Submit is, so this
 * seeds coordinates directly onto an already-drafted row between draft-save and submit.
 */
export async function seedMeetingPin(
  serviceId: string,
  lat: number,
  lng: number,
  meetingPoint: string,
): Promise<void> {
  await db().query(
    `UPDATE provider_services SET latitude = $2, longitude = $3, meeting_point = $4 WHERE id = $1`,
    [serviceId, lat, lng, meetingPoint],
  );
}

/**
 * seedReadyMadeHero — TEST-FIXTURE-ONLY write, R-1 fallback (lead-authorized, coordinator
 * review). `assertReadyMadeComplete` (server/routes/ready-made.routes.ts:687 submit path) requires
 * BOTH `heroImageUrl` and `heroImageMeta.photographer` before a ready-made can be submitted, and
 * the only UI path to either is the Unsplash picker (`GET /api/expert/ready-made/hero-search`),
 * which answers `{ready:false, reason:"unsplash_not_configured"}` with no UNSPLASH_ACCESS_KEY —
 * absent in this environment, and the object-storage upload path also 503s here. This seeds a
 * stable, publicly-resolvable test image URL directly onto the two columns the gate reads, AFTER
 * the real picker has been attempted (so the finding records what the UI actually said first).
 * Every call site must log this as a SPEC_DIVERGENCE/P3 "seeded ready-made hero (HELD:unsplash)"
 * finding and must only ever target a run-id-tagged e2e ready-made row.
 */
export async function seedReadyMadeHero(readyMadeId: string): Promise<void> {
  await db().query(
    `UPDATE ready_made_trips
        SET hero_image_url = $2,
            hero_image_meta = $3::jsonb,
            updated_at = NOW()
      WHERE id = $1`,
    [
      readyMadeId,
      'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36',
      JSON.stringify({
        unsplashId: 'seeded-e2e-fixture',
        photographer: 'e2e supply-demand fixture (HELD:unsplash — seeded, not a real Unsplash credit)',
        profileUrl: null,
        downloadLocation: null,
      }),
    ],
  );
}

/**
 * seedReadyMadeConfirmedLegs — TEST-FIXTURE-ONLY write, the same R-1 class as `seedReadyMadeHero`.
 * The ready-made publish gate (R-ax, ledger `2026-10-04-ready-made-leg-gate`) needs a confirmed leg
 * with a chosen mode between every pair of consecutive LOCATED stops. The real path is
 * `POST /api/trips/:tripId/transport-legs/generate` then the author's confirm; with no Google key
 * and the travel-time service off (this CI), the engine routes nothing and reports every pair
 * `route_unavailable`. This seeds ONE confirmed `walk` leg for each such pair still lacking a picked
 * leg — the same pairing the gate reads (consecutive items per day in (sort_order, start_time)
 * order) — AFTER the real path was driven. Every call site logs it as a SPEC_DIVERGENCE/P3 finding.
 * Returns the number of legs seeded.
 */
export async function seedReadyMadeConfirmedLegs(tripId: string): Promise<number> {
  const res = await db().query(
    `WITH ordered AS (
       SELECT id, title, day_number, latitude, longitude,
              LEAD(id) OVER w AS next_id, LEAD(title) OVER w AS next_title,
              LEAD(latitude) OVER w AS next_lat, LEAD(longitude) OVER w AS next_lng
         FROM itinerary_items
        WHERE trip_id = $1
       WINDOW w AS (PARTITION BY day_number ORDER BY sort_order NULLS LAST, start_time NULLS LAST)
     ), gaps AS (
       SELECT o.* FROM ordered o
        WHERE o.next_id IS NOT NULL
          AND o.latitude IS NOT NULL AND o.longitude IS NOT NULL
          AND o.next_lat IS NOT NULL AND o.next_lng IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM transport_legs l
             WHERE l.trip_id = $1 AND l.variant_id IS NULL AND l.day_number = o.day_number
               AND l.from_activity_id = o.id AND l.to_activity_id = o.next_id
               AND l.proposal_status = 'confirmed' AND l.user_selected_mode IS NOT NULL)
     )
     INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
                                 to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display,
                                 recommended_mode, estimated_duration_minutes, proposal_status, user_selected_mode)
     SELECT gen_random_uuid()::text, $1, day_number, 0, id, title, latitude::float8, longitude::float8,
            next_id, next_title, next_lat::float8, next_lng::float8, 0, 'e2e seeded', 'walk', 10, 'confirmed', 'walk'
       FROM gaps
     RETURNING id`,
    [tripId],
  );
  return res.rowCount ?? 0;
}

/**
 * seedReadyMadeProposedLegs — TEST-FIXTURE-ONLY write, the same R-1 class as the two above, and
 * deliberately WEAKER than `seedReadyMadeConfirmedLegs`: it seeds the engine's half only. With no
 * Google key (this CI), `POST …/transport-legs/generate` routes nothing (`route_unavailable`), so no
 * leg exists for the author to review. This inserts ONE `proposed` leg — no chosen mode, no tip, no
 * stamp — for each consecutive pair of LOCATED stops lacking a leg, AFTER the real generate was
 * driven. The author's half (pick the mode, write the tip, Confirm → `checked_by/checked_at`) is then
 * done for real in the UI (R322). Every call site logs it as a SPEC_DIVERGENCE/P3 finding.
 */
export async function seedReadyMadeProposedLegs(tripId: string): Promise<number> {
  const res = await db().query(
    `WITH ordered AS (
       SELECT id, title, day_number, latitude, longitude,
              LEAD(id) OVER w AS next_id, LEAD(title) OVER w AS next_title,
              LEAD(latitude) OVER w AS next_lat, LEAD(longitude) OVER w AS next_lng
         FROM itinerary_items
        WHERE trip_id = $1
       WINDOW w AS (PARTITION BY day_number ORDER BY sort_order NULLS LAST, start_time NULLS LAST)
     ), gaps AS (
       SELECT o.* FROM ordered o
        WHERE o.next_id IS NOT NULL
          AND o.latitude IS NOT NULL AND o.longitude IS NOT NULL
          AND o.next_lat IS NOT NULL AND o.next_lng IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM transport_legs l
             WHERE l.trip_id = $1 AND l.variant_id IS NULL AND l.day_number = o.day_number
               AND l.from_activity_id = o.id AND l.to_activity_id = o.next_id)
     )
     INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
                                 to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display,
                                 recommended_mode, alternative_modes, estimated_duration_minutes, proposal_status)
     SELECT gen_random_uuid()::text, $1, day_number, 0, id, title, latitude::float8, longitude::float8,
            next_id, next_title, next_lat::float8, next_lng::float8, 0, 'e2e seeded', 'walk',
            '[{"mode":"train","durationMinutes":12,"costUsd":null,"energyCost":1,"reason":"e2e seeded"}]'::jsonb,
            10, 'proposed'
       FROM gaps
     RETURNING id`,
    [tripId],
  );
  return res.rowCount ?? 0;
}
