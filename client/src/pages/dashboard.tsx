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

const CTA_CARDS = [
  {
    icon: "+",
    label: "New experience",
    sub: "Travel, wedding, event",
    href: "/experiences",
    testId: "cta-new-experience",
  },
  {
    icon: "✨",
    label: "AI planner",
    sub: "Get a plan in minutes",
    href: "/ai-assistant",
    testId: "cta-ai-planner",
  },
  {
    icon: "🔍",
    label: "Find experts",
    sub: "In your destinations",
    href: "/chat",
    testId: "cta-find-experts",
  },
];

export default function Dashboard() {
  const { data: trips, isLoading, isError } = useTrips();
  const { user } = useAuth();
  const { data: notificationsData } = useQuery<any[]>({ queryKey: ["/api/notifications"] });
  const { data: conversations } = useQuery<any[]>({ queryKey: ["/api/conversations"] });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF385C]" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-12 text-center">
          <h2 className="text-2xl font-bold text-destructive">Something went wrong</h2>
          <p className="text-muted-foreground mt-2">Could not load your trips. Please try again later.</p>
        </div>
      </DashboardLayout>
    );
  }

  const now = new Date();
  const allPlans = trips || [];
  const activePlans = allPlans.filter(t => {
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    return end >= now;
  });
  const pastTrips = allPlans.filter(t => new Date(t.endDate) < now);

  const actionsNeeded = (notificationsData ?? []).filter(n => !n.read && (n.type === "urgent" || n.type === "action")).length;

  const greetingSub = activePlans.length > 0
    ? `${activePlans.length} active plan${activePlans.length !== 1 ? "s" : ""}${actionsNeeded > 0 ? ` · ${actionsNeeded} action${actionsNeeded !== 1 ? "s" : ""} needed today` : ""}`
    : pastTrips.length > 0
    ? "Ready for your next adventure?"
    : "Start planning your first experience";

  const destinations = activePlans.map(t => t.destination).filter(Boolean);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div
          className="text-[22px] font-medium text-foreground pt-4 pb-1"
          data-testid="text-welcome"
        >
          Welcome back, {user?.firstName || "Traveler"}
        </div>
        <div className="text-[14px] text-muted-foreground mb-4" data-testid="text-greeting-sub">
          {greetingSub}
        </div>

        <TravelPulseTicker />

        <div className="flex gap-2.5 mb-[18px]">
          {CTA_CARDS.map(card => (
            <Link key={card.testId} href={card.href} className="flex-1">
              <div
                className="bg-muted/50 hover:bg-muted rounded-xl px-3 py-4 cursor-pointer text-center transition-colors"
                data-testid={card.testId}
              >
                <div className="text-[18px] mb-1">{card.icon}</div>
                <div className="text-[13px] font-medium text-foreground">{card.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{card.sub}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-sm font-medium text-foreground mb-3 flex items-center justify-between">
          <span>Your active plans</span>
          {activePlans.length > 0 && (
            <Link href="/my-trips">
              <span className="text-[12px] text-[#2E8B8B] cursor-pointer hover:underline" data-testid="link-view-all-plans">
                View all
              </span>
            </Link>
          )}
        </div>

        {activePlans.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6" data-testid="active-plans-grid">
            {activePlans.slice(0, 6).map((trip, i) => (
              <DashboardPlanCard
                key={trip.id}
                trip={trip}
                index={i}
                conversations={conversations}
                notifications={notificationsData}
              />
            ))}
          </div>
        ) : (
          <Card className="border-2 border-dashed border-border mb-6">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-[#FFE3E8] rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-[#FF385C]" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No active plans</h3>
              <p className="text-muted-foreground mb-4">Start planning your next adventure!</p>
              <Link href="/experiences">
                <Button className="bg-[#FF385C] hover:bg-[#E23350] text-white" data-testid="button-first-plan">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Plan
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <ActiveExpertsList />

        <ServicesScroll />

        <ExpertsScroll destinations={destinations} />

        <PastExperiencesScroll />
      </div>
    </DashboardLayout>
  );
}
