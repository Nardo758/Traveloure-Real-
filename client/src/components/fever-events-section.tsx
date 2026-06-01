import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Ticket,
  Calendar,
  MapPin,
  Star,
  AlertCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { CatalogItem } from "@/types/catalog";

interface EventItem extends CatalogItem {
  type: "event";
  dates?: { start: string | Date | null; end: string | Date | null } | null;
  isFree?: boolean;
  isSoldOut?: boolean;
  venueName?: string | null;
}

interface FeverEventsSectionProps {
  destination?: string;
  startDate?: string;
  endDate?: string;
}

type SortOption = "popular" | "price_low" | "price_high" | "rating" | "date";

function formatPrice(price: number | null, currency: string, isFree: boolean): string {
  if (isFree) return "Free";
  if (!price) return "Price TBD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function formatEventDate(dates: { start: string | Date | null; end: string | Date | null } | null): string {
  if (!dates?.start) return "Dates TBD";
  const start = new Date(dates.start);
  if (isNaN(start.getTime())) return "Dates TBD";
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (dates.end) {
    const end = new Date(dates.end);
    if (!isNaN(end.getTime()) && end.getTime() !== start.getTime()) {
      const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endStr = end.toLocaleDateString("en-US", options);
      return `${startStr} – ${endStr}`;
    }
  }
  return start.toLocaleDateString("en-US", options);
}

export function FeverEventsSection({ destination, startDate, endDate }: FeverEventsSectionProps) {
  const [sortBy, setSortBy] = useState<SortOption>("popular");

  const params = useMemo(() => {
    const p = new URLSearchParams({ type: "event", limit: "30" });
    if (destination) p.set("destination", destination);
    if (sortBy && sortBy !== "popular" && sortBy !== "date") p.set("sortBy", sortBy);
    return p.toString();
  }, [destination, sortBy]);

  const { data, isLoading, error } = useQuery<{ items: EventItem[]; total: number }>({
    queryKey: ["/api/catalog/search", "event", destination, sortBy],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/search?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    enabled: !!destination,
  });

  const events = useMemo(() => {
    if (!data?.items) return [];
    const items = [...data.items] as EventItem[];
    if (sortBy === "date") {
      items.sort((a, b) => {
        const aDate = a.dates?.start ? new Date(a.dates.start).getTime() : Infinity;
        const bDate = b.dates?.start ? new Date(b.dates.start).getTime() : Infinity;
        return aDate - bDate;
      });
    }
    return items;
  }, [data?.items, sortBy]);

  if (!destination) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-8 text-center">
          <Ticket className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-lg mb-2">Browse Events</h3>
          <p className="text-muted-foreground">
            Enter a destination in your Travel Details to discover events and shows.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading events in {destination}…</span>
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="overflow-hidden">
            <div className="flex">
              <Skeleton className="w-40 h-32 shrink-0" />
              <CardContent className="flex-1 p-4">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-3" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </CardContent>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
          <p className="font-medium mb-1">Unable to load events</p>
          <p className="text-sm text-muted-foreground">Please try again later.</p>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-8 text-center">
          <Ticket className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-lg mb-2">No Events Found</h3>
          <p className="text-muted-foreground">
            No events are currently cached for {destination}. Check back soon as our catalog updates daily.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {events.length} event{events.length !== 1 ? "s" : ""} in {destination}
        </p>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-40" data-testid="select-events-sort">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Most Popular</SelectItem>
            <SelectItem value="date">Earliest First</SelectItem>
            <SelectItem value="price_low">Price: Low to High</SelectItem>
            <SelectItem value="price_high">Price: High to Low</SelectItem>
            <SelectItem value="rating">Top Rated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {events.map((event) => (
          <Card
            key={event.id}
            className="overflow-hidden hover-elevate"
            data-testid={`card-event-${event.id}`}
          >
            <div className="flex h-full">
              <div className="w-36 shrink-0 relative">
                {event.imageUrl ? (
                  <img
                    src={event.imageUrl}
                    alt={event.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=300&h=200&fit=crop";
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center">
                    <Ticket className="h-10 w-10 text-primary/40" />
                  </div>
                )}
                {event.isFree && (
                  <Badge className="absolute top-2 left-2 text-xs bg-green-500 text-white border-0">
                    Free
                  </Badge>
                )}
                {event.isSoldOut && (
                  <Badge className="absolute top-2 left-2 text-xs bg-red-500 text-white border-0">
                    Sold Out
                  </Badge>
                )}
              </div>

              <CardContent className="flex-1 p-3 flex flex-col justify-between min-w-0">
                <div>
                  <h3
                    className="font-semibold text-sm leading-snug line-clamp-2 mb-1"
                    data-testid={`text-event-title-${event.id}`}
                  >
                    {event.title}
                  </h3>

                  <div className="space-y-1 mt-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      <span data-testid={`text-event-dates-${event.id}`}>
                        {formatEventDate(event.dates as any)}
                      </span>
                    </div>

                    {event.venueName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{event.venueName}</span>
                      </div>
                    )}

                    {event.rating && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                        <span>{Number(event.rating).toFixed(1)}</span>
                        {event.reviewCount && (
                          <span className="text-muted-foreground/70">({event.reviewCount})</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t">
                  <div>
                    <p
                      className="font-bold text-base text-primary"
                      data-testid={`text-event-price-${event.id}`}
                    >
                      {formatPrice(event.price, event.currency, event.isFree)}
                    </p>
                    {event.price && !event.isFree && (
                      <p className="text-xs text-muted-foreground">per person</p>
                    )}
                  </div>

                  {(event.affiliateUrl || event.bookingUrl) && !event.isSoldOut && (
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={() =>
                        window.open(event.affiliateUrl || event.bookingUrl || "#", "_blank", "noopener,noreferrer")
                      }
                      data-testid={`button-get-tickets-${event.id}`}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Get Tickets
                    </Button>
                  )}
                  {event.isSoldOut && (
                    <Badge variant="destructive" className="text-xs">
                      Sold Out
                    </Badge>
                  )}
                </div>
              </CardContent>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
