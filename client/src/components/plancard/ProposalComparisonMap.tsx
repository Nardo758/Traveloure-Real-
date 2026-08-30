import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MapControlCenter } from "./MapControlCenter";
import {
  LeafletPlanMap,
  type LeafletPlanMapItem,
  type LeafletRoute,
} from "@/components/expert/leaflet-plan-map";
import type { PlanCardActivity, PlanCardDay } from "./plancard-types";
import {
  buildProposalMapModel,
  type LocatedProposalItem,
  type ProposalMapSource,
} from "@/lib/proposal-map-model";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const SEQUENCE_COLOR = "#64748B";

function toPlanCardDay(items: LocatedProposalItem[]): PlanCardDay {
  const activities: PlanCardActivity[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.serviceType || "activity",
    status: "proposal",
    time: item.startTime || item.timeSlot || "",
    location: item.location || "",
    lat: item.lat,
    lng: item.lng,
    cost: item.price == null || !Number.isFinite(Number(item.price)) ? 0 : Number(item.price),
    comments: 0,
  }));
  return {
    dayNum: 1,
    date: "",
    label: "",
    activities,
    transports: [],
  };
}

function KeylessProposalMap({
  proposalId,
  items,
}: {
  proposalId: string;
  items: LocatedProposalItem[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const leafletItems: LeafletPlanMapItem[] = items.map((item) => ({
    id: item.id,
    title: item.name,
    dayNumber: item.dayNumber,
    lat: item.lat,
    lng: item.lng,
  }));
  const routes: LeafletRoute[] = items.length > 1
    ? [{
        day: 0,
        color: SEQUENCE_COLOR,
        points: items.map((item) => [item.lat, item.lng]),
      }]
    : [];

  return (
    <div className="h-[360px] overflow-hidden rounded-xl" data-testid={`proposal-map-leaflet-${proposalId}`}>
      <LeafletPlanMap
        items={leafletItems}
        center={{ lat: items[0].lat, lng: items[0].lng }}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onGoToItem={setSelectedId}
        routes={routes}
      />
    </div>
  );
}

export function ProposalComparisonMap({ proposals }: { proposals: ProposalMapSource[] }) {
  const [focusedId, setFocusedId] = useState(proposals[0]?.id ?? "");

  useEffect(() => {
    if (!proposals.some((proposal) => proposal.id === focusedId)) {
      setFocusedId(proposals[0]?.id ?? "");
    }
  }, [focusedId, proposals]);

  const focused = proposals.find((proposal) => proposal.id === focusedId) ?? proposals[0];
  const model = useMemo(
    () => buildProposalMapModel(focused?.items ?? []),
    [focused],
  );

  if (!focused) return null;

  return (
    <section
      className="review-panel mb-4 overflow-hidden rounded-xl border"
      aria-labelledby="proposal-map-title"
      data-testid="proposal-comparison-map"
    >
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="proposal-map-title" className="text-sm font-semibold">Proposal map</h2>
          <p className="text-xs text-muted-foreground">
            {model.located.length} of {model.total} located
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a proposal map">
          {proposals.map((proposal, index) => (
            <Button
              key={proposal.id}
              type="button"
              size="sm"
              variant={proposal.id === focused.id ? "default" : "outline"}
              aria-pressed={proposal.id === focused.id}
              onClick={() => setFocusedId(proposal.id)}
              data-testid={`proposal-map-tab-${proposal.id}`}
            >
              {proposal.name || `Proposal ${index + 1}`}
            </Button>
          ))}
        </div>
      </div>

      {model.located.length === 0 ? (
        <div
          className="flex min-h-28 items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground"
          data-testid={`proposal-map-empty-${focused.id}`}
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          No located stops to map for this proposal.
        </div>
      ) : MAPS_KEY ? (
        <MapControlCenter
          key={focused.id}
          tripId={`proposal-${focused.id}`}
          tripDestination=""
          days={[toPlanCardDay(model.located)]}
          selectedDay={0}
          onSelectDay={() => {}}
          compact
          connectorMode="sequence"
        />
      ) : (
        <KeylessProposalMap
          key={focused.id}
          proposalId={focused.id}
          items={model.located}
        />
      )}
    </section>
  );
}