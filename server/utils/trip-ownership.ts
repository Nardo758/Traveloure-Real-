/**
 * Shared trip ownership verification — single source of truth.
 * Import this everywhere instead of defining verifyTripOwnership locally.
 */
import { storage } from '../storage';

/**
 * Returns true if userId owns the trip identified by tripId.
 * Handles both Drizzle camelCase (userId) and raw-SQL snake_case (user_id) shapes.
 */
export async function verifyTripOwnership(tripId: string, userId: string): Promise<boolean> {
  try {
    if (userId == null) return false;
    const trip = await storage.getTrip(tripId);
    if (!trip) return false;
    const owner = (trip as any).userId ?? (trip as any).user_id;
    return owner != null && owner === userId;
  } catch {
    return false;
  }
}
