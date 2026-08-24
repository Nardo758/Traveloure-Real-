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
    ["Kyoto", "Japan", "Temple air & autumn color", "Peak foliage · Nov", cityPhotos.kyoto],
    ["Jaipur", "India", "Rose city, blue hour", "Heritage season · Dec", cityPhotos.jaipur],
    ["Bali", "Indonesia", "Rituals by the water", "Dry season · May", cityPhotos.bali],
  ];
  return <div className="fg-card-grid">
    {cities.map(([city, country, premise, season, image]) => (
      <article className="fg-card" key={city}>
        <div className="fg-photo" style={{ backgroundImage: `url(${image})` }}><span className="fg-signal">{season}</span></div>
        <div className="fg-card-body">
          <p className="fg-card-title">{city}</p>
          <p className="fg-meta"><MapPin />{country}</p>
          <div className="fg-card-rule" />
          <div className="fg-card-foot"><span>{premise}</span><button className="fg-link">Explore <ArrowUpRight size={13} /></button></div>
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
    ["Kyoto", "Unhurried Kyoto", "3 days · Temples, tea & quiet corners", "Alex Tanaka", "$1,450", cityPhotos.kyoto],
    ["Bali", "A softer side of Bali", "5 days · Ritual, coast & craft", "Maya Putri", "$2,180", cityPhotos.bali],
    ["Jaipur", "The Jaipur notebook", "4 days · Courtyards, textiles & food", "Arjun Mehta", "$1,760", cityPhotos.jaipur],
  ];
  return <>
    <div className="fg-ready-tabs">
      {["All editions", "Food & culture", "Slow journeys", "More themes"].map((label) => <button key={label} className={edition === label ? "active" : ""} onClick={() => setEdition(label)}>{label}</button>)}
    </div>
    <div className="fg-section-head">
      <div><p className="fg-kicker">{edition === "All editions" ? "Curated for right now" : edition}</p><h2 className="fg-section-title">{edition === "All editions" ? "Travel like you have a local editor" : `${edition} trip editions`}</h2></div>
      <p className="fg-section-note">Each edition has one clear price</p>
    </div>
    <div className="fg-card-grid">
      {trips.map(([city, title, details, creator, price, image]) => (
        <article className="fg-card" key={title}>
          <div className="fg-trip-image" style={{ backgroundImage: `url(${image})` }}><span className="fg-trip-destination">{city}</span></div>
          <div className="fg-trip-body">
            <p className="fg-kicker">Trip edition</p><p className="fg-trip-title">{title}</p><p className="fg-trip-details">{details}</p>
            <div className="fg-trip-footer"><span>By {creator} · Local editor</span><strong>{price}</strong></div>
          </div>
        </article>
      ))}
    </div>
  </>;
}

function Events() {
  const [period, setPeriod] = useState("Month");
  const [mood, setMood] = useState("All places");
  const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  const events = [
    ["AUG", "24", "Summer Wine Festival", "Bordeaux · France", "A warm-weather weekend"],
    ["AUG", "29", "Edinburgh Fringe", "Edinburgh · UK", "Comedy, theatre & late nights"],
    ["SEP", "07", "Kite Festival", "Bali · Indonesia", "A day at Sanur beach"],
  ];
  return <div className="fg-calendar-layout">
    <div>
      <div className="fg-section-head"><div><p className="fg-kicker">Choose the feeling</p><h2 className="fg-section-title">Build your trip around a moment</h2></div></div>
      <div className="fg-chip-row" style={{ marginBottom: 18 }}>
        {["All places", "Romantic", "Adventure", "Culture", "Food & drink", "With family"].map((label) => <button className={`fg-chip ${mood === label ? "active" : ""}`} key={label} onClick={() => setMood(label)}>{label}</button>)}
      </div>
      <div className="fg-section-head"><div><p className="fg-kicker">August · {mood}</p><h2 className="fg-section-title">Three dates to plan around</h2></div><p className="fg-section-note">Event first, destination second</p></div>
      <div>
        {events.map(([month, day, name, place, note]) => <div className="fg-event-line" key={name}>
          <div className="fg-datebox">{month}<strong>{day}</strong></div>
          <div><div className="fg-event-name">{name}</div><div className="fg-event-meta">{place} · {note}</div></div>
          <button className="fg-link">Details</button>
        </div>)}
      </div>
    </div>
    <aside className="fg-calendar">
      <div className="fg-cal-head"><span>Find your date</span><div className="fg-period">{["Month", "Week", "Day"].map((label) => <button className={period === label ? "active" : ""} onClick={() => setPeriod(label)} key={label}>{label}</button>)}</div></div>
      <div className="fg-months">
        {months.map((month) => <button className={`fg-month ${month === "Aug" ? "selected" : ""}`} key={month}><span className="fg-month-name">{month} 2026</span><span className="fg-month-event"><b>{month === "Aug" ? "24" : "12"}</b> · {month === "Aug" ? "Fringe + 4 more" : "Festival season"}</span></button>)}
      </div>
      <div className="fg-bottom-note"><Ticket />The calendar is the time filter — it stays beside the results.</div>
    </aside>
  </div>;
}

function Services() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState("All services");
  const services = [
    ["Kyoto", "Private Gion after-hours walk", "Nori Sato · 4.9 (61)", "$180", "Local story, one clear price"],
    ["Paris", "Architectural portrait session", "Léa Martin · 4.8 (44)", "$280", "Two hours · finished gallery"],
    ["Bali", "Airport-to-villa welcome service", "Made Kartika · 4.9 (88)", "$95", "Private transfer · door to door"],
  ];
  return <>
    <div className="fg-search-row">
      <label className="fg-input-wrap"><Search /><input placeholder="What do you need help with?" aria-label="Service search" /></label>
      <label className="fg-input-wrap"><MapPin /><input placeholder="Where are you going?" aria-label="Destination" /></label>
      <button className="fg-filter-button" onClick={() => setFiltersOpen(!filtersOpen)}><Filter size={15} />Filters {filtersOpen ? "−" : "+"}</button>
    </div>
    <div className="fg-chip-row" style={{ marginBottom: 12 }}>
      {["All services", "Tours", "Food", "Photography", "Transport"].map((label) => <button className={`fg-chip ${category === label ? "active" : ""}`} onClick={() => setCategory(label)} key={label}>{label}</button>)}
      <button className="fg-chip" onClick={() => setCategory("More categories")}>More categories <ChevronDown /></button>
    </div>
    {filtersOpen && <div className="fg-refine"><select className="fg-filter-select" defaultValue=""><option value="" disabled>Price range</option><option>Under $150</option><option>$150–$300</option></select><select className="fg-filter-select" defaultValue=""><option value="" disabled>Guest rating</option><option>4.5 and above</option><option>4.0 and above</option></select><select className="fg-filter-select" defaultValue=""><option value="" disabled>Sort by</option><option>Recommended</option><option>Lowest price</option></select><button className="fg-link" onClick={() => setFiltersOpen(false)}>Clear refinements</button></div>}
    <div className="fg-section-head">
      <div><p className="fg-kicker">{category}</p><h2 className="fg-section-title">Good hands, exactly where you need them</h2></div>
      <p className="fg-section-note">Browse once · refine only when needed</p>
    </div>
    <div className="fg-card-grid">
      {services.map(([city, name, provider, price, fact]) => <article className="fg-card fg-service-card" key={name}>
        <div className="fg-service-top"><span className="fg-service-provider"><CheckCircle2 size={13} /> Verified local</span><span>{city}</span></div>
        <p className="fg-card-title" style={{ marginTop: 19 }}>{name}</p>
        <p className="fg-meta">{provider}</p>
        <div style={{ flex: 1 }} />
        <p className="fg-meta" style={{ color: "var(--teal)", fontWeight: 700 }}>{fact}</p>
        <div className="fg-card-rule" />
        <div className="fg-card-foot"><span className="fg-service-price">{price}<span>per service</span></span><button className="fg-link">View service <ArrowUpRight size={13} /></button></div>
      </article>)}
    </div>
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