/**
 * moments-slot.tsx — the position-2 section slot (Landing v2.5 L4).
 *
 * ONE fetch, ONE branch: the ExperiencesRail ("What people are planning") HOLDS the slot until the
 * Moments resolver returns ≥1 live moment; then MomentsSection renders in its place. The landing
 * never loses a live section to a suppressed one (interim ruling; the day-one flip is automatic, no
 * deploy). The loading state renders the rail — never a blank slot, never a flash of Moments.
 *
 * The fetch here shares react-query's cache with MomentsSection's own query (same queryKey), so
 * this is not a second network call. When the eventual `experience_starts` rollup lands, the rail's
 * ticker returns and this interim fallback is revisited (filed).
 */
import { useQuery } from "@tanstack/react-query";
import { ExperiencesRail } from "./experiences-rail";
import { MomentsSection } from "./moments-section";

interface MomentsPayload { moments: unknown[] }

export function MomentsSlot() {
  const { data, isLoading } = useQuery<MomentsPayload>({
    queryKey: ["/api/landing/moments"],
    staleTime: 60_000,
  });
  const liveCount = data?.moments?.length ?? 0;
  // L4: loading OR zero live moments → the rail holds the slot; ≥1 → Moments.
  if (isLoading || liveCount === 0) return <ExperiencesRail />;
  return <MomentsSection />;
}
