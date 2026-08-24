import { useState, useEffect, useMemo } from "react";
import { Shell } from "@/components/layout/Shell";
import { useCalendarCountries, useCalendarEvents } from "@/lib/api";
import { ArrowUpRight, Ticket } from "lucide-react";

export default function EventsPage() {
  useEffect(() => { document.title = "Events | Traveloure Field Guide"; }, []);

  const {
    data: countries,
    isLoading: countriesLoading,
    isError: countriesError,
  } = useCalendarCountries();
  const [country, setCountry] = useState("");
  
  // Set default country on load
  useEffect(() => {
    if (countries?.length && !country) {
      setCountry(countries[0]);
    }
  }, [countries, country]);

  const { data: eventsData, isLoading, isError } = useCalendarEvents(country);
  
  // Map safely depending on if it's paginated or array directly
  const rawEvents = Array.isArray(eventsData) ? eventsData : [];
  
  // Extract months from the events dynamically
  const availableMonths = useMemo(() => {
    const m = new Set<string>();
    rawEvents.forEach(e => {
       const d = new Date(e.specificDate || "");
       if (!isNaN(d.getTime())) {
          m.add(d.toLocaleString('default', { month: 'short', year: 'numeric' }));
       }
    });
    return Array.from(m);
  }, [rawEvents]);

  const [selectedMonth, setSelectedMonth] = useState("");

  useEffect(() => {
    if (availableMonths.length && !selectedMonth) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  const displayEvents = rawEvents.filter(e => {
     if (!selectedMonth) return true;
      const d = new Date(e.specificDate || "");
     if (!isNaN(d.getTime())) {
        return d.toLocaleString('default', { month: 'short', year: 'numeric' }) === selectedMonth;
     }
     return false;
  });

  if (countriesError) {
    return (
      <Shell surface="events">
        <div className="fg-section-head">
          <div>
            <p className="fg-kicker">Destination calendar</p>
            <h2 className="fg-section-title">Events by place and date</h2>
          </div>
        </div>
        <div className="fg-card p-6 text-center text-muted" data-testid="error-calendar-countries">
          Could not load the destination list. Please try again later.
        </div>
      </Shell>
    );
  }

  if (!countriesLoading && countries?.length === 0) {
    return (
      <Shell surface="events">
        <div className="fg-section-head">
          <div>
            <p className="fg-kicker">Destination calendar</p>
            <h2 className="fg-section-title">Events by place and date</h2>
          </div>
        </div>
        <div className="fg-card p-6 text-center text-muted" data-testid="empty-calendar-countries">
          No event destinations are available right now.
        </div>
      </Shell>
    );
  }

  return (
    <Shell surface="events">
      <div className="fg-calendar-layout">
        <div>
          <div className="fg-section-head">
            <div>
              <p className="fg-kicker">Choose a destination</p>
              <h2 className="fg-section-title">Events in {country || "Select a country"}</h2>
            </div>
          </div>
          
          <div className="fg-chip-row" style={{ marginBottom: 18 }}>
            {countriesLoading ? (
              <span className="text-muted text-sm" data-testid="loading-countries">Loading countries...</span>
            ) : countries?.map((c) => (
              <button 
                className={`fg-chip ${country === c ? "active" : ""}`} 
                key={c} 
                onClick={() => { setCountry(c); setSelectedMonth(""); }}
                data-testid={`chip-country-${c}`}
              >
                {c}
              </button>
            ))}
          </div>
          
          <div className="fg-section-head" style={{ marginTop: 32 }}>
            <div>
              <p className="fg-kicker">{countriesLoading || !country ? "Loading dates" : selectedMonth || "All Dates"}</p>
              <h2 className="fg-section-title">
                {countriesLoading || !country ? "Loading the event calendar" : displayEvents.length ? "Dates to plan around" : "No dates found"}
              </h2>
            </div>
            <p className="fg-section-note" data-testid="events-count">Event first, destination second</p>
          </div>
          
          {countriesLoading || !country || isLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="fg-event-line animate-pulse h-20 bg-gray-100 border-none" data-testid={`loading-event-${i}`}></div>
              ))}
            </div>
          ) : isError ? (
            <div className="fg-card p-6 text-center text-muted" data-testid="error-events">
              Could not load events. Please try again later.
            </div>
          ) : displayEvents.length > 0 ? (
            <div>
              {displayEvents.map((event, i) => {
                const dateObj = new Date(event.specificDate || "");
                const isValidDate = !isNaN(dateObj.getTime());
                const mo = isValidDate ? dateObj.toLocaleString('default', { month: 'short' }) : "";
                const dy = isValidDate ? dateObj.getDate() : "";
                const detailUrl = event.metadata?.affiliateUrl || event.metadata?.bookingUrl || null;
                
                return (
                  <div className="fg-event-line" key={event.id} data-testid={`event-card-${i}`}>
                    <div className="fg-datebox" data-testid={`event-date-${i}`}>
                      {mo}
                      <strong>{dy}</strong>
                    </div>
                    <div>
                      <div className="fg-event-name" data-testid={`event-name-${i}`}>{event.title}</div>
                      <div className="fg-event-meta" data-testid={`event-meta-${i}`}>{event.city}, {event.country}</div>
                    </div>
                    {detailUrl ? (
                      <a href={detailUrl} target="_blank" rel="noreferrer" className="fg-card-cta secondary" data-testid={`event-link-${i}`} style={{ textDecoration: 'none' }}>
                        Details <ArrowUpRight size={13} />
                      </a>
                    ) : (
                      <span className="text-xs text-muted font-bold" data-testid={`event-unavailable-${i}`} style={{ paddingRight: 8 }}>
                        Details unavailable
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="fg-card p-6 text-center text-muted" data-testid="empty-events">
              No events available for this selection.
            </div>
          )}
        </div>
        
        <aside className="fg-calendar">
          <div className="fg-cal-head">
            <span>Filter by Month</span>
          </div>
          <div className="fg-months">
            {availableMonths.length > 0 ? availableMonths.map((mo) => (
              <button 
                className={`fg-month ${mo === selectedMonth ? "selected" : ""}`} 
                onClick={() => setSelectedMonth(mo)} 
                key={mo}
                data-testid={`filter-month-${mo}`}
              >
                <span className="fg-month-name">{mo}</span>
              </button>
            )) : (
              <span className="text-muted text-sm p-2" data-testid="empty-months">No dates</span>
            )}
          </div>
          <div className="fg-bottom-note">
            <Ticket />The calendar is the time filter — it stays beside the results.
          </div>
        </aside>
      </div>
    </Shell>
  );
}
