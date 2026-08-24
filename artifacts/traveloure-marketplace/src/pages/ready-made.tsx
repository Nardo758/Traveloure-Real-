import { useState, useEffect, useMemo } from "react";
import { Shell } from "@/components/layout/Shell";
import { useReadyMade } from "@/lib/api";
import { ArrowUpRight } from "lucide-react";

export default function ReadyMadePage() {
  useEffect(() => { document.title = "Ready-Made Trips | Traveloure Field Guide"; }, []);

  const [edition, setEdition] = useState("All editions");
  const { data, isLoading, isError } = useReadyMade();

  const allListings = data?.listings || [];
  
  // Extract real themes from the feed data
  const themes = useMemo(() => {
    const set = new Set<string>();
    allListings.forEach(l => {
      if (l.planTypeCustom) set.add(l.planTypeCustom);
      else if (l.planType) set.add(l.planType);
    });
    return Array.from(set);
  }, [allListings]);

  const displayTrips = edition === "All editions" 
    ? allListings 
    : allListings.filter(l => (l.planTypeCustom || l.planType) === edition);

  return (
    <Shell surface="ready">
      <div className="fg-ready-tabs">
        <button 
          aria-pressed={edition === "All editions"} 
          className={edition === "All editions" ? "active" : ""} 
          onClick={() => setEdition("All editions")}
          data-testid="tab-theme-all"
        >
          All editions
        </button>
        {themes.map((theme) => (
          <button 
            key={theme}
            aria-pressed={edition === theme} 
            className={edition === theme ? "active" : ""} 
            onClick={() => setEdition(theme)}
            data-testid={`tab-theme-${theme}`}
          >
            {theme}
          </button>
        ))}
      </div>
      
      <div className="fg-section-head">
        <div>
          <p className="fg-kicker">{edition === "All editions" ? "Curated for right now" : edition}</p>
          <h2 className="fg-section-title">{edition === "All editions" ? "Travel like you have a local editor" : `${edition} trip editions`}</h2>
        </div>
        <p className="fg-section-note" data-testid="readymade-count">{displayTrips.length} {displayTrips.length === 1 ? "protected preview" : "protected previews"} · Live inventory</p>
      </div>

      {isLoading ? (
        <div className="fg-card-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="fg-card animate-pulse" data-testid={`loading-readymade-${i}`}>
              <div className="fg-trip-image bg-gray-200"></div>
              <div className="fg-trip-body h-40 bg-white"></div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="fg-card p-6 text-center text-muted" data-testid="error-readymade">
          Could not load trip editions. Please try again later.
        </div>
      ) : displayTrips.length > 0 ? (
        <div className="fg-card-grid">
          {displayTrips.map((trip) => {
            const imageUrl = trip.heroImageUrl || "";
            return (
              <article className="fg-card" key={trip.id} data-testid={`readymade-card-${trip.id}`}>
                <div 
                  className="fg-trip-image" 
                  style={{ 
                    backgroundImage: imageUrl ? `url(${imageUrl})` : 'none', 
                    backgroundColor: imageUrl ? undefined : 'var(--line)' 
                  }}
                >
                  <span className="fg-trip-destination">{trip.market}</span>
                </div>
                <div className="fg-trip-body">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <p className="fg-kicker">Trip edition</p>
                    {trip.section === "trips_by_locals" && <span className="fg-status gold">Local Expert</span>}
                  </div>
                  <p className="fg-trip-title">{trip.title}</p>
                  <p className="fg-trip-details">{trip.durationDays} days · {trip.planTypeCustom || trip.planType || "Theme not listed"}</p>
                  <div className="fg-facts">
                    <div className="fg-fact">
                      <strong>{trip.priceCents ? `$${(trip.priceCents / 100).toFixed(2)}` : '—'}</strong>
                      {trip.pricingMode === "per_traveler" ? "per traveler" : "complete trip"}
                    </div>
                    <div className="fg-fact"><strong>{trip.authorName ? `By ${trip.authorName.split(" ")[0]}` : "Not listed"}</strong>trip editor</div>
                  </div>
                  <div className="fg-trip-actions">
                    <span className="fg-meta" style={{ margin: 0 }}>Editable plan · yours after checkout</span>
                    <a href={`/ready-made/${trip.id}`} className="fg-card-cta" style={{ textDecoration: 'none' }} data-testid={`link-view-trip-${trip.id}`}>
                      View trip <ArrowUpRight size={13} />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="fg-card p-6 text-center text-muted" data-testid="empty-readymade">
          No trip editions match this filter.
        </div>
      )}
    </Shell>
  );
}
