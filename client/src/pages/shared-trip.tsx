import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Calendar, MapPin, Users, Coffee, Camera, Utensils, Bed, Plane, ArrowRight, ShoppingCart, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { format, differenceInDays } from "date-fns";

function getDestinationGradient(destination: string): string {
  let hash = 0;
  for (let i = 0; i < destination.length; i++) {
    hash = (hash << 5) - hash + destination.charCodeAt(i);
    hash |= 0;
  }
  const h = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${h}, 60%, 40%), hsl(${(h + 50) % 360}, 70%, 28%))`;
}

function getActivityIcon(type: string) {
  switch (type?.toLowerCase()) {
    case "food": return Utensils;
    case "travel": return Plane;
    case "rest": return Bed;
    case "adventure":
    case "culture":
    case "sightseeing": return Camera;
    case "shopping": return ShoppingCart;
    default: return Coffee;
  }
}

interface SharedTripData {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  number_of_travelers: number;
  status: string;
  itinerary_data: {
    days?: Array<{
      day: number;
      title: string;
      activities: Array<{
        time?: string;
        type?: string;
        title: string;
        description?: string;
        locationName?: string;
        estimatedCost?: number;
      }>;
    }>;
  } | null;
}

interface SharedTripResponse {
  success: boolean;
  trip: SharedTripData;
}

export default function SharedTripPage() {
  const [imgError, setImgError] = useState(false);
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError } = useQuery<SharedTripResponse>({
    queryKey: [`/api/trips/shared/${token}`],
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF385C] mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Loading trip plan…</p>
        </div>
      </div>
    );
  }

  if (isError || !data?.trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-[#FFE3E8] rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-8 h-8 text-[#FF385C]" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Link not found</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            This trip plan link may have expired or is no longer available.
          </p>
          <Link href="/">
            <Button className="bg-[#FF385C] hover:bg-[#E23350] text-white" data-testid="button-explore-own">
              Plan your own trip
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const trip = data.trip;
  const startDate = new Date(trip.start_date);
  const endDate = new Date(trip.end_date);
  const duration = differenceInDays(endDate, startDate) + 1;
  const days = trip.itinerary_data?.days ?? [];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero */}
      <div className="relative h-[40vh] min-h-[280px]">
        {imgError ? (
          <div
            className="w-full h-full"
            style={{ background: getDestinationGradient(trip.destination) }}
          />
        ) : (
          <img
            src={`https://source.unsplash.com/1600x900/?${encodeURIComponent(trip.destination)},travel,landmark`}
            alt={trip.destination}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

        {/* Branding */}
        <div className="absolute top-4 left-4">
          <span className="text-white font-semibold text-lg tracking-tight">Traveloure</span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4 pb-6">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-white/20 backdrop-blur-md text-white border-0">
                <MapPin className="w-3 h-3 mr-1" />
                {trip.destination}
              </Badge>
              <Badge className="bg-white/15 backdrop-blur-md text-white border-0 capitalize">
                {trip.status}
              </Badge>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">{trip.title}</h1>
            <div className="flex flex-wrap gap-5 text-white/90 text-sm">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {format(startDate, "MMMM d")} — {format(endDate, "MMMM d, yyyy")}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {duration} {duration === 1 ? "day" : "days"}
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {trip.number_of_travelers} traveler{trip.number_of_travelers !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shared banner */}
      <div className="bg-[#FFF7F0] border-b border-[#FFD9B8] py-2.5 px-4 text-center text-sm text-[#994400]" data-testid="banner-shared-view">
        You are viewing a shared trip plan — read only. Want to plan your own?
        <Link href="/experiences">
          <span className="ml-1.5 underline font-medium cursor-pointer">Start here →</span>
        </Link>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 pt-6 max-w-3xl">
        {days.length === 0 ? (
          <Card className="border-dashed border-2 border-border">
            <CardContent className="p-10 text-center">
              <p className="text-muted-foreground text-sm">
                The itinerary for this trip hasn't been generated yet. Check back later!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {days.map((day, dayIndex) => (
              <div key={day.day} data-testid={`shared-day-${day.day}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-[#FF385C] text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {day.day}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Day {day.day}</h3>
                    <p className="text-muted-foreground text-sm">{day.title}</p>
                  </div>
                </div>

                <div className="ml-5 pl-5 border-l-2 border-border space-y-3">
                  {(day.activities ?? []).map((activity, actIndex) => {
                    const ActivityIcon = getActivityIcon(activity.type ?? "");
                    return (
                      <div
                        key={actIndex}
                        className="relative flex items-start gap-3 p-3 bg-muted/30 rounded-xl"
                        data-testid={`shared-activity-${day.day}-${actIndex}`}
                      >
                        <div className="absolute -left-[29px] w-3.5 h-3.5 rounded-full bg-[#FF385C] border-[3px] border-background" />
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <ActivityIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {activity.time && (
                            <p className="text-xs text-muted-foreground mb-0.5">{activity.time}</p>
                          )}
                          <p className="font-medium text-foreground text-sm">{activity.title}</p>
                          {activity.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{activity.description}</p>
                          )}
                          {activity.locationName && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {activity.locationName}
                            </div>
                          )}
                          {activity.estimatedCost != null && (
                            <p className="text-xs text-[#FF385C] mt-1">~${activity.estimatedCost}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 text-center border-t border-border pt-10">
          <h3 className="text-lg font-semibold text-foreground mb-2">Inspired by this trip?</h3>
          <p className="text-muted-foreground text-sm mb-5 max-w-sm mx-auto">
            Create your own personalised plan with AI — tailored exactly to your style and budget.
          </p>
          <Link href="/experiences">
            <Button
              className="bg-[#FF385C] hover:bg-[#E23350] text-white px-6"
              data-testid="button-plan-own-trip"
            >
              Plan my own trip
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
