import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Database, 
  MapPin, 
  Calendar,
  RefreshCw,
  Clock,
  Hotel,
  Plane,
  Ticket,
  Globe,
  Loader2,
  CheckCircle,
  AlertCircle,
  TrendingUp
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface CacheStatus {
  totalCachedEvents: number;
  citiesWithCache: string[];
  oldestCache: string | null;
  newestCache: string | null;
  supportedCities: number;
  cacheEnabled: boolean;
  cacheDurationHours: number;
}

interface LocationSummary {
  events: Array<{ cityCode: string; city: string; count: number; lastUpdated: string }>;
  hotels: Array<{ cityCode: string; city: string; count: number; lastUpdated: string }>;
  activities: Array<{ destination: string; city: string; count: number; lastUpdated: string }>;
  flights: Array<{ origin: string; destination: string; count: number; lastUpdated: string }>;
  totals: {
    events: number;
    hotels: number;
    activities: number;
    flights: number;
  };
}

const CITY_NAMES: Record<string, string> = {
  MAD: "Madrid", BCN: "Barcelona", NYC: "New York", LAX: "Los Angeles",
  PAR: "Paris", LIS: "Lisbon", POR: "Porto", MIL: "Milan", ROM: "Rome",
  BER: "Berlin", AMS: "Amsterdam", DUB: "Dublin", EDI: "Edinburgh",
  LON: "London", MEX: "Mexico City", BOG: "Bogota", BUE: "Buenos Aires",
  SAO: "Sao Paulo", SYD: "Sydney", SIN: "Singapore", HKG: "Hong Kong",
  TYO: "Tokyo", SEO: "Seoul", BOM: "Mumbai", DEL: "Delhi", JAI: "Jaipur",
  GOA: "Goa", KYO: "Kyoto", CTG: "Cartagena"
};

export default function AdminData() {
  const { toast } = useToast();
  const [refreshingCity, setRefreshingCity] = useState<string | null>(null);

  const { data: cacheStatus, isLoading: loadingCache } = useQuery<CacheStatus>({
    queryKey: ["/api/fever/cache/status"],
  });

  const { data: locationSummary, isLoading: loadingSummary } = useQuery<LocationSummary>({
    queryKey: ["/api/admin/data/location-summary"],
  });

  const refreshAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/fever/cache/refresh-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fever/cache/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data/location-summary"] });
      toast({ title: "Cache refreshed", description: "All cities have been refreshed" });
    },
    onError: (error: Error) => {
      toast({ title: "Refresh failed", description: error.message, variant: "destructive" });
    }
  });

  const refreshCityMutation = useMutation({
    mutationFn: async (cityCode: string) => {
      setRefreshingCity(cityCode);
      return apiRequest("POST", `/api/fever/cache/refresh/${cityCode}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fever/cache/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data/location-summary"] });
      toast({ title: "City refreshed", description: "City cache has been updated" });
      setRefreshingCity(null);
    },
    onError: (error: Error) => {
      toast({ title: "Refresh failed", description: error.message, variant: "destructive" });
      setRefreshingCity(null);
    }
  });

  const getTimeSince = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    const now = new Date();
    const hours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return "< 1 hour ago";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const totals = locationSummary?.totals || { events: 0, hotels: 0, activities: 0, flights: 0 };
  const totalItems = totals.events + totals.hotels + totals.activities + totals.flights;

  const sortedEvents = [...(locationSummary?.events || [])].sort((a, b) => b.count - a.count);
  const sortedHotels = [...(locationSummary?.hotels || [])].sort((a, b) => b.count - a.count);
  const sortedActivities = [...(locationSummary?.activities || [])].sort((a, b) => b.count - a.count);

  return (
    <AdminLayout title="Data by Location">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card data-testid="card-total-data">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Cached</p>
                  <p className="text-2xl font-bold text-gray-900">{totalItems.toLocaleString()}</p>
                </div>
                <Database className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-events">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Events</p>
                  <p className="text-2xl font-bold text-blue-600">{totals.events.toLocaleString()}</p>
                </div>
                <Calendar className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-hotels">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Hotels</p>
                  <p className="text-2xl font-bold text-green-600">{totals.hotels.toLocaleString()}</p>
                </div>
                <Hotel className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-activities">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Activities</p>
                  <p className="text-2xl font-bold text-amber-600">{totals.activities.toLocaleString()}</p>
                </div>
                <Ticket className="w-8 h-8 text-amber-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-flights">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Flights</p>
                  <p className="text-2xl font-bold text-rose-600">{totals.flights.toLocaleString()}</p>
                </div>
                <Plane className="w-8 h-8 text-rose-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Button 
            onClick={() => refreshAllMutation.mutate()}
            disabled={refreshAllMutation.isPending}
            data-testid="button-refresh-all"
          >
            {refreshAllMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh Events
          </Button>
          <Badge variant="secondary" className="text-sm py-1">
            {cacheStatus?.citiesWithCache?.length || 0} / {cacheStatus?.supportedCities || 29} cities with event data
          </Badge>
          <Badge variant="outline" className="text-sm py-1">
            <Clock className="w-3 h-3 mr-1" />
            Last update: {getTimeSince(cacheStatus?.newestCache || null)}
          </Badge>
        </div>

        <Tabs defaultValue="events" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="events" data-testid="tab-events">
              <Calendar className="w-4 h-4 mr-2" /> Events ({totals.events})
            </TabsTrigger>
            <TabsTrigger value="hotels" data-testid="tab-hotels">
              <Hotel className="w-4 h-4 mr-2" /> Hotels ({totals.hotels})
            </TabsTrigger>
            <TabsTrigger value="activities" data-testid="tab-activities">
              <Ticket className="w-4 h-4 mr-2" /> Activities ({totals.activities})
            </TabsTrigger>
            <TabsTrigger value="flights" data-testid="tab-flights">
              <Plane className="w-4 h-4 mr-2" /> Flights ({totals.flights})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Events by City
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSummary ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : sortedEvents.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No event data cached yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-medium text-gray-600">City</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Code</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-600">Events</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Updated</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedEvents.map((city) => (
                          <tr 
                            key={city.cityCode} 
                            className="border-b border-gray-100 hover:bg-gray-50"
                            data-testid={`row-event-${city.cityCode.toLowerCase()}`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-blue-500" />
                                <span className="font-medium">{CITY_NAMES[city.cityCode] || city.city}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="outline">{city.cityCode}</Badge>
                            </td>
                            <td className="py-3 px-4 text-right font-semibold">{city.count.toLocaleString()}</td>
                            <td className="py-3 px-4 text-gray-500 text-sm">{getTimeSince(city.lastUpdated)}</td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => refreshCityMutation.mutate(city.cityCode)}
                                disabled={refreshingCity === city.cityCode || refreshAllMutation.isPending}
                                data-testid={`button-refresh-${city.cityCode.toLowerCase()}`}
                              >
                                {refreshingCity === city.cityCode ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-4 h-4" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hotels" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hotel className="w-5 h-5 text-green-600" />
                  Hotels by City
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSummary ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : sortedHotels.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No hotel data cached yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-medium text-gray-600">City</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Code</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-600">Hotels</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedHotels.map((city, idx) => (
                          <tr 
                            key={`${city.cityCode}-${idx}`} 
                            className="border-b border-gray-100 hover:bg-gray-50"
                            data-testid={`row-hotel-${city.cityCode?.toLowerCase() || idx}`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-green-500" />
                                <span className="font-medium">{city.city || CITY_NAMES[city.cityCode] || city.cityCode}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="outline">{city.cityCode}</Badge>
                            </td>
                            <td className="py-3 px-4 text-right font-semibold">{city.count.toLocaleString()}</td>
                            <td className="py-3 px-4 text-gray-500 text-sm">{getTimeSince(city.lastUpdated)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activities" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-amber-600" />
                  Activities by Destination
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSummary ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : sortedActivities.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No activity data cached yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Destination</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">City</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-600">Activities</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedActivities.map((activity, idx) => (
                          <tr 
                            key={`${activity.destination}-${idx}`} 
                            className="border-b border-gray-100 hover:bg-gray-50"
                            data-testid={`row-activity-${idx}`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-amber-500" />
                                <span className="font-medium">{activity.destination}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-gray-600">{activity.city || "-"}</td>
                            <td className="py-3 px-4 text-right font-semibold">{activity.count.toLocaleString()}</td>
                            <td className="py-3 px-4 text-gray-500 text-sm">{getTimeSince(activity.lastUpdated)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="flights" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plane className="w-5 h-5 text-rose-600" />
                  Flight Routes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSummary ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : (locationSummary?.flights?.length || 0) === 0 ? (
                  <p className="text-gray-500 text-center py-8">No flight data cached yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Origin</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Destination</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-600">Flights</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {locationSummary?.flights?.map((flight, idx) => (
                          <tr 
                            key={`${flight.origin}-${flight.destination}-${idx}`} 
                            className="border-b border-gray-100 hover:bg-gray-50"
                            data-testid={`row-flight-${idx}`}
                          >
                            <td className="py-3 px-4">
                              <Badge variant="outline">{flight.origin}</Badge>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Plane className="w-4 h-4 text-rose-500" />
                                <Badge variant="outline">{flight.destination}</Badge>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-semibold">{flight.count.toLocaleString()}</td>
                            <td className="py-3 px-4 text-gray-500 text-sm">{getTimeSince(flight.lastUpdated)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
