import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, ChevronRight, LayoutList, Map as MapIcon } from "lucide-react";
import { getTemplateConfig, type PlanCardProps, type PlanCardData, type PlanCardDay, type PlanCardChange } from "./plancard-types";
import { HeroSection } from "./HeroSection";
import { StatsRow, OptimizerMetrics } from "./StatsRow";
import { DaySelector } from "./DaySelector";
import { SectionTabs } from "./SectionTabs";
import { ChangeLogPanel } from "./ChangeLogPanel";
import { ActivitiesSection } from "./ActivitiesSection";
import { TransportSection } from "./TransportSection";
import { MapControlCenter } from "./MapControlCenter";

export function PlanCard({ trip, score, index = 0 }: PlanCardProps) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [section, setSection] = useState<"activities" | "transport">("activities");
  const [showChanges, setShowChanges] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "map">("card");

  const templateConfig = getTemplateConfig(trip.eventType);

  const { data: plancardData } = useQuery<PlanCardData>({
    queryKey: [`/api/trips/${trip.id}/plancard`],
    staleTime: 30000,
  });

  const days: PlanCardDay[] = plancardData?.days || [];
  const changeLog: PlanCardChange[] = plancardData?.changeLog || [];
  const metrics = plancardData?.metrics || {};
  const stats = plancardData?.stats || {};
  const day = days[selectedDay];

  const optimizationScore = score?.optimizationScore;
  const shareToken = score?.shareToken;

  const totalActivities = stats.totalActivities || days.reduce((s: number, d) => s + (d.activities?.length || 0), 0);
  const confirmedActivities = stats.confirmedActivities ?? days.reduce((s: number, d) => s + (d.activities?.filter((a) => a.status === "confirmed").length || 0), 0);
  const totalLegs = stats.totalLegs || days.reduce((s: number, d) => s + (d.transports?.length || 0), 0);
  const totalMinutes = stats.totalTransitMinutes || days.reduce((s: number, d) => s + (d.transports || []).reduce((t: number, tr) => t + (tr.duration || 0), 0), 0);
  const expertChanges = stats.pendingExpertChanges || changeLog.filter((c) => c.role === "expert" && c.type === "suggest").length;

  const transportLocked = day?.activities?.some((a) => a.status === "pending") ?? false;

  useEffect(() => {
    if (transportLocked && section === "transport") {
      setSection("activities");
    }
  }, [transportLocked, section]);

  const traveloureScore = metrics.traveloureScore || metrics.optimizationScore || optimizationScore;
  const totalCostNum = metrics.totalCost;
  const savingsNum = metrics.savings;
  const savingsPercentNum = metrics.savingsPercent;
  const wellnessTime = metrics.wellnessMinutes;
  const travelDistance = metrics.travelDistanceMinutes;
  const starDelta = metrics.starRatingDelta;

  const totalCostDisplay = totalCostNum != null ? `$${Number(totalCostNum).toLocaleString()}` : null;
  const savingsDisplay = savingsNum != null ? `$${Number(savingsNum).toLocaleString()}` : null;
  const savingsPercentDisplay = savingsPercentNum != null ? `${savingsPercentNum}%` : null;

  const perPersonFromMetrics = metrics.perPersonCost;
  const budgetDisplay = trip.budget ? `$${Number(trip.budget).toLocaleString()}` : null;
  const perPersonDisplay = perPersonFromMetrics != null
    ? `$${Number(perPersonFromMetrics).toLocaleString()}/person`
    : (trip.budget && trip.numberOfTravelers > 1
      ? `$${Math.round(Number(trip.budget) / trip.numberOfTravelers).toLocaleString()}/person`
      : null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      data-testid={`card-plan-${trip.id}`}
    >
      <Card className="overflow-hidden border border-border hover:shadow-xl transition-all duration-300 group bg-card">
        <HeroSection
          trip={trip}
          traveloureScore={traveloureScore}
          shareToken={shareToken}
          totalCost={totalCostDisplay}
          perPerson={perPersonDisplay}
          budget={budgetDisplay}
        />

        <div className="px-5 pt-3 flex gap-1.5" data-testid={`view-mode-toggle-${trip.id}`}>
          <button
            onClick={() => setViewMode("card")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all border-0 ${
              viewMode === "card"
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            data-testid={`btn-card-view-${trip.id}`}
          >
            <LayoutList className="w-4 h-4" /> Card View
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all border-0 ${
              viewMode === "map"
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            data-testid={`btn-map-view-${trip.id}`}
          >
            <MapIcon className="w-4 h-4" /> Map Control Center
          </button>
        </div>

        {viewMode === "card" ? (
          <>
            <StatsRow
              trip={trip}
              days={days}
              totalActivities={totalActivities}
              totalLegs={totalLegs}
              totalMinutes={totalMinutes}
              templateConfig={templateConfig}
            />

            <OptimizerMetrics
              tripId={trip.id}
              traveloureScore={traveloureScore}
              savings={savingsDisplay}
              savingsPercent={savingsPercentDisplay}
              wellnessTime={wellnessTime}
              travelDistance={travelDistance}
              starDelta={starDelta}
              totalCost={totalCostDisplay}
              perPerson={perPersonDisplay}
            />

            <DaySelector
              tripId={trip.id}
              days={days}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />

            <SectionTabs
              tripId={trip.id}
              section={section}
              onSetSection={setSection}
              showChanges={showChanges}
              onToggleChanges={() => setShowChanges(!showChanges)}
              templateConfig={templateConfig}
              dayActivityCount={day?.activities?.length || 0}
              dayTransportCount={day?.transports?.length || 0}
              confirmedActivities={confirmedActivities}
              totalActivities={totalActivities}
              transportLocked={transportLocked}
              changeLogCount={changeLog.length}
              expertChanges={expertChanges}
            />

            <ChangeLogPanel
              tripId={trip.id}
              showChanges={showChanges}
              changeLog={changeLog}
            />

            {section === "activities" && (
              <ActivitiesSection
                tripId={trip.id}
                day={day}
                templateConfig={templateConfig}
              />
            )}

            {section === "transport" && !transportLocked && (
              <TransportSection
                tripId={trip.id}
                tripDestination={trip.destination}
                day={day}
              />
            )}
          </>
        ) : (
          <MapControlCenter
            tripId={trip.id}
            tripDestination={trip.destination}
            days={days}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        )}

        <div className="px-5 pb-5 pt-2">
          <Link href={`/itinerary/${trip.id}`}>
            <Button
              className="w-full text-xs font-semibold"
              data-testid={`button-view-itinerary-${trip.id}`}
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              View Full Itinerary
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </Card>
    </motion.div>
  );
}
