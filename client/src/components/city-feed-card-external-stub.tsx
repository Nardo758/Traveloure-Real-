/**
 * Operation Trailhead T4.3 — external-stub card (traveler read-path for scraped content).
 *
 * A DISTINCT card treatment from bookable platform listings: a scraped/DMO stub is external
 * inventory (facts-and-links, NOT a bookable Traveloure service), so this card must never be
 * mistaken for one. It carries:
 *   - an explicit "From the web · not bookable here" inventory-class label,
 *   - facts only (name, area, a short factual line, place count) — NEVER scraped prose as
 *     editorial voice,
 *   - a source-link click-out that rides the EXISTING affiliate_clicks rail
 *     (POST /api/affiliates/track — tracked informational outbound, §16-compliant; T3's
 *     resolution-waterfall replaces this later), and
 *   - required attribution ("© OpenStreetMap contributors" when the stub is OSM-licensed).
 *
 * The booking CTA of a platform card is deliberately ABSENT here — the only action is "View
 * source", which leaves the platform to the source page.
 */
import { ExternalLink, Globe } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export interface ExternalStubData {
  id: string;
  inventoryClass: string; // 'external'
  name: string;
  city: string;
  country: string;
  neighborhood: string | null;
  contentType: string;
  shortDescription: string | null;
  primaryImageUrl: string | null;
  sourceUrl: string;
  sourcePageTitle: string | null;
  license: string | null;
  places: Array<{ id: string; name: string; position: number; latitude: string | null; longitude: string | null }>;
  placeCount: number;
}

/** OSM-derived stubs carry the ODbL obligation wherever they render. */
function isOsmLicensed(license: string | null): boolean {
  const l = (license || "").toLowerCase();
  return l.includes("osm") || l.includes("odbl") || l.includes("openstreetmap");
}

export function CityFeedCardExternalStub({ stub, city }: { stub: ExternalStubData; city: string }) {
  const locatedPlaces = stub.places.filter((p) => p.latitude != null && p.longitude != null);

  const handleViewSource = async () => {
    // Ride the existing click-out rail (tracked informational outbound) BEFORE leaving the platform.
    // Fire-and-forget: a tracking hiccup must never block the traveler's click.
    try {
      await apiRequest("POST", "/api/affiliates/track", {
        partner: `dmo:${stub.sourcePageTitle || stub.contentType || "external"}`,
        destination: city,
      });
    } catch {
      /* non-blocking — tracking is best-effort */
    }
    window.open(stub.sourceUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      data-testid={`external-stub-${stub.id}`}
      className="flex flex-col rounded-2xl border border-dashed border-muted-foreground/40 bg-muted/20 overflow-hidden"
    >
      {stub.primaryImageUrl && (
        <div className="relative h-36 w-full overflow-hidden">
          <img src={stub.primaryImageUrl} alt="" className="h-full w-full object-cover opacity-90" loading="lazy" />
        </div>
      )}
      <div className="flex flex-col gap-2 p-4">
        {/* Inventory-class label — the honesty guarantee: this is NOT a bookable platform service. */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          <span>From the web · not bookable here</span>
        </div>

        <h3 className="text-base font-semibold text-foreground leading-snug">{stub.name}</h3>

        <div className="text-xs text-muted-foreground">
          {stub.neighborhood ? `${stub.neighborhood} · ` : ""}
          {stub.city}
          {stub.placeCount > 0 && (
            <span> · {locatedPlaces.length} of {stub.placeCount} places located</span>
          )}
        </div>

        {stub.shortDescription && (
          // Facts only — rendered plainly, never as Traveloure's editorial voice.
          <p className="text-sm text-muted-foreground line-clamp-2">{stub.shortDescription}</p>
        )}

        <button
          type="button"
          onClick={handleViewSource}
          data-testid={`external-stub-source-${stub.id}`}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          View source
          <ExternalLink className="h-3.5 w-3.5" />
        </button>

        {/* Attribution travels with the card (required for OSM-licensed content). */}
        <div className="text-[10px] text-muted-foreground/70">
          {isOsmLicensed(stub.license)
            ? "© OpenStreetMap contributors"
            : `Source: ${stub.sourcePageTitle || "external site"}`}
        </div>
      </div>
    </div>
  );
}
