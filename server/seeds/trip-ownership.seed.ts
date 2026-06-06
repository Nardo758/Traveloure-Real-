/**
 * Trip Ownership Seed
 * Ensures every existing trip has an owner row in trip_collaborators.
 * Idempotent: uses INSERT ... ON CONFLICT DO NOTHING.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function seedTripOwnership(): Promise<{ inserted: number }> {
  const result = await db.execute(sql`
    INSERT INTO trip_collaborators (id, trip_id, user_id, role, invited_by, created_at)
    SELECT
      gen_random_uuid()::text,
      t.id,
      t.user_id,
      'owner',
      NULL,
      NOW()
    FROM trips t
    WHERE t.user_id IS NOT NULL
    ON CONFLICT (trip_id, user_id) DO NOTHING
  `);

  const inserted = (result as any).rowCount ?? 0;
  return { inserted };
}
