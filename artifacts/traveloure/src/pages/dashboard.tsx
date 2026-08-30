import { useEffect, useRef, useState } from "react";
import { useTrips } from "@/hooks/use-trips";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, Loader2, Calendar, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardLayout } from "@/components/dashboard-layout";
import { useQuery } from "@tanstack/react-query";
import { PlanCard } from "@/components/plancard/PlanCard";
import { SavedTripsSection } from "@/components/dashboard/SavedTripsSection";
import { WishlistSection } from "@/components/dashboard/WishlistSection";
import { TravelPulsePanel } from "@/components/dashboard/TravelPulsePanel";
import { ActionItemsPanel } from "@/components/dashboard/ActionItemsPanel";
import { ActiveExpertsPanel } from "@/components/dashboard/ActiveExpertsPanel";
import { TopExpertsPanel } from "@/components/dashboard/TopExpertsPanel";
import { RecommendedServices } from "@/components/dashboard/RecommendedServices";
import { PlanSlipStrip } from "@/components/dashboard/PlanSlipStrip";
import { WhileYouWereAway } from "@/components/dashboard/WhileYouWereAway";
import { TodaysMove } from "@/components/dashboard/TodaysMove";
import { IntakePanel } from "@/components/intake-panel";
import { syncActiveTripToContext } from "@/lib/trip-selection";

interface Notification {
  id: string | number;
  title?: string;
  message?: string;
  type?: string;
  createdAt?: string;
  tripId?: string | null;
  // Server field (shared/schema.ts `is_read` → `isRead`). `read` does not exist on the
  // API response — normalized to it below, mirroring notifications.tsx:109's
  // `read: n.isRead ?? false`, so "actions needed" and mark-as-read agree everywhere.
  isRead?: boolean;
  read?: boolean;
}

interface Conversation {
  id: number;
  title: string;
  userId?: string | null;
  createdAt: string;
}

// FIX 3 (W1c polish): dashboard selected-trip persistence. Keyed per-user so a shared/kiosk
// browser doesn't leak one account's selection into another's session. Read/write are
// best-effort — a storage failure (private mode, quota) must never break the dashboard.
function dashboardTripStorageKey(userId: string): string {
  return `dashboard-selected-trip-${userId}`;
}

function readStoredTripId(userId: string): string | null {
  try {
    return localStorage.getItem(dashboardTripStorageKey(userId));
  } catch {
    return null;
  }
}

function writeStoredTripId(userId: string, tripId: string): void {
  try {
    localStorage.setItem(dashboardTripStorageKey(userId), tripId);
  } catch {
    // best-effort — never block the UI on a storage failure
  }
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
    icon: "🔍",
    label: "Find experts",
    sub: "In your destinations",
    href: "/experts",
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
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  // R-A/R-C: the "New experience" CTA keeps its exact look but opens the intake panel
  // instead of navigating to /experiences (CONSOLE_REALIGN_BRIEF.md).
  const [intakeOpen, setIntakeOpen] = useState(false);
  // Only attempt the localStorage restore once per mount — subsequent trips-list refetches
  // (e.g. after a mutation) must not fight a since-made explicit selection.
  const hasAttemptedRestore = useRef(false);

  const now = new Date();
  const allPlans = trips ?? [];
  const activePlans = allPlans.filter(t => new Date(t.endDate ?? 0) >= now);

  // Default to soonest upcoming trip; user click overrides
  const soonestTripId = [...activePlans].sort(
    (a, b) => new Date(a.startDate ?? 0).getTime() - new Date(b.startDate ?? 0).getTime()
  )[0]?.id ?? null;
  const effectiveTripId = selectedTripId ?? soonestTripId;
  const selectedTrip = activePlans.find(t => t.id === effectiveTripId) ?? null;

  // FIX 3: restore the last-selected trip on reload, but only once the trips list has
  // actually loaded AND the stored id is still present in it — otherwise fall back to the
  // existing soonest-upcoming-trip default (effectiveTripId above already does that when
  // selectedTripId stays null).
  useEffect(() => {
    if (hasAttemptedRestore.current) return;
    if (isLoading || !user?.id) return;
    hasAttemptedRestore.current = true;
    const storedTripId = readStoredTripId(user.id);
    if (storedTripId && activePlans.some(t => t.id === storedTripId)) {
      setSelectedTripId(storedTripId);
    }
    // activePlans is derived from `trips` each render; keying off `trips`/`isLoading`/`user?.id`
    // avoids re-running on every render while still waiting for the real fetched list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user?.id, trips]);

  // #972: the trip chip below previously only flipped this page's own local
  // `selectedTripId` state — it never told the site-wide TripContext which
  // trip is now active, so /cart (and anywhere else reading TripContext) kept
  // acting on whichever trip was bound before the click. Selecting a chip
  // must atomically re-key TripContext to the clicked trip's OWN data (see
  // syncActiveTripToContext) in the SAME handler that updates local state.
  const selectTrip = (trip: (typeof activePlans)[number]) => {
    setSelectedTripId(trip.id);
    if (user?.id) writeStoredTripId(user.id, trip.id);
    syncActiveTripToContext(trip);
  };

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

  // Normalize the server's `isRead` → `read`, the same one-liner notifications.tsx:109
  // already uses — without it, `n.read` is undefined for every row (field-name
  // mismatch) and every notification counts as unread forever, even after being
  // marked read via the bell popover or the /notifications page.
  const notifications = (notificationsData ?? []).map(n => ({ ...n, read: n.isRead ?? false }));
  // R-I(2): "urgent"/"action" are notification `type`s no server code ever writes (grepped
  // every createNotification/insertNotification/db.insert(notifications) call site), so this
  // count was structurally always 0. The real, actually-written types that call a traveler to
  // act are booking_request, expert_suggestion, itinerary_update, and booking_confirmed.
  const ACTIONABLE_NOTIFICATION_TYPES = new Set([
    "booking_request",
    "expert_suggestion",
    "itinerary_update",
    "booking_confirmed",
  ]);
  const actionsNeeded = notifications.filter(
    n => !n.read && n.type && ACTIONABLE_NOTIFICATION_TYPES.has(n.type)
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
      <div className="p-3 sm:p-6" data-testid="dashboard-content">
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
        <div className="flex gap-5">
          {/* LEFT: Main content */}
          <div className="flex-1 min-w-0">
            {/* R-H: Today's move (single highest-urgency real item on the active trip) +
                While you were away (real-data digest since the last visit). Additive —
                the CTA row / saved trips / active plans layout below is unchanged (R-A). */}
            <TodaysMove
              tripId={selectedTrip?.id ?? null}
              destination={selectedTrip?.destination}
              startDate={selectedTrip?.startDate}
              endDate={selectedTrip?.endDate}
            />
            <WhileYouWereAway
              userId={user?.id}
              notifications={notifications}
              activePlans={activePlans}
              selectedTrip={selectedTrip}
            />

            {/* CTA Row */}
            <div className="flex gap-2.5 mb-[18px]">
              {CTA_CARDS.map((card) => {
                const sub = card.sub;
                const cardBody = (
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
                );
                // R-C: "New experience" keeps its look but opens the intake panel instead
                // of navigating to /experiences.
                if (card.href === "/experiences") {
                  return (
                    <button
                      key={card.testId}
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => setIntakeOpen(true)}
                    >
                      {cardBody}
                    </button>
                  );
                }
                return (
                  <Link
                    key={card.testId}
                    href={card.href}
                    className="flex-1"
                  >
                    {cardBody}
                  </Link>
                );
              })}
            </div>

            <SavedTripsSection />

            <WishlistSection />

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

            {activePlans.length > 0 ? (
              <div className="mb-6 max-w-[480px]" data-testid="active-plans-section">
                {/* Compact trip selector row — visible when there are 2+ plans */}
                {activePlans.length > 1 && (
                  <div
                    className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide"
                    data-testid="trip-selector-row"
                  >
                    {activePlans.map((trip) => {
                      const isSelected = trip.id === effectiveTripId;
                      const dest = trip.destination?.split(",")[0] ?? "Trip";
                      const d1 = trip.startDate
                        ? new Date(trip.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : null;
                      const d2 = trip.endDate
                        ? new Date(trip.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : null;
                      const start = new Date(trip.startDate ?? 0);
                      const end = new Date(trip.endDate ?? 0);
                      const isActive = now >= start && now <= end;
                      const daysUntil = start > now
                        ? Math.ceil((start.getTime() - now.getTime()) / 86400000)
                        : null;
                      const status = isActive
                        ? "Active"
                        : daysUntil != null && daysUntil <= 7
                        ? "Soon"
                        : "Upcoming";
                      return (
                        <button
                          key={trip.id}
                          onClick={() => selectTrip(trip)}
                          data-testid={`trip-chip-${trip.id}`}
                          className={`flex-shrink-0 text-left rounded-xl px-3 py-2.5 border transition-all ${
                            isSelected
                              ? "bg-primary/10 border-primary"
                              : "bg-card border-border hover:border-primary/40"
                          }`}
                        >
                          <div
                            className={`text-[13px] font-semibold truncate max-w-[140px] ${
                              isSelected ? "text-primary" : "text-foreground"
                            }`}
                          >
                            {dest}
                          </div>
                          {d1 && d2 && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {d1}–{d2}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-widest ${
                                isActive
                                  ? "text-green-600 dark:text-green-400"
                                  : isSelected
                                  ? "text-primary"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {status}
                            </span>
                            {trip.numberOfTravelers != null && trip.numberOfTravelers > 0 && (
                              <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                                <Users className="w-2.5 h-2.5" />
                                {trip.numberOfTravelers}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Single full PlanCard for the selected/soonest trip, capped by the R-A
                    compact slip strip (tracking ref + routing-status counts + "Open slip"). */}
                {selectedTrip && (
                  <>
                    <PlanSlipStrip tripId={selectedTrip.id} />
                    <PlanCard
                      trip={selectedTrip as any}
                      index={0}
                      role="owner"
                      stage="full"
                    />
                  </>
                )}
              </div>
            ) : (
              <Card
                className="border-2 border-dashed mb-6"
                style={{ borderColor: "#E8E8E2" }}
              >
                <CardContent className="p-8 text-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ background: "#FFE3E8" }}
                  >
                    <Calendar
                      className="w-8 h-8"
                      style={{ color: "#E85D55" }}
                    />
                  </div>
                  <h3
                    className="text-lg font-semibold mb-2"
                    style={{ color: "#1A1A18" }}
                  >
                    No active plans
                  </h3>
                  <p className="mb-4" style={{ color: "#7A7A72" }}>
                    Start planning your next adventure!
                  </p>
                  <Link href="/experiences">
                    <Button
                      className="text-white"
                      style={{ background: "#E85D55" }}
                      data-testid="button-first-plan"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Plan
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            <RecommendedServices destinations={destinations} />
          </div>

          {/* RIGHT: Intelligence panel */}
          <div className="w-[260px] flex-shrink-0 hidden lg:block">
            <div className="sticky top-16 space-y-3">
              <TravelPulsePanel />
              <ActionItemsPanel notifications={notifications} />
              <ActiveExpertsPanel
                conversations={convList}
                trips={activePlans}
              />
              <TopExpertsPanel destinations={destinations} />
            </div>
          </div>
        </div>
      </div>

      <IntakePanel open={intakeOpen} onOpenChange={setIntakeOpen} />
    </DashboardLayout>
  );
}
