import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plane, 
  Hotel, 
  Calendar,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle,
  Plus,
  Bot
} from "lucide-react";

import { useQuery } from "@tanstack/react-query";

interface EaTravelArrangement {
  id: string; executiveName?: string; title: string; destination?: string;
  startDate?: string; endDate?: string; status: string;
  segments?: Array<{ city: string; dates: string; hotel: string; hotelStatus: string; flight: string; flightStatus: string }>;
  notes?: string;
}

export default function EATravel() {
  const { data: allTravel = [] } = useQuery<EaTravelArrangement[]>({
    queryKey: ["/api/ea/travel"],
  });

  const activeTrips = allTravel.filter(t => ["confirmed", "pending_approval", "in_progress"].includes(t.status));
  const upcomingTravel = allTravel.filter(t => t.status === "planning" || t.status === "pending");

  return (
    <EALayout title="Travel Coordination">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-travel-title">
              Travel Coordination
            </h1>
            <p className="text-gray-600">Manage executive travel arrangements</p>
          </div>
          <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-new-trip">
            <Plus className="w-4 h-4 mr-2" /> Arrange New Trip
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-[#E8E8E2]" data-testid="stat-active-trips">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#1A1A18]">{activeTrips.length}</p>
              <p className="text-sm text-[#7A7A72]">Active Trips</p>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="stat-pending">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-600">
                {activeTrips.filter(t => t.status === "pending_approval").length}
              </p>
              <p className="text-sm text-[#7A7A72]">Pending Approval</p>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="stat-upcoming">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#1A1A18]">{upcomingTravel.length}</p>
              <p className="text-sm text-[#7A7A72]">Upcoming</p>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="stat-confirmed">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#1A1A18]">
                {activeTrips.filter(t => t.status === "confirmed").length}
              </p>
              <p className="text-sm text-[#7A7A72]">Confirmed</p>
            </CardContent>
          </Card>
        </div>

        {/* Active Trips */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plane className="w-5 h-5 text-[#FF385C]" />
              Active Trips
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {activeTrips.length === 0 && (
              <div className="text-center py-8">
                <Plane className="w-10 h-10 text-[#AEAEA6] mx-auto mb-3" />
                <p className="font-medium text-[#1A1A18]">No active trips</p>
                <p className="text-sm text-[#7A7A72] mt-1">Trip arrangements will appear here</p>
              </div>
            )}
            {activeTrips.map((trip) => (
              <div 
                key={trip.id} 
                className={`p-4 rounded-lg border ${trip.status === "pending_approval" ? "border-yellow-200 bg-yellow-50/50" : "border-gray-200"}`}
                data-testid={`trip-${trip.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-gray-900">{trip.executiveName ? `${trip.executiveName} — ` : ""}{trip.title}</p>
                      {trip.status === "confirmed" ? (
                        <Badge className="bg-green-100 text-green-700"><CheckCircle className="w-3 h-3 mr-1" /> Confirmed</Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-700"><AlertCircle className="w-3 h-3 mr-1" /> Pending Approval</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                      <MapPin className="w-4 h-4" /> {trip.destination}
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> {trip.startDate} {trip.endDate ? `→ ${trip.endDate}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" data-testid={`button-view-trip-${trip.id}`}>
                      View Details
                    </Button>
                    {trip.status === "pending_approval" && (
                      <Button size="sm" className="bg-[#FF385C] hover:bg-[#E23350]" data-testid={`button-approve-trip-${trip.id}`}>
                        Approve All
                      </Button>
                    )}
                  </div>
                </div>

                {trip.notes && (
                  <p className="text-sm text-yellow-600 mb-4">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    {trip.notes}
                  </p>
                )}

                {/* Segments */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(trip.segments ?? []).map((segment, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-lg border border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-[#FF385C]" />
                        <span className="font-medium text-gray-900">{segment.city}</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{segment.dates}</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-gray-600">
                            <Plane className="w-3 h-3" /> {segment.flight}
                          </span>
                          {segment.flightStatus === "confirmed" ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <Clock className="w-4 h-4 text-yellow-500" />
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-gray-600">
                            <Hotel className="w-3 h-3" /> {segment.hotel}
                          </span>
                          {segment.hotelStatus === "confirmed" ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <Button size="sm" variant="outline" className="h-6 text-xs" data-testid={`button-approve-hotel-${trip.id}-${idx}`}>
                              Approve
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Travel */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Upcoming Travel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingTravel.length === 0 && (
                <div className="text-center py-6">
                  <Calendar className="w-8 h-8 text-[#AEAEA6] mx-auto mb-2" />
                  <p className="text-[#7A7A72] text-sm">No upcoming travel</p>
                </div>
              )}
              {upcomingTravel.map((travel, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                  data-testid={`upcoming-travel-${idx}`}
                >
                  <div>
                    <p className="font-medium text-gray-900">{travel.executiveName}</p>
                    <p className="text-sm text-gray-500">{travel.destination} {travel.startDate ? `• ${travel.startDate}` : ""}</p>
                  </div>
                  <Badge variant={travel.status === "confirmed" ? "default" : "outline"}>
                    {travel.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* AI Travel Assistant */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="w-5 h-5 text-green-600" />
                AI Travel Assistant
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">I can help with travel coordination:</p>
              <ul className="space-y-2 text-sm text-gray-600 mb-4">
                <li>• Search optimal flight routes and times</li>
                <li>• Find hotels matching executive preferences</li>
                <li>• Coordinate multi-city itineraries</li>
                <li>• Handle booking modifications</li>
                <li>• Track frequent flyer programs</li>
              </ul>
              <Button className="w-full bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-ai-travel">
                <Bot className="w-4 h-4 mr-2" /> Delegate Travel Task
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </EALayout>
  );
}
