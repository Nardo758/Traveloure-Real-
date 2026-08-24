import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, MapPin, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EventItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  description?: string;
  url?: string;
  image?: string;
}

interface EventsCardProps {
  events?: EventItem[];
}

export function EventsCard({ events = [] }: EventsCardProps) {
  if (!events || events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No events scheduled for this month. Check back later or adjust your travel dates.
      </p>
    );
  }

  // Group events by date
  const eventsByDate: Record<string, EventItem[]> = {};
  events.forEach((event) => {
    const date = event.date;
    if (!eventsByDate[date]) {
      eventsByDate[date] = [];
    }
    eventsByDate[date].push(event);
  });

  const sortedDates = Object.keys(eventsByDate).sort();

  return (
    <div className="space-y-4">
      {sortedDates.map((date) => (
        <div key={date} className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Calendar className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-sm">
              {new Date(date).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </h4>
            <span className="text-xs text-muted-foreground">({eventsByDate[date].length} event{eventsByDate[date].length !== 1 ? "s" : ""})</span>
          </div>

          <div className="grid gap-2 ml-6">
            {eventsByDate[date].map((event) => (
              <Card key={event.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h5 className="font-semibold text-sm">{event.title}</h5>
                      {event.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
                      )}
                    </div>
                    {event.url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={event.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {event.time && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {event.time}
                      </div>
                    )}
                    {event.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {event.location}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
