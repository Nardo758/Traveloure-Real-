import { useState } from "react";
import { useTrips } from "@/hooks/use-trips";
import { Link } from "wouter";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { useQuery } from "@tanstack/react-query";
import { WhileYouWereAway } from "@/components/dashboard/WhileYouWereAway";
import { ComingUp, useUpcoming } from "@/components/dashboard/ComingUp";
import { HomeCity } from "@/components/dashboard/HomeCity";
import { IntakePanel } from "@/components/intake-panel";
import { greetingSentence } from "@/lib/home-time-axis";

/**
 * Home — OWNS THE TIME AXIS (CLAUDE.md Locked Decision 45 (8); ledger `2026-09-07-home-time-axis`,
 * executing ruling row `2026-09-07-home-owns-time-axis`, which AMENDS R-A). Anatomy (artboard
 * `Home`, Console & AI Concierge brief § Home):
 *
 *   Greeting          — ONE sentence derived from the FIRST upcoming row (`greetingSentence`), a
 *                       neutral greeting when there is none; never "0 things are due".
 *   Coming up         — dated rows across EVERY plan, nearest first, from the ONE reader
 *                       `GET /api/me/upcoming`; a row with no date is omitted, never guessed.
 *   Since you were here — diary rows + pending suggestions (Accept / Decline inline, through the
 *                       ONE review rail) + a notifications count that links to Inbox. Messages
 *                       stay in Inbox.
 *   <City> · your city — renders only when `users.home_city` is set; trends from the real
 *                       endpoint, occasions from the ones the member registered.
 *   Start strip       — New plan (the IntakePanel door L2 landed — `2026-09-07-home-honesty`;
 *                       its collapse into the one modal is LD 42 D11, a later lane) · Start with AI
 *                       (the sidebar's own door, `/ai-assistant`, which L5 made a door).
 *
 * WHAT LEFT THIS PAGE, and where it lives now (ruling 8: no plan card, no counts, no messages):
 *   PlanCard (summary stage) + the trip-selector chips → My plans (`/my-trips`) and the slip.
 *   PlanSlipStrip (routing counts)                     → the My plans row (L3) and the slip.
 *   TodaysMove (count-derived single move)             → the slip's own status counts / Finish card.
 *   ActionItemsPanel (notification previews)           → Inbox (`/inbox?tab=updates`).
 *   ActiveExpertsPanel                                 → My plans rows and the slip's Expert card.
 *   TopExpertsPanel                                    → Experts (`/experts`).
 *   RecommendedServices                                → Discover / the slip's Build card.
 *   TravelPulsePanel (dark ticker)                     → the home-city block reads the SAME endpoint.
 *   SavedTripsSection / WishlistSection            → Discover (`/destinations`), moved by L11.
 */

interface Notification {
  id: string | number;
  title?: string;
  message?: string;
  type?: string;
  createdAt?: string;
  tripId?: string | null;
  // Server field (shared/schema.ts `is_read` → `isRead`); normalized to `read` below, mirroring
  // notifications.tsx so the digest's "new" count agrees with the bell everywhere.
  isRead?: boolean;
  read?: boolean;
}

const FRAUNCES = "'Fraunces', Georgia, serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export default function Dashboard() {
  const { data: trips, isLoading, isError } = useTrips();
  const { user } = useAuth();
  const { data: notificationsData } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });
  // R-C / L2 home-honesty (ledger `2026-09-07-home-honesty`): every create door on this page opens
  // the ONE IntakePanel. Kept as landed; the D11 modal-collapse is a separate lane.
  const [intakeOpen, setIntakeOpen] = useState(false);

  const now = new Date();
  const allPlans = trips ?? [];
  const activePlans = allPlans.filter((t) => new Date(t.endDate ?? 0) >= now);

  const upcoming = useUpcoming(!!user?.id);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: "var(--earn-coral-ink)" }} />
        </div>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center">
          <h2 className="text-2xl font-bold text-destructive">Something went wrong</h2>
          <p className="text-muted-foreground mt-2">Could not load your plans. Please try again later.</p>
        </div>
      </DashboardLayout>
    );
  }

  const notifications = (notificationsData ?? []).map((n) => ({ ...n, read: n.isRead ?? false }));

  // The greeting sentence is derived from the FIRST upcoming row and nothing else. While the
  // rows are loading there is no first row to derive from, so the line is withheld rather than
  // shown as the neutral greeting for a moment and then replaced (§13: a shown default and a
  // derived answer are different facts).
  const greeting = upcoming.data ? greetingSentence(upcoming.data.rows, now, user?.firstName) : null;

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6" data-testid="dashboard-content">
        {/* Greeting — Fraunces masthead, one derived sentence */}
        <div className="pt-4 mb-6">
          <div
            className="text-[10.5px] uppercase tracking-[0.12em] mb-1"
            style={{ fontFamily: MONO, color: "var(--earn-muted)" }}
          >
            home
          </div>
          <h1
            className="text-[26px] leading-tight"
            style={{ fontFamily: FRAUNCES, color: "var(--earn-ink)" }}
            data-testid="text-welcome"
          >
            Welcome back, {user?.firstName || "Traveler"}
          </h1>
          {greeting && (
            <div className="text-[14px] mt-1" style={{ color: "var(--earn-muted)" }} data-testid="text-greeting-sub">
              {greeting}
            </div>
          )}
        </div>

        <div className="flex gap-6">
          {/* LEFT: the time axis */}
          <div className="flex-1 min-w-0">
            <ComingUp data={upcoming.data} isLoading={upcoming.isLoading} now={now} />

            <WhileYouWereAway userId={user?.id} notifications={notifications} activePlans={activePlans} />

            {/* Start strip (also rendered in the right rail on wide screens) */}
            <div className="grid grid-cols-2 gap-3 mb-7 lg:hidden" data-testid="start-strip-mobile">
              <StartTiles onNewPlan={() => setIntakeOpen(true)} />
            </div>

            {/* Saved places LEFT this page with lane L11 (ledger `2026-09-07-discover-in-shell`)
                — they render on Discover's Destinations surface now. Home owns the TIME AXIS and
                nothing else (Locked Decision 45 (8)). */}
          </div>

          {/* RIGHT rail */}
          <div className="w-[280px] flex-shrink-0 hidden lg:block">
            <div className="sticky top-16 space-y-4">
              <div className="grid grid-cols-1 gap-3" data-testid="start-strip">
                <StartTiles onNewPlan={() => setIntakeOpen(true)} />
              </div>
              <HomeCity enabled={!!user?.id} />
            </div>
          </div>
        </div>
      </div>

      <IntakePanel open={intakeOpen} onOpenChange={setIntakeOpen} />
    </DashboardLayout>
  );
}

/** The two start tiles: New plan (the IntakePanel door) · Start with AI (the sidebar's AI door). */
function StartTiles({ onNewPlan }: { onNewPlan: () => void }) {
  const tile = "rounded-[14px] px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--earn-chip)] w-full";
  const tileStyle = { background: "var(--earn-card)", border: "1px solid var(--earn-border)" } as const;
  return (
    <>
      <button type="button" className={tile} style={tileStyle} onClick={onNewPlan} data-testid="cta-new-experience">
        <div className="flex items-center gap-2 text-[13.5px] font-medium" style={{ color: "var(--earn-ink)" }}>
          <Plus className="w-4 h-4" style={{ color: "var(--earn-coral-ink)" }} />
          New plan
        </div>
        <div className="text-[11.5px] mt-0.5" style={{ color: "var(--earn-muted)" }}>
          Opens the planner.
        </div>
      </button>
      <Link href="/ai-assistant" className={tile} style={tileStyle} data-testid="cta-start-with-ai">
        <div className="flex items-center gap-2 text-[13.5px] font-medium" style={{ color: "var(--earn-ink)" }}>
          <Sparkles className="w-4 h-4" style={{ color: "var(--earn-teal-ink)" }} />
          Start with AI
        </div>
        <div className="text-[11.5px] mt-0.5" style={{ color: "var(--earn-muted)" }}>
          Describe it in a sentence.
        </div>
      </Link>
    </>
  );
}
