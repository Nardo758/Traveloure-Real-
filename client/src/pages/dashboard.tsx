import { useTrips } from "@/hooks/use-trips";
import { Link } from "wouter";
import { Plus, Loader2, Bookmark } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { useQuery } from "@tanstack/react-query";
import { PlanCard } from "@/components/plancard/PlanCard";
import type { PlanCardTrip } from "@/components/plancard/plancard-types";
import { TravelPulsePanel } from "@/components/dashboard/TravelPulsePanel";
import { ActionItemsPanel } from "@/components/dashboard/ActionItemsPanel";
import { ActiveExpertsPanel } from "@/components/dashboard/ActiveExpertsPanel";
import { TopExpertsPanel } from "@/components/dashboard/TopExpertsPanel";
import { RecommendedServices } from "@/components/dashboard/RecommendedServices";

interface Notification {
  id: string | number;
  title?: string;
  message?: string;
  type?: string;
  createdAt?: string;
  tripId?: string | null;
  read?: boolean;
}

interface Conversation {
  id: number;
  title: string;
  userId?: string | null;
  createdAt: string;
}

const CTA_CARDS = [
  {
    icon: "+",
    label: "New experience",
    sub: "Travel, wedding, event",
    href: "/experiences",
    testId: "cta-new-experience",
  },
  {
    icon: "◆",
    label: "Credits",
    sub: "", // Will be dynamically set
    href: "/credits",
    testId: "cta-credits",
  },
  {
    icon: "🔍",
    label: "Find experts",
    sub: "In your destinations",
    href: "/experts",
    testId: "cta-find-experts",
  },
];

function SavedTripsLink() {
  const { data: savedTrips } = useQuery<{ id: string }[]>({
    queryKey: ["/api/saved-trips"],
  });

  const count = savedTrips?.length ?? 0;
  if (count === 0) return null;

  return (
    <Link href="/my-trips">
      <div
        className="flex items-center gap-2.5 rounded-[10px] p-3 cursor-pointer hover:opacity-80 transition-opacity"
        style={{ background: "#FFFFFF", border: "0.5px solid #E8E8E2" }}
        data-testid="link-saved-trips"
      >
        <Bookmark className="w-4 h-4 flex-shrink-0" style={{ color: "#E85D55" }} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium" style={{ color: "#1A1A18" }}>{count} saved for later</div>
          <div className="text-[9px]" style={{ color: "#7A7A72" }}>
            View in My Plans
          </div>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: "rgba(232,93,85,0.1)", color: "#E85D55" }}
        >
          {count}
        </span>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { data: trips, isLoading, isError } = useTrips();
  const { user } = useAuth();
  const { data: notificationsData, isLoading: notifLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });
  const { data: conversations, isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });
  const { data: creditsData } = useQuery<{ balance: number }>({
    queryKey: ["/api/credits/balance"],
    retry: false,
  });
  const { data: tripScores } = useQuery<Array<{ tripId: string; optimizationScore: number | null; shareToken: string | null }>>({
    queryKey: ["/api/dashboard/trip-scores"],
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#E85D55" }} />
        </div>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center">
          <h2 className="text-2xl font-bold text-destructive">Something went wrong</h2>
          <p className="text-muted-foreground mt-2">Could not load your trips. Please try again later.</p>
        </div>
      </DashboardLayout>
    );
  }

  const now = new Date();
  const allPlans = trips ?? [];
  const activePlans = allPlans.filter(t => new Date(t.endDate) >= now);

  const notifications = notificationsData ?? [];
  const actionsNeeded = notifications.filter(
    n => !n.read && (n.type === "urgent" || n.type === "action")
  ).length;

  const greetingSub =
    activePlans.length > 0
      ? `${activePlans.length} active plan${activePlans.length !== 1 ? "s" : ""}${
          actionsNeeded > 0
            ? ` · ${actionsNeeded} action${actionsNeeded !== 1 ? "s" : ""} needed today`
            : ""
        }`
      : allPlans.length > 0
      ? "Ready for your next adventure?"
      : "Start planning your first experience";

  const destinations = activePlans.map(t => t.destination).filter(Boolean);
  const convList = conversations ?? [];
  const scoreMap = new Map((tripScores ?? []).map(s => [s.tripId, s]));

  return (
    <DashboardLayout>
      <div className="px-4 py-5" data-testid="traveler-dashboard">
        {/* Greeting — full width above panels */}
        <div className="pt-4 mb-4">
          <div
            className="text-[22px] font-medium pb-0.5"
            style={{ color: "#1A1A18" }}
            data-testid="text-welcome"
          >
            Welcome back, {user?.firstName || "Traveler"}
          </div>
          <div
            className="text-[14px]"
            style={{ color: "#7A7A72" }}
            data-testid="text-greeting-sub"
          >
            {greetingSub}
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="flex gap-4">
          {/* LEFT: Main content */}
          <div className="flex-1 min-w-0">
            {/* CTA Row */}
            <div className="flex gap-2 mb-[16px]">
              {CTA_CARDS.map((card) => {
                const sub =
                  card.testId === "cta-credits"
                    ? `${creditsData?.balance ?? 0} credits remaining`
                    : card.sub;
                return (
                  <Link
                    key={card.testId}
                    href={card.href}
                    className="flex-1"
                  >
                    <div
                      className="rounded-xl px-3 py-4 cursor-pointer text-center transition-colors hover:opacity-80"
                      style={{ background: "#F3F3EE" }}
                      data-testid={card.testId}
                    >
                      <div className="text-[18px] mb-1">{card.icon}</div>
                      <div
                        className="text-[13px] font-medium"
                        style={{ color: "#1A1A18" }}
                      >
                        {card.label}
                      </div>
                      <div
                        className="text-[11px] mt-0.5"
                        style={{ color: "#7A7A72" }}
                      >
                        {sub}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Active Plans */}
            <div
              className="text-sm font-medium mb-3 flex items-center justify-between"
              style={{ color: "#1A1A18" }}
            >
              <span>Your active plans</span>
              {activePlans.length > 0 && (
                <Link href="/my-trips">
                  <span
                    className="text-[12px] cursor-pointer hover:underline"
                    style={{ color: "#2E8B8B" }}
                    data-testid="link-view-all-plans"
                  >
                    View all
                  </span>
                </Link>
              )}
            </div>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-6"
              data-testid="active-plans-grid"
            >
              {activePlans.slice(0, 6).map((trip, i) => {
                const tripScore = scoreMap.get(trip.id);
                const resolvedShareToken = tripScore?.shareToken ?? (trip as any).shareToken ?? null;
                const planCardTrip: PlanCardTrip = {
                  id: trip.id,
                  destination: trip.destination ?? "",
                  title: trip.title ?? undefined,
                  startDate: trip.startDate ?? undefined,
                  endDate: trip.endDate ?? undefined,
                  numberOfTravelers: trip.numberOfTravelers ?? 1,
                  budget: trip.budget ?? undefined,
                  eventType: trip.eventType ?? undefined,
                  status: trip.status ?? undefined,
                  shareToken: resolvedShareToken,
                  trackingNumber: (trip as any).trackingNumber ?? null,
                  expertNotes: trip.expertNotes ?? null,
                };
                const score = tripScore
                  ? { tripId: trip.id, optimizationScore: tripScore.optimizationScore, shareToken: tripScore.shareToken }
                  : undefined;
                return (
                  <PlanCard
                    key={trip.id}
                    trip={planCardTrip}
                    score={score}
                    index={i}
                    conversations={convList}
                    notifications={notifications}
                  />
                );
              })}
              {activePlans.length < 2 && (
                <Link href="/experiences">
                  <div
                    className="rounded-[14px] flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors min-h-[220px]"
                    style={{
                      border: "2px dashed #E8E8E2",
                      background: "transparent",
                    }}
                    data-testid="create-new-plan-card"
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                      style={{ background: "#FFE3E8" }}
                    >
                      <Plus className="w-6 h-6" style={{ color: "#E85D55" }} />
                    </div>
                    <div
                      className="text-sm font-medium mb-1"
                      style={{ color: "#1A1A18" }}
                    >
                      Create new plan
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "#7A7A72" }}
                    >
                      Start a new adventure
                    </div>
                  </div>
                </Link>
              )}
            </div>

            <RecommendedServices destinations={destinations} />
          </div>

          {/* RIGHT: Intelligence panel */}
          <div className="w-[210px] flex-shrink-0 hidden lg:block">
            <div className="sticky top-16 space-y-3">
              <TravelPulsePanel />
              <ActionItemsPanel notifications={notifications} />
              <ActiveExpertsPanel
                conversations={convList}
                trips={activePlans}
              />
              <TopExpertsPanel destinations={destinations} />
              <SavedTripsLink />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
