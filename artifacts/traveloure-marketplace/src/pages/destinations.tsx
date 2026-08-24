import { useEffect } from "react";
import { Shell } from "@/components/layout/Shell";
import { useDestinations } from "@/lib/api";
import { ArrowUpRight } from "lucide-react";

// The mockups specifically target certain city photos as verified assets
const KNOWN_IMAGES: Record<string, string> = {
  kyoto: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80",
  jaipur: "https://images.unsplash.com/photo-1599661046827-dacde6976543?auto=format&fit=crop&w=900&q=80",
  bali: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=80",
  paris: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=900&q=80",
};

const getCityImage = (city: string) => {
  const match = Object.keys(KNOWN_IMAGES).find(k => city.toLowerCase().includes(k));
  return match ? KNOWN_IMAGES[match] : undefined;
};

export default function DestinationsPage() {
  useEffect(() => { document.title = "Destinations | Traveloure Field Guide"; }, []);

  const { data: destinationsData, isLoading, isError } = useDestinations();

  const displayCities = destinationsData?.data || [];

  return (
    <Shell surface="destinations">
      <div className="fg-section-head">
        <div>
          <p className="fg-kicker">Live Traveloure markets</p>
          <h2 className="fg-section-title">Destinations available to explore</h2>
        </div>
        <p className="fg-section-note">{destinationsData?.total ?? displayCities.length} destinations in the directory</p>
      </div>

      {isLoading ? (
        <div className="fg-card-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="fg-card animate-pulse" data-testid={`loading-destination-${i}`}>
              <div className="fg-photo bg-gray-200"></div>
              <div className="fg-card-body h-48 bg-white"></div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="fg-card p-6 text-center text-muted" data-testid="error-destinations">
          Could not load destinations. Please try again later.
        </div>
      ) : displayCities.length > 0 ? (
        <div className="fg-card-grid">
          {displayCities.map((city) => {
            const image = getCityImage(city);
            return (
              <article className="fg-card" key={city} data-testid={`destination-card-${city}`}>
                <div 
                  className="fg-photo" 
                  style={{ 
                    backgroundImage: image ? `url(${image})` : 'none', 
                    backgroundColor: image ? undefined : 'var(--line)' 
                  }}
                />
                <div className="fg-card-body" style={{ display: 'flex', flexDirection: 'column', height: '180px' }}>
                  <p className="fg-card-title">{city}</p>
                  <div style={{ flex: 1 }} />
                  <div className="fg-card-rule" />
                  <div className="fg-card-foot">
                    <a 
                      href={`/discover/location/${encodeURIComponent(city)}`} 
                      className="fg-card-cta" 
                      data-testid={`destination-link-${city}`}
                      style={{ textDecoration: 'none' }}
                    >
                      Explore destination <ArrowUpRight size={13} />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="fg-card p-6 text-center text-muted" data-testid="empty-destinations">
          No destinations available at this time.
        </div>
      )}
    </Shell>
  );
}
