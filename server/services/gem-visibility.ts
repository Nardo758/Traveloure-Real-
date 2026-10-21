/**
 * The SQL half of gem visibility (ledger `2026-10-20-kyoto-feed-cleanup`).
 * `gemRowHidden` in shared/gem-visibility.ts is the same rule for a row already loaded.
 */
import { isNull } from "drizzle-orm";
import { travelPulseHappeningNow, travelPulseHiddenGems } from "@shared/schema";

/** Traveler-facing gem lists keep a row only while hidden_at is null. */
export function visibleGemCondition() {
  return isNull(travelPulseHiddenGems.hiddenAt);
}

/** Happening-now lists keep a row only while hidden_at is null. Same flag as gems. */
export function visibleHappeningNowCondition() {
  return isNull(travelPulseHappeningNow.hiddenAt);
}
