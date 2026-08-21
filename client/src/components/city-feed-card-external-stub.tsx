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
import React from "react";
import { ExternalLink, Globe, Handshake, Store } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export interface ExternalStubData {
  id: string;
  inventoryClass: string; // 'external'
  // Trailhead T3.4 — the resolution PASS's stored class drives which CTA this card renders. Until a
  // pass runs (a HARD-STOP-gated event) every stub is 'external' and the card behaves exactly as under
  // T4.3 (inert mechanism). The card READS the server's class — it never derives it (L6 / §18-drift).
  resolutionClass?: string; // 'external' | 'provider' | 'affiliate'
  resolutionSubclass?: string | null; // 'affiliate_direct' | 'affiliate_ota' | null
  resolutionRef?: string | null; // provider_services.id | program+product ref; NEVER a raw URL
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

/**
 * PURE CTA resolver (Trailhead T3.4). Given a stub's resolved class, decide which booking-path CTA the
 * card renders — the ONE place this switch lives (L6). Class-distinct so a traveler always knows where
 * the action leads: on-platform / partner / leaving-to-source.
 *   • provider  → an INTERNAL listing CTA (a route href, NO outbound), pointing at /services/:ref.
 *   • affiliate → a PARTNER CTA that rides the in-platform booking-agent / affiliate_clicks rail
 *                 (never a raw window.open of a partner URL — §16). The client holds only a ref.
 *   • external  → the source-link CTA (the T4.3 behavior): tracked informational outbound.
 * An unknown class, or a provider/affiliate class with no ref, degrades safely to the external CTA
 * (§13 — never draw an on-platform/partner CTA we cannot honor).
 */
export type StubCtaKind = "provider" | "affiliate" | "external";
export interface StubCta {
  kind: StubCtaKind;
  label: string;
  /** Internal route for a provider CTA; null for affiliate/external (they act via a handler). */
  href: string | null;
}

export function resolveStubCta(stub: ExternalStubData): StubCta {
  const cls = stub.resolutionClass ?? "external";
  if (cls === "provider" && stub.resolutionRef) {
    return { kind: "provider", label: "View on Traveloure", href: `/services/${stub.resolutionRef}` };
  }
  if (cls === "affiliate" && stub.resolutionRef) {
    return { kind: "affiliate", label: "Book via partner", href: null };
  }
  return { kind: "external", label: "View source", href: null };
}

/** OSM-derived stubs carry the ODbL obligation wherever they render. */
function isOsmLicensed(license: string | null): boolean {
  const l = (license || "").toLowerCase();
  return l.includes("osm") || l.includes("odbl") || l.includes("openstreetmap");
}

export function CityFeedCardExternalStub({ stub, city }: { stub: ExternalStubData; city: string }) {
  const locatedPlaces = stub.places.filter((p) => p.latitude != null && p.longitude != null);

  const cta = resolveStubCta(stub);

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

  const handleAffiliate = async () => {
    // Affiliate resolution rides the EXISTING in-platform rail — NEVER a raw window.open of a partner
    // URL (§16). The client holds only a program+product ref; the server mints the deep-link and the
    // booking-agent handles it. Here we record the tracked click on the same affiliate_clicks rail the
    // external CTA uses; the live agent-booking wiring lands with T0 (R-T3-e render-consumption gate).
    try {
      await apiRequest("POST", "/api/affiliates/track", {
        partner: `resolve:${stub.resolutionRef || stub.resolutionSubclass || "affiliate"}`,
        destination: city,
      });
    } catch {
      /* non-blocking — tracking is best-effort */
    }
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
        {/* Class label — the honesty guarantee. The line changes with the resolved booking path so a
            traveler always knows where the action leads (T3.4): on-platform / partner / off to source. */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {cta.kind === "provider" ? (
            <>
              <Store className="h-3.5 w-3.5" />
              <span>Available on Traveloure</span>
            </>
          ) : cta.kind === "affiliate" ? (
            <>
              <Handshake className="h-3.5 w-3.5" />
              <span>Bookable through a partner</span>
            </>
          ) : (
            <>
              <Globe className="h-3.5 w-3.5" />
              <span>From the web · not bookable here</span>
            </>
          )}
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

        {/* CTA switches on the resolved class (T3.4). Provider → an INTERNAL route link, NO outbound.
            Affiliate → the in-platform rail (no raw partner URL, §16). External → tracked source click. */}
        {cta.kind === "provider" ? (
          <a
            href={cta.href!}
            data-testid={`external-stub-provider-${stub.id}`}
            data-cta-kind="provider"
            className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-foreground hover:bg-primary/20 transition-colors"
          >
            {cta.label}
            <Store className="h-3.5 w-3.5" />
          </a>
        ) : cta.kind === "affiliate" ? (
          <button
            type="button"
            onClick={handleAffiliate}
            data-testid={`external-stub-affiliate-${stub.id}`}
            data-cta-kind="affiliate"
            className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            {cta.label}
            <Handshake className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleViewSource}
            data-testid={`external-stub-source-${stub.id}`}
            data-cta-kind="external"
            className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            {cta.label}
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}

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
