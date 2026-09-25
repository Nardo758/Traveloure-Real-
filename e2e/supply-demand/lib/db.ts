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
