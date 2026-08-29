/**
 * Resolved gem attribution (2026-08-29 Replit-audit ruling 1, ledger
 * 2026-08-29-replit-gem-audit): the expert behind
 * `travel_pulse_hidden_gems.curated_by_expert_id`, resolved server-side to a
 * REAL `users` row — or null. Never a fabricated name (§13).
 */
export interface GemCuratedBy {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}
