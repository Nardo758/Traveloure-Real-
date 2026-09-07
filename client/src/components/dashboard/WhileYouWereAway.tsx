import { useEffect, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Sparkles } from "lucide-react";
import { suggestionsQueryKey, useReviewSuggestion, type TripSuggestion } from "@/hooks/use-review-suggestion";

/**
 * WhileYouWereAway — rendered on Home as "Since you were here" (ledger `2026-09-07-home-time-axis`;
 * Home anatomy, artboard `Home`; originally R-H's digest). Last-visit marker is CLIENT-SIDE,
 * per-user (localStorage; no new table): on mount, read the PREVIOUS marker, then immediately
 * overwrite it with "now" — so a same-session refresh doesn't re-show the same digest, and every
 * subsequent visit diffs against the visit before it.
 *
 * §13 honest-or-absent: every line below traces to a real row/endpoint —
 *   - diary rows        → GET /api/me/plan-activity?since=  (item_transition_log, non-traveler
 *                          actors: expert/agent/checkout — server/routes/plan-activity.routes.ts),
 *                          each with a View action into its plan's slip
 *   - suggestions       → GET /api/trips/:id/suggestions for each active plan (the SAME per-trip
 *                          reader ExpertSuggestionsPanel uses), pending only, each with Accept /
 *                          Decline through the ONE `useReviewSuggestion` rail (§18 rule 1)
 *   - new notifications  → the SAME `/api/notifications` data the bell already fetches (passed in
 *                          as a prop — no second fetch), filtered to unread rows after the marker;
 *                          messages themselves stay in Inbox (ruling 8)
 *   - destination trending → GET /api/travelpulse/cities (same query key as the home-city block —
 *                          shared React Query cache), matched against the traveler's OWN active-trip
 *                          destinations; a line renders only when a real match carries real text
 *
 * WHAT LEFT THIS COMPONENT (ruling 8): the countdown line ("N days until <city>") — that is now a
 * dated row on Coming up (`trips.start_date`), and one derivation of it is enough (§18 rule 1).
 *
 * DECISION (recorded, not silent): on a user's very first-ever visit there is no prior marker, so
 * there is no honest "since last visit" window to diff against — the diary/notification lines are
 * withheld; pending suggestions still render, because a suggestion awaiting an answer is not a
 * "since last visit" fact but a standing one.
 */

interface DigestNotification {
  id: string | number;
  read?: boolean;
  createdAt?: string;
}

interface DigestTrip {
  id: string;
  destination?: string | null;
  title?: string | null;
}

interface WhileYouWereAwayProps {
  userId: string | null | undefined;
  notifications: DigestNotification[];
  activePlans: DigestTrip[];
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

const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function formatDiaryLine(actorType: string, count: number, dest: string): string {
  const who = ACTOR_LABEL[actorType] ?? "An update";
  if (actorType === "checkout") {
    return `${count} item${count !== 1 ? "s" : ""} moved through checkout on ${dest}`;
  }
  return `${who} made ${count} update${count !== 1 ? "s" : ""} on ${dest}`;
}

function planLabel(trip: DigestTrip | undefined, fallback: string): string {
  const title = (trip?.title ?? "").trim();
  if (title && title !== "My Trip") return title;
  return trip?.destination?.split(",")[0]?.trim() || fallback;
}

/** One pending suggestion row with its Accept / Decline through the shared rail. */
function SuggestionRow({ tripId, planName, suggestion }: { tripId: string; planName: string; suggestion: TripSuggestion }) {
  const review = useReviewSuggestion(tripId);
  const who = `${suggestion.expert_first_name ?? ""} ${suggestion.expert_last_name ?? ""}`.trim() || "Your expert";
  return (
    <li className="flex items-start justify-between gap-3 py-2" data-testid={`since-suggestion-${suggestion.id}`}>
      <div className="min-w-0">
        <div className="text-[12.5px] leading-snug" style={{ color: "var(--earn-ink)" }}>
          {who} suggests: {suggestion.title}
        </div>
        <div className="text-[10px] mt-0.5" style={{ fontFamily: MONO, color: "var(--earn-faint)" }}>
          {planName}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="text-[11px] font-medium px-2 py-1 rounded-md text-white disabled:opacity-60"
          style={{ background: "var(--earn-coral-ink)" }}
          disabled={review.isPending}
          onClick={() => review.mutate({ suggestionId: suggestion.id, status: "approved" })}
          data-testid={`since-suggestion-accept-${suggestion.id}`}
        >
          Accept
        </button>
        <button
          type="button"
          className="text-[11px] font-medium px-2 py-1 rounded-md disabled:opacity-60"
          style={{ border: "1px solid var(--earn-border)", color: "var(--earn-muted)" }}
          disabled={review.isPending}
          onClick={() => review.mutate({ suggestionId: suggestion.id, status: "rejected" })}
          data-testid={`since-suggestion-decline-${suggestion.id}`}
        >
          Decline
        </button>
      </div>
    </li>
  );
}

export function WhileYouWereAway({ userId, notifications, activePlans }: WhileYouWereAwayProps) {
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

  // Same query key the home-city block uses — shared cache, no duplicate fetch.
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

  // Pending suggestions across the active plans — one per-trip read each, the panel's own key.
  const suggestionQueries = useQueries({
    queries: activePlans.map((trip) => ({
      queryKey: suggestionsQueryKey(trip.id),
      enabled: !!userId,
      staleTime: 30_000,
    })),
  });
  const pendingSuggestions: Array<{ tripId: string; planName: string; suggestion: TripSuggestion }> = [];
  suggestionQueries.forEach((q, i) => {
    const trip = activePlans[i];
    const data = q.data as { suggestions?: TripSuggestion[] } | undefined;
    for (const s of data?.suggestions ?? []) {
      if (s.status === "pending") pendingSuggestions.push({ tripId: trip.id, planName: planLabel(trip, "your plan"), suggestion: s });
    }
  });

  if (prevMarker === undefined) return null; // marker not yet read this mount

  const tripsById = new Map(activePlans.map((t) => [t.id, t] as const));

  // ── diary lines: group by (tripId, actorType), newest group first, capped ──────────────
  const groups = new Map<string, { tripId: string; actorType: string; dest: string; count: number; latest: string }>();
  for (const t of activityData?.transitions ?? []) {
    const dest = planLabel(tripsById.get(t.tripId), t.tripDestination?.split(",")[0]?.trim() || t.tripTitle || "your plan");
    const key = `${t.tripId}:${t.actorType}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (t.createdAt > existing.latest) existing.latest = t.createdAt;
    } else {
      groups.set(key, { tripId: t.tripId, actorType: t.actorType, dest, count: 1, latest: t.createdAt });
    }
  }
  const diaryLines = Array.from(groups.values())
    .sort((a, b) => (a.latest < b.latest ? 1 : -1))
    .slice(0, 4)
    .map((g) => ({ tripId: g.tripId, text: formatDiaryLine(g.actorType, g.count, g.dest) }));

  // ── new notifications: reuse the already-fetched /api/notifications data. ────────────────
  const newNotifCount = prevMarker
    ? notifications.filter((n) => !n.read && !!n.createdAt && n.createdAt > prevMarker).length
    : 0;

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

  const firstVisit = prevMarker === null;
  const hasSinceLines = !firstVisit && (diaryLines.length > 0 || newNotifCount > 0 || !!trendingLine);

  // First-ever visit with nothing standing ⇒ nothing honest to show; render nothing.
  if (firstVisit && pendingSuggestions.length === 0) return null;

  return (
    <section className="mb-7" data-testid="while-you-were-away-section">
      <div className="text-[13px] font-medium mb-2.5 flex items-center gap-1.5" style={{ color: "var(--earn-ink)" }}>
        <Sparkles className="w-4 h-4" style={{ color: "var(--earn-coral-ink)" }} />
        <span>Since you were here</span>
        {prevMarker && (
          <span className="text-[10px] ml-1" style={{ fontFamily: MONO, color: "var(--earn-faint)" }}>
            {new Date(prevMarker).toLocaleDateString("en-US", { month: "short", day: "numeric" })} →
          </span>
        )}
      </div>
      <div
        className="rounded-[14px] px-4 py-3"
        style={{ background: "var(--earn-card)", border: "1px solid var(--earn-border)" }}
        data-testid="while-you-were-away-card"
      >
        {pendingSuggestions.length > 0 && (
          <ul className="divide-y" style={{ borderColor: "var(--earn-border)" }} data-testid="since-suggestions">
            {pendingSuggestions.slice(0, 4).map((p) => (
              <SuggestionRow key={p.suggestion.id} tripId={p.tripId} planName={p.planName} suggestion={p.suggestion} />
            ))}
          </ul>
        )}

        {!firstVisit && !hasSinceLines && pendingSuggestions.length === 0 && (
          <div className="text-[12px]" style={{ color: "var(--earn-muted)" }} data-testid="while-you-were-away-empty">
            You're all caught up.
          </div>
        )}

        {hasSinceLines && (
          <ul className={`space-y-1.5 ${pendingSuggestions.length > 0 ? "mt-2 pt-2" : ""}`} style={pendingSuggestions.length > 0 ? { borderTop: "1px solid var(--earn-border)" } : undefined}>
            {diaryLines.map((line, i) => (
              <li
                key={`diary-${i}`}
                className="text-[12px] leading-snug flex items-start justify-between gap-3"
                style={{ color: "var(--earn-ink)" }}
                data-testid={`while-you-were-away-line-${i}`}
              >
                <span className="flex items-start gap-1.5">
                  <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--earn-muted)" }} />
                  <span>{line.text}</span>
                </span>
                <Link href={`/plans/${line.tripId}`} className="text-[11px] font-medium hover:underline shrink-0" style={{ color: "var(--earn-teal-ink)" }}>
                  View
                </Link>
              </li>
            ))}
            {newNotifCount > 0 && (
              <li className="text-[12px] leading-snug flex items-start justify-between gap-3" style={{ color: "var(--earn-ink)" }}>
                <span className="flex items-start gap-1.5">
                  <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--earn-muted)" }} />
                  <span>{newNotifCount} new notification{newNotifCount !== 1 ? "s" : ""}</span>
                </span>
                <Link
                  href="/inbox?tab=updates"
                  className="text-[11px] font-medium hover:underline shrink-0"
                  style={{ color: "var(--earn-teal-ink)" }}
                  data-testid="while-you-were-away-view-notifications"
                >
                  Inbox
                </Link>
              </li>
            )}
            {trendingLine && (
              <li className="text-[12px] leading-snug flex items-start gap-1.5" style={{ color: "var(--earn-ink)" }}>
                <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--earn-muted)" }} />
                <span>{trendingLine}</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
