import { type ReactNode, useState } from "react";
import { Link } from "wouter";
import { Compass, Menu, Sparkles, CalendarDays, WandSparkles } from "lucide-react";

type Surface = "destinations" | "ready" | "events" | "services";

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

export function Shell({ children, surface }: { children: ReactNode; surface: Surface }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="fg-shell">
      <header className="fg-topbar">
        <div className="fg-brand">
          <img
            src={`${import.meta.env.BASE_URL}traveloure-logo.png`}
            alt="Traveloure"
            className="h-6 w-auto object-contain"
            data-testid="img-traveloure-logo"
          />
        </div>
        <div className="fg-topnav">
          <Link href="/destinations" data-testid="link-top-destinations">Marketplace</Link>
          <Link href="/services" data-testid="link-top-services">Experts & services</Link>
          <Link href="/ready-made" data-testid="link-top-ready-made">Planning tools</Link>
        </div>
        <div className="fg-account">
          <a href="/partner-with-us" className="fg-join" data-testid="link-join-partner">
            Join as a Partner
          </a>
          <button
            type="button"
            className="fg-menu-button"
            aria-label="Toggle marketplace navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
            data-testid="button-mobile-navigation"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      {mobileNavOpen && (
        <nav className="fg-mobile-nav" aria-label="Mobile marketplace navigation">
          <Link href="/destinations" onClick={() => setMobileNavOpen(false)}>Destinations</Link>
          <Link href="/ready-made" onClick={() => setMobileNavOpen(false)}>Ready-Made</Link>
          <Link href="/events" onClick={() => setMobileNavOpen(false)}>Events</Link>
          <Link href="/services" onClick={() => setMobileNavOpen(false)}>Services</Link>
        </nav>
      )}
      <div className="fg-titlebar">
        <div>
          <div className="fg-title-line">
            <MastheadIcon surface={surface} />
            <h1 className="fg-title">{meta[surface].title}</h1>
          </div>
          <p className="fg-deck">{meta[surface].deck}</p>
        </div>
        <div>
          <p className="fg-caption">Field Guide · {meta[surface].label}</p>
          <nav className="fg-surface-nav" aria-label="Marketplace surfaces">
            <Link href="/destinations" className={surface === "destinations" ? "active" : ""} data-testid="link-nav-destinations">Destinations</Link>
            <Link href="/ready-made" className={surface === "ready" ? "active" : ""} data-testid="link-nav-ready-made">Ready-Made</Link>
            <Link href="/events" className={surface === "events" ? "active" : ""} data-testid="link-nav-events">Events</Link>
            <Link href="/services" className={surface === "services" ? "active" : ""} data-testid="link-nav-services">Services</Link>
          </nav>
        </div>
      </div>
      <main className="fg-content">
        {children}
      </main>
      <footer className="fg-bottom-note">
        <Sparkles />
        The shared shell stays consistent; each page keeps its own travel-planning job.
      </footer>
    </div>
  );
}
