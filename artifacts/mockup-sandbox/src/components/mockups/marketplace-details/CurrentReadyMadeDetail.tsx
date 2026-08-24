import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ConciergeBell,
  MapPin,
  ShoppingBag,
  Sun,
  X,
} from "lucide-react";
import "./CurrentReadyMadeDetail.css";

const listing = {
  title: "Kyoto in Bloom",
  planType: "City Itinerary",
  market: "Kyoto, Japan",
  durationDays: 4,
  bestSeason: "late March – early April",
  pricingMode: "fixed" as const,
  priceCents: 24900,
  badge: "Bestseller",
  authorName: "Mika Tanaka",
  section: "trips_by_locals" as const,
  heroImageUrl:
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1400&q=85",
  heroPhotographer: "Sorasak",
  insideCounts: {
    days: 4,
    items: 18,
    byType: { activity: 9, food: 5, transport: 2, note: 2 },
  },
};

const typeLabels: Record<string, string> = {
  activity: "Activities",
  food: "Food & dining",
  transport: "Transport",
  accommodation: "Stays",
  venue: "Venues",
  note: "Notes",
};

function RoutePreview() {
  return (
    <div className="rmd-route-wrap">
      <div className="rmd-route" role="img" aria-label="Route preview">
        <svg viewBox="0 0 720 245" preserveAspectRatio="none" aria-hidden="true">
          <rect width="720" height="245" fill="#eef2ed" />
          <path d="M-20 53 C88 40 136 100 244 74 S400 27 505 72 S647 130 752 92" fill="none" stroke="#d2ddd3" strokeWidth="26" />
          <path d="M-20 167 C82 133 183 198 287 158 S448 117 548 168 S654 210 748 183" fill="none" stroke="#dde5df" strokeWidth="18" />
          <path d="M43 28 L161 231 M224 -4 L291 246 M456 -10 L400 247 M617 -8 L574 248" stroke="#d9e0da" strokeWidth="2" />
          <path d="M-8 130 C94 104 131 164 217 137 S342 82 424 112 S531 196 623 151 S698 84 732 64" fill="none" stroke="#ff385c" strokeWidth="4" strokeDasharray="8 8" />
          {[[-4,130],[217,137],[424,112],[623,151],[732,64]].map(([cx, cy], index) => (
            <g key={index}><circle cx={cx} cy={cy} r="9" fill="white" stroke="#ff385c" strokeWidth="3" /><circle cx={cx} cy={cy} r="3" fill="#ff385c" /></g>
          ))}
        </svg>
        <span className="rmd-unlock">Stops unlock with purchase</span>
      </div>
      <div className="rmd-map-credit">Traveloure map · © OpenStreetMap contributors</div>
    </div>
  );
}

export function CurrentReadyMadeDetail() {
  const [languageOpen, setLanguageOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const price = (listing.priceCents / 100).toFixed(2);

  return (
    <main className="rmd-page">
      <div className="rmd-shell">
        <header className="rmd-header">
          <button className="rmd-logo" aria-label="Traveloure home" onClick={() => undefined}>
            <img src="/__mockup/images/traveloure-logo.png" alt="Traveloure" />
          </button>
          <div className="rmd-header-right">
            <span className="rmd-heading">Ready Made Trips</span>
            <div className="rmd-language">
              <button aria-expanded={languageOpen} onClick={() => setLanguageOpen(!languageOpen)}>EN <ChevronDown size={13} /></button>
              {languageOpen && <div className="rmd-language-menu"><button onClick={() => setLanguageOpen(false)}>English <Check size={13} /></button><button onClick={() => setLanguageOpen(false)}>Français</button><button onClick={() => setLanguageOpen(false)}>日本語</button></div>}
            </div>
          </div>
        </header>

        <section className="rmd-intro">
          <p className="rmd-plan-type">{listing.planType}</p>
          <h1>{listing.title}</h1>
          <div className="rmd-meta">
            <span><MapPin size={16} />{listing.market}</span>
            <span><CalendarDays size={16} />{listing.durationDays} days</span>
            <span><Sun size={16} />Best in {listing.bestSeason}</span>
            <span className="rmd-badge rmd-section">Trip by a Local — {listing.authorName}</span>
            <span className="rmd-badge rmd-bestseller">{listing.badge}</span>
          </div>
        </section>

        <figure className="rmd-hero">
          <img src={listing.heroImageUrl} alt={listing.title} />
          <figcaption>Photo by <a href="https://unsplash.com" onClick={(event) => event.preventDefault()}>{listing.heroPhotographer}</a> on Unsplash</figcaption>
        </figure>

        <RoutePreview />

        <section className="rmd-card">
          <h2>What's inside</h2>
          <div className="rmd-inside">
            <span className="rmd-count">{listing.insideCounts.days} planned days</span>
            <span className="rmd-count">{listing.insideCounts.items} itinerary items</span>
            {Object.entries(listing.insideCounts.byType).map(([type, count]) => <span className="rmd-count" key={type}>{count} {typeLabels[type]}</span>)}
          </div>
          <p className="rmd-description">Buying this trip copies the full day-by-day plan into your own trips — every item editable, re-dateable, and bookable.</p>
          <div className="rmd-concierge">
            <ConciergeBell size={17} />
            <p><strong>Includes 1 consultation + 1 revision</strong> <span>with the expert who built it — request anytime from your Trip Slip after purchase.</span></p>
          </div>
        </section>

        <section className="rmd-purchase">
          <div><div className="rmd-price">${price}</div><p>One-time purchase · yours to edit</p></div>
          <button className="rmd-buy" onClick={() => setCheckoutOpen(true)}><ShoppingBag size={17} />{purchased ? "Trip added" : "Get this trip"}</button>
        </section>

        <button className="rmd-storefront" onClick={() => undefined}>Like this trip? <span>See everything from {listing.authorName}</span></button>
      </div>

      {checkoutOpen && (
        <div className="rmd-overlay" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <div className="rmd-dialog">
            <button className="rmd-close" aria-label="Close checkout" onClick={() => setCheckoutOpen(false)}><X size={18} /></button>
            <h2 id="checkout-title">Complete your purchase</h2>
            <p className="rmd-dialog-copy">This local mockup preserves the checkout step without processing a payment.</p>
            <div className="rmd-order-row"><span>{listing.title}</span><strong>${price}</strong></div>
            <button className="rmd-confirm" onClick={() => { setPurchased(true); setCheckoutOpen(false); }}>Complete purchase</button>
            <button className="rmd-cancel" onClick={() => setCheckoutOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </main>
  );
}