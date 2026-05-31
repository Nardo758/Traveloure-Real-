import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, ChevronRight, LayoutList, Map as MapIcon, MapPin, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDeleteTrip } from "@/hooks/use-trips";
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
  const [showChanges, setShowChanges] = useState(true);
  const [viewMode, setViewMode] = useState<"card" | "map">("card");
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();
  const deleteTrip = useDeleteTrip();

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    deleteTrip.mutate(trip.id);
  };

  const templateConfig = getTemplateConfig(trip.eventType);

  // Open destination in maps (phone-agnostic)
  const openInMaps = () => {
    if (!trip.destination) return;
    
    const query = encodeURIComponent(trip.destination);
    // Use generic geo: URI which works on both iOS and Android
    // Falls back to Google Maps web if geo: not supported
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isIOS) {
      // iOS: Apple Maps
      window.open(`maps://maps.apple.com/?q=${query}`, "_blank");
    } else {
      // Android/Desktop: Google Maps
      window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
    }
    
    toast({ title: "Opening Maps", description: trip.destination });
  };

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
      className="relative"
    >
      <button
        onClick={handleDelete}
        disabled={deleteTrip.isPending}
        data-testid={`button-delete-plan-${trip.id}`}
        title={confirming ? "Click again to confirm delete" : "Remove this plan"}
        className={`absolute -top-2.5 -right-2.5 z-20 w-7 h-7 rounded-full flex items-center justify-center shadow-md border transition-all duration-200 text-xs font-bold
          ${confirming
            ? "bg-red-500 border-red-600 text-white scale-110"
            : "bg-white dark:bg-gray-800 border-border text-muted-foreground hover:bg-red-50 hover:border-red-300 hover:text-red-500 dark:hover:bg-red-950"
          }`}
      >
        {confirming ? "?" : <X className="w-3.5 h-3.5" />}
      </button>

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

        <div className="px-5 pb-5 pt-2 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-shrink-0"
            onClick={openInMaps}
            data-testid={`button-open-maps-${trip.id}`}
          >
            <MapPin className="w-3.5 h-3.5 mr-1" />
            Maps
          </Button>
          <Link href={`/itinerary/${trip.id}`} className="flex-1">
            <Button
              size="sm"
              className="w-full text-xs font-semibold"
              data-testid={`button-view-itinerary-${trip.id}`}
            >
              <Calendar className="w-3.5 h-3.5 mr-1" />
              View Itinerary
              <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </Link>
        </div>
      </Card>
    </motion.div>
  );
}
