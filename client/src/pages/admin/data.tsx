import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Database, 
  MapPin, 
  Calendar,
  RefreshCw,
  Clock,
  TrendingUp,
  Globe,
  Loader2,
  CheckCircle,
  AlertCircle
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

interface CityEventData {
  cityCode: string;
  city: string;
  eventCount: number;
  lastUpdated: string;
  categories: Record<string, number>;
}

interface LocationDataSummary {
  feverCache: CacheStatus;
  cityBreakdown: CityEventData[];
  totalEvents: number;
  lastFullRefresh: string | null;
}

const CITY_NAMES: Record<string, string> = {
  MAD: "Madrid",
  BCN: "Barcelona", 
  NYC: "New York",
  LAX: "Los Angeles",
  PAR: "Paris",
  LIS: "Lisbon",
  POR: "Porto",
  MIL: "Milan",
  ROM: "Rome",
  BER: "Berlin",
  AMS: "Amsterdam",
  DUB: "Dublin",
  EDI: "Edinburgh",
  LON: "London",
  MEX: "Mexico City",
  BOG: "Bogota",
  BUE: "Buenos Aires",
  SAO: "Sao Paulo",
  SYD: "Sydney",
  SIN: "Singapore",
  HKG: "Hong Kong",
  TYO: "Tokyo",
  SEO: "Seoul",
  BOM: "Mumbai",
  DEL: "Delhi",
  JAI: "Jaipur",
  GOA: "Goa",
  KYO: "Kyoto",
  CTG: "Cartagena"
};

export default function AdminData() {
  const { toast } = useToast();
  const [refreshingCity, setRefreshingCity] = useState<string | null>(null);

  const { data: cacheStatus, isLoading: loadingCache } = useQuery<CacheStatus>({
    queryKey: ["/api/fever/cache/status"],
  });

  const { data: cityBreakdown, isLoading: loadingBreakdown } = useQuery<CityEventData[]>({
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getTimeSince = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    const now = new Date();
    const hours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return "< 1 hour ago";
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const sortedCities = cityBreakdown?.sort((a, b) => b.eventCount - a.eventCount) || [];
  const citiesWithData = cacheStatus?.citiesWithCache?.length || 0;
  const totalEvents = cacheStatus?.totalCachedEvents || 0;

  return (
    <AdminLayout title="Data by Location">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-total-events">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Cached Events</p>
                  <p className="text-2xl font-bold text-gray-900">{totalEvents.toLocaleString()}</p>
                </div>
                <Calendar className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-cities-cached">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Cities with Data</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {citiesWithData} / {cacheStatus?.supportedCities || 29}
                  </p>
                </div>
                <Globe className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-cache-status">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Cache Status</p>
                  <div className="flex items-center gap-2">
                    {cacheStatus?.cacheEnabled ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-lg font-semibold text-green-600">Active</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <span className="text-lg font-semibold text-red-600">Disabled</span>
                      </>
                    )}
                  </div>
                </div>
                <Database className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-last-update">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Last Updated</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {getTimeSince(cacheStatus?.newestCache || null)}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-amber-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3">
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
            Refresh All Cities
          </Button>
          <Badge variant="secondary" className="text-sm py-1">
            Cache Duration: {cacheStatus?.cacheDurationHours || 24} hours
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Events by Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBreakdown || loadingCache ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">City</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Code</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-600">Events</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(CITY_NAMES).map((cityCode) => {
                      const cityData = sortedCities.find(c => c.cityCode === cityCode);
                      const hasCachedData = cacheStatus?.citiesWithCache?.includes(cityCode);
                      const eventCount = cityData?.eventCount || 0;
                      
                      return (
                        <tr 
                          key={cityCode} 
                          className="border-b border-gray-100 hover:bg-gray-50"
                          data-testid={`row-city-${cityCode.toLowerCase()}`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-400" />
                              <span className="font-medium">{CITY_NAMES[cityCode]}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">{cityCode}</Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={`font-semibold ${eventCount > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                              {eventCount.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {hasCachedData ? (
                              <Badge className="bg-green-100 text-green-700">Cached</Badge>
                            ) : (
                              <Badge variant="secondary">No Data</Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => refreshCityMutation.mutate(cityCode)}
                              disabled={refreshingCity === cityCode || refreshAllMutation.isPending}
                              data-testid={`button-refresh-${cityCode.toLowerCase()}`}
                            >
                              {refreshingCity === cityCode ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Top Cities by Event Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedCities.slice(0, 10).map((city, index) => {
                const maxEvents = sortedCities[0]?.eventCount || 1;
                const percentage = (city.eventCount / maxEvents) * 100;
                
                return (
                  <div key={city.cityCode} className="flex items-center gap-4">
                    <span className="w-6 text-sm text-gray-500 font-medium">#{index + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{CITY_NAMES[city.cityCode] || city.city}</span>
                        <span className="text-sm text-gray-600">{city.eventCount} events</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
