import { useState } from "react";
import {
  ArrowUpRight, CalendarDays, CheckCircle2, ChevronDown, Compass,
  Filter, MapPin, Menu, Search, Sparkles, Ticket, UtensilsCrossed,
  WandSparkles
} from "lucide-react";
import "./_group.css";

type Surface = "destinations" | "ready" | "events" | "services";

const cityPhotos = {
  kyoto: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80",
  jaipur: "https://images.unsplash.com/photo-1599661046827-dacde6976543?auto=format&fit=crop&w=900&q=80",
  bali: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=80",
  paris: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=900&q=80",
};

const meta: Record<Surface, { title: string; deck: string; label: string }> = {
  destinations: { title: "Destinations", deck: "Field notes on places worth planning around — seasons, culture, and the feeling of being there.", label: "Travel intelligence" },
  ready: { title: "Ready-Made Trips", deck: "Curated itineraries you can make your own, with every stop shaped by someone who knows the place.", label: "Trip editions" },
  events: { title: "Events", deck: "Use the calendar to find a date, then see the festivals and places that make it worth the journey.", label: "Time-led planning" },
  services: { title: "Services", deck: "Book local expertise for the part of your trip that deserves to feel effortless.", label: "Book with confidence" },
};

function MastheadIcon({ surface }: { surface: Surface }) {
  const Icon = surface === "destinations" ? Compass : surface === "ready" ? Sparkles : surface === "events" ? CalendarDays : WandSparkles;
  return <span className={`fg-title-icon ${surface === "ready" ? "ready" : surface === "events" ? "events" : surface}`}><Icon aria-hidden="true" /></span>;
}

function DestinationCards() {
  const cities = [
    { city: "Kyoto", country: "Japan", premise: "Temple air & autumn color", season: "Peak foliage · Nov", score: "87", price: "$175", crowd: "Busy", gems: "35 gems", image: cityPhotos.kyoto },
    { city: "Jaipur", country: "India", premise: "Rose city, blue hour", season: "Heritage season · Dec", score: "78", price: "$95", crowd: "Moderate", gems: "18 gems", image: cityPhotos.jaipur },
    { city: "Bali", country: "Indonesia", premise: "Rituals by the water", season: "Dry season · May", score: "90", price: "$115", crowd: "Easygoing", gems: "42 gems", image: cityPhotos.bali },
  ];
  return <div className="fg-card-grid">
    {cities.map((place) => (
      <article className="fg-card" key={place.city}>
        <div className="fg-photo" style={{ backgroundImage: `url(${place.image})` }}><span className="fg-signal">{place.season}</span></div>
        <div className="fg-card-body">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}><div><p className="fg-card-title">{place.city}</p><p className="fg-meta"><MapPin />{place.country}</p></div><span className="fg-status teal">Pulse {place.score}</span></div>
          <p className="fg-meta" style={{ color: "var(--teal)", fontWeight: 700, marginTop: 12 }}><Sparkles size={13} />{place.premise}</p>
          <div className="fg-facts"><div className="fg-fact"><strong>{place.price}</strong>per night</div><div className="fg-fact"><strong>{place.crowd}</strong>crowd feel</div><div className="fg-fact"><strong>{place.gems}</strong>local finds</div></div>
          <div className="fg-card-rule" />
          <div className="fg-card-foot"><span className="fg-status gold">{place.crowd}</span><button className="fg-card-cta">Take me here <ArrowUpRight size={13} /></button></div>
        </div>
      </article>
    ))}
  </div>;
}

function Destinations() {
  return <>
    <div className="fg-section-head">
      <div><p className="fg-kicker">Now worth knowing</p><h2 className="fg-section-title">Cities with a story this season</h2></div>
      <p className="fg-section-note">One travel signal · one reason to go</p>
    </div>
    <DestinationCards />
  </>;
}

function ReadyMade() {
  const [edition, setEdition] = useState("All editions");
  const trips = [
    { city: "Kyoto", title: "Unhurried Kyoto", details: "3 days · Temples, tea & quiet corners", creator: "Alex Tanaka", price: "$1,450", image: cityPhotos.kyoto, themes: ["Food & culture", "Slow journeys"] },
    { city: "Bali", title: "A softer side of Bali", details: "5 days · Ritual, coast & craft", creator: "Maya Putri", price: "$2,180", image: cityPhotos.bali, themes: ["Slow journeys"] },
    { city: "Jaipur", title: "The Jaipur notebook", details: "4 days · Courtyards, textiles & food", creator: "Arjun Mehta", price: "$1,760", image: cityPhotos.jaipur, themes: ["Food & culture"] },
  ];
  const visibleTrips = edition === "All editions" || edition === "More themes" ? trips : trips.filter((trip) => trip.themes.includes(edition));
  return <>
    <div className="fg-ready-tabs">
      {["All editions", "Food & culture", "Slow journeys", "More themes"].map((label) => <button aria-pressed={edition === label} key={label} className={edition === label ? "active" : ""} onClick={() => setEdition(label)}>{label}</button>)}
    </div>
    <div className="fg-section-head">
      <div><p className="fg-kicker">{edition === "All editions" ? "Curated for right now" : edition}</p><h2 className="fg-section-title">{edition === "All editions" ? "Travel like you have a local editor" : `${edition} trip editions`}</h2></div>
      <p className="fg-section-note">{visibleTrips.length} {visibleTrips.length === 1 ? "edition" : "editions"} · Each has one clear price</p>
    </div>
    <div className="fg-card-grid">
      {visibleTrips.map((trip) => (
        <article className="fg-card" key={trip.title}>
          <div className="fg-trip-image" style={{ backgroundImage: `url(${trip.image})` }}><span className="fg-trip-destination">{trip.city}</span></div>
          <div className="fg-trip-body">
            <p className="fg-kicker">Trip edition</p><p className="fg-trip-title">{trip.title}</p><p className="fg-trip-details">{trip.details}</p>
            <div className="fg-trip-footer"><span>By {trip.creator} · Local editor</span><strong>{trip.price}</strong></div>
          </div>
        </article>
      ))}
    </div>
  </>;
}

function Events() {
  const [period, setPeriod] = useState("Month");
  const [mood, setMood] = useState("All places");
  const [selectedMonth, setSelectedMonth] = useState("Aug");
  const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  const events = [
    { month: "Aug", day: "24", name: "Summer Wine Festival", place: "Bordeaux · France", note: "A warm-weather weekend", proof: "2 events nearby" },
    { month: "Aug", day: "29", name: "Edinburgh Fringe", place: "Edinburgh · UK", note: "Comedy, theatre & late nights", proof: "9.2 / 10 season fit" },
    { month: "Sep", day: "07", name: "Kite Festival", place: "Bali · Indonesia", note: "A day at Sanur beach", proof: "Family-friendly" },
  ];
  const visibleEvents = events.filter((event) => event.month === selectedMonth);
  return <div className="fg-calendar-layout">
    <div>
      <div className="fg-section-head"><div><p className="fg-kicker">Choose the feeling</p><h2 className="fg-section-title">Build your trip around a moment</h2></div></div>
      <div className="fg-chip-row" style={{ marginBottom: 18 }}>
        {["All places", "Romantic", "Adventure", "Culture", "Food & drink", "With family"].map((label) => <button className={`fg-chip ${mood === label ? "active" : ""}`} key={label} onClick={() => setMood(label)}>{label}</button>)}
      </div>
      <div className="fg-section-head"><div><p className="fg-kicker">{selectedMonth} 2026 · {mood} · {period}</p><h2 className="fg-section-title">{visibleEvents.length ? "Dates to plan around" : "No dates in this month yet"}</h2></div><p className="fg-section-note">Event first, destination second</p></div>
      <div>
        {visibleEvents.map((event) => <div className="fg-event-line" key={event.name}>
          <div className="fg-datebox">{event.month}<strong>{event.day}</strong></div>
          <div><div className="fg-event-name">{event.name}</div><div className="fg-event-meta">{event.place}</div><div className="fg-event-proof"><span>{event.note}</span><span>·</span><span>{event.proof}</span></div></div>
          <button className="fg-link">Details</button>
        </div>)}
      </div>
    </div>
    <aside className="fg-calendar">
      <div className="fg-cal-head"><span>Find your date</span><div className="fg-period">{["Month", "Week", "Day"].map((label) => <button className={period === label ? "active" : ""} onClick={() => setPeriod(label)} key={label}>{label}</button>)}</div></div>
      <div className="fg-months">
        {months.map((month) => <button className={`fg-month ${month === selectedMonth ? "selected" : ""}`} onClick={() => setSelectedMonth(month)} key={month}><span className="fg-month-name">{month} 2026</span><span className="fg-month-event"><b>{month === "Aug" ? "24" : month === "Sep" ? "07" : "12"}</b> · {month === "Aug" ? "Fringe + 4 more" : month === "Sep" ? "Kite Festival" : "Festival season"}</span></button>)}
      </div>
      <div className="fg-bottom-note"><Ticket />The calendar is the time filter — it stays beside the results.</div>
    </aside>
  </div>;
}

function Services() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState("All services");
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState("");
  const [price, setPrice] = useState("Any price");
  const [rating, setRating] = useState("Any rating");
  const [sort, setSort] = useState("Recommended");
  const [added, setAdded] = useState<string | null>(null);
  const services = [
    { city: "Kyoto", name: "Private Gion after-hours walk", provider: "Nori Sato", rating: "4.9 (61)", price: "$180", fact: "4 hours · starts 5am", status: "Open today", category: "Tours" },
    { city: "Paris", name: "Architectural portrait session", provider: "Léa Martin", rating: "4.8 (44)", price: "$280", fact: "2 hours · finished gallery", status: "3 spots left", category: "Photography" },
    { city: "Bali", name: "Airport-to-villa welcome service", provider: "Made Kartika", rating: "4.9 (88)", price: "$95", fact: "Private transfer · door to door", status: "Open today", category: "Transport" },
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleServices = services.filter((service) => {
    const matchesQuery = !normalizedQuery || `${service.name} ${service.city} ${service.provider} ${service.category}`.toLowerCase().includes(normalizedQuery);
    const matchesDestination = !destination.trim() || service.city.toLowerCase().includes(destination.trim().toLowerCase());
    const matchesCategory = category === "All services" || category === "More categories" || service.category === category;
    const matchesPrice = price === "Any price" || (price === "Under $150" && service.price === "$95") || (price === "$150–$300" && service.price !== "$95");
    return matchesQuery && matchesDestination && matchesCategory && matchesPrice;
  });
  const clearRefinements = () => { setPrice("Any price"); setRating("Any rating"); setSort("Recommended"); setQuery(""); setDestination(""); setCategory("All services"); setAdded(null); };
  return <>
    <div className="fg-search-row">
      <label className="fg-input-wrap"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What do you need help with?" aria-label="Service search" /></label>
      <label className="fg-input-wrap"><MapPin /><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Where are you going?" aria-label="Destination" /></label>
      <button className="fg-filter-button" onClick={() => setFiltersOpen(!filtersOpen)}><Filter size={15} />Filters {filtersOpen ? "−" : "+"}</button>
    </div>
    <div className="fg-chip-row" style={{ marginBottom: 12 }}>
      {["All services", "Tours", "Food", "Photography", "Transport"].map((label) => <button aria-pressed={category === label} className={`fg-chip ${category === label ? "active" : ""}`} onClick={() => setCategory(label)} key={label}>{label}</button>)}
      <button className="fg-chip" onClick={() => setCategory("More categories")}>More categories <ChevronDown /></button>
    </div>
    {filtersOpen && <div className="fg-refine"><select className="fg-filter-select" value={price} onChange={(event) => setPrice(event.target.value)}><option>Any price</option><option>Under $150</option><option>$150–$300</option></select><select className="fg-filter-select" value={rating} onChange={(event) => setRating(event.target.value)}><option>Any rating</option><option>4.5 and above</option><option>4.0 and above</option></select><select className="fg-filter-select" value={sort} onChange={(event) => setSort(event.target.value)}><option>Recommended</option><option>Lowest price</option></select><button className="fg-link" onClick={clearRefinements}>Clear refinements</button></div>}
    <div className="fg-section-head">
      <div><p className="fg-kicker">{category}{rating !== "Any rating" ? ` · ${rating}` : ""}</p><h2 className="fg-section-title">Good hands, exactly where you need them</h2></div>
      <p className="fg-section-note">{visibleServices.length} matches · {sort.toLowerCase()}</p>
    </div>
    <div className="fg-card-grid">
      {visibleServices.map((service) => <article className="fg-card fg-service-card" key={service.name}>
        <div className="fg-service-top"><span className="fg-service-provider"><CheckCircle2 size={13} /> Verified local</span><span className="fg-status teal">{service.status}</span></div>
        <p className="fg-card-title" style={{ marginTop: 19 }}>{service.name}</p>
        <p className="fg-meta">{service.provider} · {service.rating} · {service.city}</p>
        <div style={{ flex: 1 }} />
        <p className="fg-meta" style={{ color: "var(--teal)", fontWeight: 700 }}>{service.fact}</p>
        <div className="fg-facts"><div className="fg-fact"><strong>{service.price}</strong>per service</div><div className="fg-fact"><strong>{service.rating.split(" ")[0]}</strong>guest rating</div><div className="fg-fact"><strong>{service.category}</strong>service type</div></div>
        <div className="fg-card-rule" />
        <div className="fg-card-foot"><span className="fg-service-price">{service.price}<span>per service</span></span><button className="fg-card-cta" onClick={() => setAdded(service.name)}>{added === service.name ? "Added ✓" : "Add to trip"} <ArrowUpRight size={13} /></button></div>
      </article>)}
    </div>
    {!visibleServices.length && <div className="fg-card" style={{ padding: 24, marginTop: 16, color: "var(--muted)", textAlign: "center" }}>No services match those refinements. <button className="fg-link" onClick={clearRefinements}>Clear all</button></div>}
  </>;
}

export function FieldGuide() {
  const [surface, setSurface] = useState<Surface>("services");
  return <div className="field-guide">
    <div className="fg-shell">
      <header className="fg-topbar">
        <div className="fg-brand"><Compass className="fg-brand-mark" />TRAVELOURE</div>
        <div className="fg-topnav"><span>Marketplace</span><span>Experts & services</span><span>Planning tools</span></div>
        <div className="fg-account"><button className="fg-join">Join as a Partner</button><Menu size={18} /></div>
      </header>
      <div className="fg-titlebar">
        <div>
          <div className="fg-title-line"><MastheadIcon surface={surface} /><h1 className="fg-title">{meta[surface].title}</h1></div>
          <p className="fg-deck">{meta[surface].deck}</p>
        </div>
        <div><p className="fg-caption">Concept mockup · {meta[surface].label}</p><nav className="fg-surface-nav" aria-label="Marketplace mockup surfaces">
          {([["destinations", "Destinations"], ["ready", "Ready-Made"], ["events", "Events"], ["services", "Services"]] as [Surface, string][]).map(([key, label]) => <button className={surface === key ? "active" : ""} onClick={() => setSurface(key)} key={key}>{label}</button>)}
        </nav></div>
      </div>
      <main className="fg-content">
        {surface === "destinations" && <Destinations />}
        {surface === "ready" && <ReadyMade />}
        {surface === "events" && <Events />}
        {surface === "services" && <Services />}
      </main>
      <footer className="fg-bottom-note"><Sparkles />The shared shell stays consistent; each page keeps its own travel-planning job.</footer>
    </div>
  </div>;
}