/**
 * The review board's map.
 *
 * LD 41 (ledger `2026-09-05-comparison-map-baseline-compare`, decision-maker ratified Sep 5,
 * 2026): the traveler's OWN plan is the first tab, and a compare toggle draws it beneath a
 * focused proposal as a second sequence line — so the board can answer "what would change?" on
 * one map instead of asking the reader to hold two tabs in their head.
 *
 * Honesty rules this surface keeps (§13, LD 22c):
 *  - Only stops with complete, persisted, valid coordinates are pinned (`buildProposalMapModel`).
 *  - Every series states its OWN "X of Y located" line; the two are never summed.
 *  - Connectors are straight lines drawn in the order the stops were emitted. They are SEQUENCE,
 *    not travel routing, and no distance or duration is derived from them.
 *  - Zero located stops on every drawn series ⇒ NO MAP AT ALL. Never a city-centre fallback.
 *
 * Both renderers draw both series: the keyed Google branch through `MapControlCenter`'s optional
 * `secondarySeries` prop, the keyless branch through `LeafletPlanMap`'s muted pins + dashed
 * route. Neither was forked into a compare-only twin (§18 rule 1).
 */
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
  buildComparisonMapModel,
  buildProposalMapSeries,
  buildProposalMapTabs,
  canCompareWithBaseline,
  findBaselineSource,
  defaultFocusedProposalId,
  locatedCountLine,
  type LocatedProposalItem,
  type ProposalMapSeries,
  type ProposalMapSource,
} from "@/lib/proposal-map-model";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const SEQUENCE_COLOR = "#64748B";
/** The comparison series reads muted + dashed on both renderers (see the legend below). */
const BASELINE_SEQUENCE_COLOR = "#94A3B8";
const BASELINE_DASH_ARRAY = "6 6";

/** Verbatim on both renderers: a connector claims order, never a route (§13, LD 22c). */
const SEQUENCE_CAPTION =
  "Lines connect stops in the order they are planned — they are not travel routes, and no distance or duration is implied.";

function toPlanCardActivities(items: LocatedProposalItem[]): PlanCardActivity[] {
  return items.map((item) => ({
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
}

function toPlanCardDay(items: LocatedProposalItem[]): PlanCardDay {
  return {
    dayNum: 1,
    date: "",
    label: "",
    activities: toPlanCardActivities(items),
    transports: [],
  };
}

function KeylessProposalMap({
  proposalId,
  items,
  secondaryItems,
}: {
  proposalId: string;
  items: LocatedProposalItem[];
  /** The comparison series' located stops; empty when nothing is being compared. */
  secondaryItems: LocatedProposalItem[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Ids are prefixed so the two series can never collide on a React key or a pin testid; the
  // pin's own identity is unchanged for the primary series.
  const leafletItems: LeafletPlanMapItem[] = [
    ...secondaryItems.map((item) => ({
      id: `baseline-${item.id}`,
      title: item.name,
      dayNumber: item.dayNumber,
      lat: item.lat,
      lng: item.lng,
      muted: true,
    })),
    ...items.map((item) => ({
      id: item.id,
      title: item.name,
      dayNumber: item.dayNumber,
      lat: item.lat,
      lng: item.lng,
    })),
  ];
  const routes: LeafletRoute[] = [
    ...(secondaryItems.length > 1
      ? [{
          day: 0,
          color: BASELINE_SEQUENCE_COLOR,
          points: secondaryItems.map((item) => [item.lat, item.lng] as [number, number]),
          dashArray: BASELINE_DASH_ARRAY,
        }]
      : []),
    ...(items.length > 1
      ? [{
          day: 0,
          color: SEQUENCE_COLOR,
          points: items.map((item) => [item.lat, item.lng] as [number, number]),
        }]
      : []),
  ];
  // Centre comes from a REAL located stop — the caller only mounts this when one exists.
  const centreSource = items[0] ?? secondaryItems[0]!;

  return (
    <div className="h-[360px] overflow-hidden rounded-xl" data-testid={`proposal-map-leaflet-${proposalId}`}>
      <LeafletPlanMap
        items={leafletItems}
        center={{ lat: centreSource.lat, lng: centreSource.lng }}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onGoToItem={setSelectedId}
        routes={routes}
      />
    </div>
  );
}

/** One legend swatch — solid for the focused series, dashed for the comparison one. */
function SeriesSwatch({ color, dashed }: { color: string; dashed: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-0 w-6 align-middle"
      style={{
        borderTopWidth: 2,
        borderTopStyle: dashed ? "dashed" : "solid",
        borderTopColor: color,
      }}
    />
  );
}

function LocatedLine({
  series,
  testId,
  swatchColor,
  dashed,
}: {
  series: ProposalMapSeries;
  testId: string;
  swatchColor: string;
  dashed: boolean;
}) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={testId}>
      <SeriesSwatch color={swatchColor} dashed={dashed} />
      {locatedCountLine(series)}
    </p>
  );
}

export function ProposalComparisonMap({ proposals }: { proposals: ProposalMapSource[] }) {
  const tabs = useMemo(() => buildProposalMapTabs(proposals), [proposals]);
  const [focusedId, setFocusedId] = useState(() => defaultFocusedProposalId(proposals));
  const [compareRequested, setCompareRequested] = useState(false);

  useEffect(() => {
    if (!tabs.some((tab) => tab.source.id === focusedId)) {
      setFocusedId(defaultFocusedProposalId(proposals));
    }
  }, [focusedId, tabs, proposals]);

  const focusedTab = tabs.find((tab) => tab.source.id === focusedId) ?? tabs[0];
  const baselineTab = tabs.find((tab) => tab.source.isBaseline) ?? null;
  const focusedResolvedId = focusedTab?.source.id ?? "";
  // The toggle is OMITTED, not disabled, on the baseline tab: a plan is not compared with itself.
  const compareAvailable = canCompareWithBaseline(proposals, focusedResolvedId);
  const compareOn = compareRequested && compareAvailable;

  const primarySeries = useMemo(
    () => (focusedTab ? buildProposalMapSeries(focusedTab) : null),
    [focusedTab],
  );
  const baselineSeries = useMemo(
    () => (baselineTab ? buildProposalMapSeries(baselineTab) : null),
    [baselineTab],
  );
  const model = useMemo(
    () => (primarySeries ? buildComparisonMapModel(primarySeries, baselineSeries, compareOn) : null),
    [primarySeries, baselineSeries, compareOn],
  );

  if (!focusedTab || !primarySeries || !model) return null;
  // `findBaselineSource` is the one baseline predicate; referenced here so a future reader sees
  // the pure module is the authority on which source is the plan (§18 rule 1).
  const hasBaselineTab = !!findBaselineSource(proposals);

  return (
    <section
      className="review-panel mb-4 overflow-hidden rounded-xl border"
      aria-labelledby="proposal-map-title"
      data-testid="proposal-comparison-map"
    >
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 id="proposal-map-title" className="text-sm font-semibold">Proposal map</h2>
          {model.secondary ? (
            <>
              <LocatedLine
                series={model.secondary}
                testId="proposal-map-located-baseline"
                swatchColor={BASELINE_SEQUENCE_COLOR}
                dashed
              />
              <LocatedLine
                series={model.primary}
                testId="proposal-map-located-proposal"
                swatchColor={SEQUENCE_COLOR}
                dashed={false}
              />
            </>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="proposal-map-located-single">
              {model.primary.located.length} of {model.primary.total} located
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a proposal map">
            {tabs.map((tab) => (
              <Button
                key={tab.source.id}
                type="button"
                size="sm"
                variant={tab.source.id === focusedResolvedId ? "default" : "outline"}
                aria-pressed={tab.source.id === focusedResolvedId}
                onClick={() => setFocusedId(tab.source.id)}
                data-testid={
                  tab.source.isBaseline
                    ? "proposal-map-tab-baseline"
                    : `proposal-map-tab-${tab.source.id}`
                }
              >
                {tab.label}
              </Button>
            ))}
          </div>
          {compareAvailable && baselineTab && (
            <Button
              type="button"
              size="sm"
              variant={compareOn ? "secondary" : "ghost"}
              aria-pressed={compareOn}
              onClick={() => setCompareRequested((on) => !on)}
              data-testid="proposal-map-compare-toggle"
            >
              {compareOn ? `Hide ${baselineTab.label}` : `Compare with ${baselineTab.label}`}
            </Button>
          )}
        </div>
      </div>

      {!model.hasAnyLocated ? (
        <div
          className="flex min-h-28 items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground"
          data-testid={`proposal-map-empty-${focusedResolvedId}`}
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {model.secondary
            ? "No located stops to map for either plan."
            : "No located stops to map for this proposal."}
        </div>
      ) : MAPS_KEY ? (
        <MapControlCenter
          key={`${focusedResolvedId}-${model.secondary?.id ?? "single"}`}
          tripId={`proposal-${focusedResolvedId}`}
          tripDestination=""
          days={[toPlanCardDay(model.primary.located)]}
          selectedDay={0}
          onSelectDay={() => {}}
          compact
          connectorMode="sequence"
          secondarySeries={
            model.secondary
              ? {
                  id: model.secondary.id,
                  label: model.secondary.label,
                  activities: toPlanCardActivities(model.secondary.located),
                }
              : null
          }
        />
      ) : (
        <KeylessProposalMap
          key={`${focusedResolvedId}-${model.secondary?.id ?? "single"}`}
          proposalId={focusedResolvedId}
          items={model.primary.located}
          secondaryItems={model.secondary?.located ?? []}
        />
      )}

      {model.hasAnyLocated && (
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground" data-testid="proposal-map-sequence-caption">
          {SEQUENCE_CAPTION}
          {!hasBaselineTab && " Your current plan is not on this board, so there is nothing to compare against."}
        </p>
      )}
    </section>
  );
}
