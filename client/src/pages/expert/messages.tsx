import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, MapPin, Calendar, ArrowRight, Briefcase } from "lucide-react";
import { Link } from "wouter";

interface AssignedTrip {
  trip_id: string;
  trip_title: string;
  destination: string;
  start_date: string;
  end_date: string;
  traveler_name: string;
  status: "pending" | "accepted";
  assigned_at: string;
  suggestion_count: number;
}

export default function ExpertMessages() {
  const { clientId } = useParams<{ clientId?: string }>();
  const [, setLocation] = useLocation();

  const { data: assignedTrips, isLoading } = useQuery<AssignedTrip[]>({
    queryKey: ["/api/expert/assigned-trips"],
    enabled: !!clientId,
  });

  useEffect(() => {
    if (!clientId) {
      setLocation("/chat");
    }
  }, [clientId, setLocation]);

  if (!clientId) return null;

  // Filter to trips belonging to this specific client (by traveler_user_id matching clientId)
  const clientTrips = assignedTrips?.filter(
    (t) => t.status === "accepted" && t.traveler_user_id === clientId
  ) || [];
  // Fallback: if no user-id match (clientId might be a different format), show all active trips
  const activeTrips = clientTrips.length > 0
    ? clientTrips
    : (assignedTrips?.filter((t) => t.status === "accepted") || []);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <ExpertLayout title="Messages">
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Actions</h1>
          <p className="text-muted-foreground mt-1">
            Open chat or jump directly to a trip workspace.
          </p>
        </div>

        {/* Primary action: open chat */}
        <Card className="border border-gray-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Chat with Client</p>
                <p className="text-sm text-muted-foreground">Open the messaging interface</p>
              </div>
              <Link href="/chat">
                <Button data-testid="button-messages-open-chat">
                  Open Chat <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Open workspace: list active trips or skeleton */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Open Workspace
          </h2>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          ) : activeTrips.length === 0 ? (
            <Card className="border border-dashed border-muted-foreground/30">
              <CardContent className="p-6 text-center">
                <Briefcase className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">
                  No active assigned trips found. Once a trip is assigned to you, you can open its workspace here.
                </p>
                <Link href="/expert/assigned-trips">
                  <Button variant="outline" size="sm" className="mt-3" data-testid="button-messages-view-assigned">
                    View Assigned Trips
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3" data-testid="messages-workspace-trips">
              {activeTrips.slice(0, 5).map((trip) => (
                <Card key={trip.trip_id} className="border border-gray-200 hover:border-primary/40 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 truncate">
                            {trip.trip_title || trip.destination}
                          </p>
                          <Badge variant="default" className="text-[10px]">Active</Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {trip.destination}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                          </span>
                        </div>
                      </div>
                      <Link href={`/expert/workspace/${trip.trip_id}`}>
                        <Button size="sm" className="flex-shrink-0 gap-1" data-testid={`button-open-workspace-${trip.trip_id}`}>
                          Open Workspace <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </ExpertLayout>
  );
}
