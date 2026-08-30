/**
 * ClientFormatView — the Workstation canvas consumer for non-default client-channel formats
 * (DISTRIBUTION_FORMATS.md `client:*`, F2). Switches on the resolved format's grouping:
 *   "neighborhoods"  → KyotoCulturalView (client:kyoto-cultural)
 *   "venue-timeline" → VenueTimelineView (client:kyoto-wedding / client:event)
 *
 * A QUIET "Structure · Day list" toggle lets the expert flip to the same PlanCard-embedded
 * block the days-grouping renders today — the structured views are v1 renderings and the
 * expert still needs PlanCard's item controls for editing. Structure is the default.
 *
 * Expert-notes contract (binding): item-level notes render WITH their item inside whatever
 * group/panel the format assigns (handled by the views). No trip-level CLIENT-FACING notes
 * source exists in the canvas scope — the workspace's Build Notes card
 * (/api/trips/:tripId/expert-notes) is the expert's PRIVATE notes and is deliberately NOT
 * rendered here — so the views carry item-level notes only; a trip-level Expert Notes section
 * slot is added when a client-facing trip-notes source exists (no data source is invented).
 */
import { useState } from "react";
import type { ReactNode } from "react";
import type { BuildFormat } from "@/lib/build-formats/registry";
import { KyotoCulturalView } from "./KyotoCulturalView";
import { VenueTimelineView } from "./VenueTimelineView";
import { INK, MID, BRAND, type FormatDay } from "./format-shared";

interface ClientFormatViewProps {
  format: BuildFormat;
  destination: string | null;
  days: FormatDay[];
  bestSeason?: string | null;
  /** The exact PlanCard embedded block the days-grouping renders — the Day list view. */
  dayListView: ReactNode;
}

export function ClientFormatView({ format, destination, days, bestSeason, dayListView }: ClientFormatViewProps) {
  const [view, setView] = useState<"structure" | "day-list">("structure");

  const structure =
    format.grouping === "neighborhoods" ? (
      <KyotoCulturalView format={format} destination={destination} days={days} bestSeason={bestSeason ?? null} />
    ) : format.grouping === "venue-timeline" ? (
      <VenueTimelineView format={format} days={days} />
    ) : (
      // Defensive: a grouping without a structured view falls back to the day list.
      dayListView
    );

  return (
    <div data-testid="client-format-view">
      {/* Quiet view toggle — Structure (the format's rendering) · Day list (PlanCard editing). */}
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 10 }}>
        {(
          [
            { k: "structure" as const, l: "Structure" },
            { k: "day-list" as const, l: "Day list" },
          ]
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setView(t.k)}
            data-testid={`toggle-format-${t.k}`}
            style={{
              background: "none",
              border: "none",
              borderBottom: view === t.k ? `2px solid ${BRAND}` : "2px solid transparent",
              color: view === t.k ? INK : MID,
              fontSize: 12,
              fontWeight: 650,
              cursor: "pointer",
              padding: "0 1px 3px",
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {view === "structure" ? structure : dayListView}
    </div>
  );
}
