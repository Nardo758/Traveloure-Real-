import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Sparkles } from "lucide-react";
import { tripCardIsPrimary } from "@shared/trip-primary-surface";

/**
 * WhileYouWereAway — R-H "While you were away" digest. Last-visit marker is CLIENT-SIDE,
 * per-user (localStorage; no new table in v1): on mount, read the PREVIOUS marker, then
 * immediately overwrite it with "now" — so a same-session refresh doesn't re-show the same
 * digest, and every subsequent visit diffs against the visit before it.
 *
 * §13 honest-or-absent: every line below traces to a real row/endpoint —
 *   - diary rows        → GET /api/me/plan-activity?since=  (item_transition_log, non-traveler
 *                          actors: expert/agent/checkout — server/routes/plan-activity.routes.ts)
 *   - new notifications  → the SAME `/api/notifications` data the dashboard/bell already fetch
 *                          (passed in as a prop — no second fetch, no divergent count logic),
 *                          filtered to unread rows whose real `createdAt` is after the marker
 *   - destination trending → GET /api/travelpulse/cities (same query key as TravelPulsePanel —
 *                          shared React Query cache, no duplicate network call), matched against
 *                          the traveler's OWN active-trip destinations; a line renders only when a
 *                          real match carries real highlight/deal text
 *   - countdown          → the active trip's real `startDate` (already-fetched trip list)
 *
 * DECISION (recorded, not silent): on a user's very first-ever dashboard visit there is no prior
 * marker, so there is no honest "since last visit" window to diff against — the whole section
 * renders nothing rather than showing a half-empty box or a "caught up" message with nothing to
 * have caught up ON. From the second visit onward it always evaluates.
 */

interface DigestNotification {
  id: string | number;
  read?: boolean;
  createdAt?: string;
}

interface DigestTrip {
  id: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  finalizedAt?: string | Date | null;
}

interface WhileYouWereAwayProps {
  userId: string | null | undefined;
  notifications: DigestNotification[];
  activePlans: DigestTrip[];
  /** The dashboard's currently-selected/soonest trip — powers the countdown line. */
  selectedTrip: DigestTrip | null;
}

interface PlanActivityTransition {
  id: string;
  tripId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorType: string;
  createdAt: string;
  tripDestination: string | null;
  tripTitle: string | null;
  trackingNumber: string | null;
}

interface PlanActivityResponse {
  transitions: PlanActivityTransition[];
  since: string;
}

interface TravelPulseCityRow {
  cityName: string;
  currentHighlight?: string | null;
  dealAlert?: string | null;
}

interface TravelPulseCitiesResponse {
  cities: TravelPulseCityRow[];
}

function markerKey(userId: string): string {
  return `while-away-marker-${userId}`;
}

const ACTOR_LABEL: Record<string, string> = {
  expert: "Your expert",
  agent: "Your AI agent",
  checkout: "Checkout",
};

function formatDiaryLine(actorType: string, count: number, dest: string): string {
  const who = ACTOR_LABEL[actorType] ?? "An update";
  if (actorType === "checkout") {
    return `${count} item${count !== 1 ? "s" : ""} moved through checkout on ${dest}`;
  }
  return `${who} made ${count} update${count !== 1 ? "s" : ""} on ${dest}`;
}

export function WhileYouWereAway({ userId, notifications, activePlans, selectedTrip }: WhileYouWereAwayProps) {
  // undefined = not yet determined this mount; null = determined, no prior marker (first visit).
  const [prevMarker, setPrevMarker] = useState<string | null | undefined>(undefined);
  const hasInit = useRef(false);

  useEffect(() => {
    if (hasInit.current) return;
    if (!userId) return;
    hasInit.current = true;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(markerKey(userId));
      localStorage.setItem(markerKey(userId), new Date().toISOString());
    } catch {
      // best-effort — a storage failure must never block the dashboard
    }
    setPrevMarker(stored);
  }, [userId]);

  const { data: activityData } = useQuery<PlanActivityResponse>({
    queryKey: ["/api/me/plan-activity", prevMarker],
    queryFn: async () => {
      const res = await fetch(`/api/me/plan-activity?since=${encodeURIComponent(prevMarker as string)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch plan activity");
      return res.json();
    },
    enabled: !!prevMarker && !!userId,
    staleTime: 60_000,
  });

  // Same query key TravelPulsePanel uses — shared cache, no duplicate fetch once that panel has
  // loaded (and vice versa, whichever mounts first primes the cache for the other).
  const { data: pulseData } = useQuery<TravelPulseCitiesResponse>({
    queryKey: ["/api/travelpulse/cities", { limit: 10 }],
    queryFn: async () => {
      const res = await fetch("/api/travelpulse/cities?limit=10", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch trending cities");
      return res.json();
    },
    enabled: !!prevMarker,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (prevMarker === undefined) return null; // marker not yet read this mount
  if (prevMarker === null) return null; // first-ever visit — nothing honest to diff against

  // ── diary lines: group by (tripId, actorType), newest group first, capped ──────────────
  const groups = new Map<string, { actorType: string; dest: string; count: number; latest: string }>();
  for (const t of activityData?.transitions ?? []) {
    const dest = t.tripDestination?.split(",")[0]?.trim() || t.tripTitle || "your trip";
    const key = `${t.tripId}:${t.actorType}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (t.createdAt > existing.latest) existing.latest = t.createdAt;
    } else {
      groups.set(key, { actorType: t.actorType, dest, count: 1, latest: t.createdAt });
    }
  }
  const diaryLines = Array.from(groups.values())
    .sort((a, b) => (a.latest < b.latest ? 1 : -1))
    .slice(0, 4)
    .map((g) => formatDiaryLine(g.actorType, g.count, g.dest));

  // ── new notifications: reuse the already-fetched /api/notifications data (no new fetch,
  // no divergence from the bell's own read/unread semantics) — filtered to rows genuinely
  // created after the marker. ────────────────────────────────────────────────────────────
  const newNotifCount = notifications.filter(
    (n) => !n.read && !!n.createdAt && n.createdAt > prevMarker,
  ).length;

  // ── destination trending: only when a real active-trip destination appears in the real
  // travelpulse response with real highlight/deal text. ──────────────────────────────────
  let trendingLine: string | null = null;
  for (const trip of activePlans) {
    const destShort = trip.destination?.split(",")[0]?.trim().toLowerCase();
    if (!destShort) continue;
    const match = (pulseData?.cities ?? []).find((c) => {
      const cityLower = c.cityName?.toLowerCase();
      return !!cityLower && (cityLower === destShort || cityLower.includes(destShort) || destShort.includes(cityLower));
    });
    if (match) {
      const text = match.currentHighlight || match.dealAlert;
      if (text) {
        trendingLine = `${match.cityName} is trending: ${text}`;
        break;
      }
    }
  }

  // ── countdown: the active trip's real startDate, future-only. ──────────────────────────
  let countdownLine: string | null = null;
  if (selectedTrip?.startDate) {
    const start = new Date(selectedTrip.startDate);
    const now = new Date();
    if (!isNaN(start.getTime()) && start > now) {
      const daysUntil = Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
      const dest = selectedTrip.destination?.split(",")[0]?.trim() || "your trip";
      const primary = tripCardIsPrimary({
        finalizedAt: selectedTrip.finalizedAt,
        startDate: selectedTrip.startDate,
        endDate: selectedTrip.endDate,
      });
      countdownLine = primary
        ? `${daysUntil} day${daysUntil !== 1 ? "s" : ""} until ${dest} — your Trip Card is ready`
        : `${daysUntil} day${daysUntil !== 1 ? "s" : ""} until ${dest}`;
    }
  }

  const lines: string[] = [...diaryLines];
  if (newNotifCount > 0) {
    lines.push(`${newNotifCount} new notification${newNotifCount !== 1 ? "s" : ""}`);
  }
  if (trendingLine) lines.push(trendingLine);
  if (countdownLine) lines.push(countdownLine);

  return (
    <section className="mb-[22px]" data-testid="while-you-were-away-section">
      <div className="text-[13px] font-medium mb-2.5 flex items-center gap-1.5" style={{ color: "#1A1A18" }}>
        <Sparkles className="w-4 h-4" style={{ color: "#E85D55" }} />
        <span>While you were away</span>
      </div>
      <div
        className="rounded-xl px-4 py-3"
        style={{ background: "#FFFFFF", border: "0.5px solid #E8E8E2" }}
        data-testid="while-you-were-away-card"
      >
        {lines.length === 0 ? (
          <div className="text-[12px]" style={{ color: "#7A7A72" }} data-testid="while-you-were-away-empty">
            You're all caught up.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {lines.map((line, i) => (
              <li
                key={i}
                className="text-[12px] leading-snug flex items-start gap-1.5"
                style={{ color: "#1A1A18" }}
                data-testid={`while-you-were-away-line-${i}`}
              >
                <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#7A7A72" }} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
        {newNotifCount > 0 && (
          <div className="mt-2 pt-2" style={{ borderTop: "0.5px solid #E8E8E2" }}>
            <Link
              href="/inbox?tab=updates"
              className="text-[11px] font-medium hover:underline"
              style={{ color: "#2E8B8B" }}
              data-testid="while-you-were-away-view-notifications"
            >
              View notifications
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
