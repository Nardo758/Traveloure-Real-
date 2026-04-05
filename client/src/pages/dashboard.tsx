import { useTrips } from "@/hooks/use-trips";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, Loader2, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardLayout } from "@/components/dashboard-layout";
import { useQuery } from "@tanstack/react-query";
import { TravelPulseTicker } from "@/components/dashboard/TravelPulseTicker";
import { DashboardPlanCard } from "@/components/dashboard/DashboardPlanCard";
import { ActiveExpertsList } from "@/components/dashboard/ActiveExpertsList";
import { ServicesScroll } from "@/components/dashboard/ServicesScroll";
import { ExpertsScroll } from "@/components/dashboard/ExpertsScroll";
import { PastExperiencesScroll } from "@/components/dashboard/PastExperiencesScroll";
import { SavedTripsSection } from "@/components/dashboard/SavedTripsSection";

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
    icon: "✦",
    label: "AI planner",
    sub: "Get a plan in minutes",
    href: "/ai-assistant",
    testId: "cta-ai-planner",
  },
  {
    icon: "◎",
    label: "Find experts",
    sub: "In your destinations",
    href: "/chat",
    testId: "cta-find-experts",
  },
];

export default function Dashboard() {
  const { data: trips, isLoading, isError } = useTrips();
  const { user } = useAuth();
  const { data: notificationsData, isLoading: notifLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });
  const { data: conversations, isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
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

  return (
    <DashboardLayout>
      <div className="mb-1">
        <div
          className="text-[20px] font-medium mb-[3px]"
          style={{ color: "#1A1A18" }}
          data-testid="text-welcome"
        >
          Welcome back, {user?.firstName || "Traveler"}
        </div>
        <div className="text-[13px] mb-[14px]" style={{ color: "#7A7A72" }} data-testid="text-greeting-sub">
          {greetingSub}
        </div>
      </div>

      <TravelPulseTicker />

      <div className="flex gap-2 mb-4">
        {CTA_CARDS.map(card => (
          <Link key={card.testId} href={card.href} className="flex-1">
            <div
              className="rounded-[10px] px-2.5 py-3.5 cursor-pointer text-center transition-colors hover:opacity-80"
              style={{ background: "#F3F3EE" }}
              data-testid={card.testId}
            >
              <div className="text-[16px] mb-1">{card.icon}</div>
              <div className="text-[12px] font-medium" style={{ color: "#1A1A18" }}>{card.label}</div>
              <div className="text-[10px] mt-0.5" style={{ color: "#7A7A72" }}>{card.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      <SavedTripsSection />

      <div className="text-[13px] font-medium mb-2.5 flex items-center justify-between" style={{ color: "#1A1A18" }}>
        <span>Your active plans</span>
        {activePlans.length > 0 && (
          <Link href="/my-trips">
            <span
              className="text-[11px] cursor-pointer hover:underline"
              style={{ color: "#2E8B8B" }}
              data-testid="link-view-all-plans"
            >
              View all
            </span>
          </Link>
        )}
      </div>

      {activePlans.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-[22px]" data-testid="active-plans-grid">
          {activePlans.slice(0, 6).map((trip, i) => (
            <DashboardPlanCard
              key={trip.id}
              trip={trip}
              index={i}
              conversations={convList}
              notifications={notifications}
            />
          ))}
        </div>
      ) : (
        <Card className="border-2 border-dashed mb-6" style={{ borderColor: "#E8E8E2" }}>
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#FFE3E8" }}>
              <Calendar className="w-8 h-8" style={{ color: "#E85D55" }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: "#1A1A18" }}>No active plans</h3>
            <p className="mb-4" style={{ color: "#7A7A72" }}>Start planning your next adventure!</p>
            <Link href="/experiences">
              <Button className="text-white" style={{ background: "#E85D55" }} data-testid="button-first-plan">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Plan
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <ActiveExpertsList
        conversations={convList}
        trips={activePlans}
        isLoading={convsLoading}
      />

      <ServicesScroll />

      <ExpertsScroll destinations={destinations} />

      <PastExperiencesScroll />
    </DashboardLayout>
  );
}
