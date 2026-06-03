import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Loader2, CheckCircle, RefreshCw, Zap } from "lucide-react";

interface UntaggedService {
  id: string;
  serviceName: string;
  city: string | null;
  providerFirstName: string | null;
  providerLastName: string | null;
  providerEmail: string | null;
}

interface UntaggedResponse {
  services: UntaggedService[];
  count: number;
}

interface BackfillResponse {
  updated: number;
  unmatched: number;
  total: number;
  message?: string;
}

export default function AdminNeighborhoodBackfill() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<UntaggedResponse>({
    queryKey: ["/api/admin/neighborhoods/untagged"],
  });

  const backfillMutation = useMutation({
    mutationFn: (serviceId?: string) =>
      apiRequest("POST", "/api/admin/neighborhoods/backfill", serviceId ? { serviceId } : {}),
    onSuccess: async (res: any, serviceId?: string) => {
      const result: BackfillResponse = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/neighborhoods/untagged"] });
      setAssigningId(null);
      if (result.message) {
        toast({ title: "No neighborhoods seeded", description: result.message });
      } else if (serviceId) {
        if (result.updated > 0) {
          toast({ title: "Neighborhood assigned", description: "Service has been tagged with the nearest neighborhood." });
        } else {
          toast({
            title: "No match found",
            description: "Could not find a neighborhood for this service's city.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: `Bulk backfill complete`,
          description: `${result.updated} service(s) tagged, ${result.unmatched} could not be matched.`,
        });
      }
    },
    onError: (err: any) => {
      setAssigningId(null);
      toast({ title: "Backfill failed", description: err.message, variant: "destructive" });
    },
  });

  const handleAutoAssign = (serviceId: string) => {
    setAssigningId(serviceId);
    backfillMutation.mutate(serviceId);
  };

  const handleBulkAssign = () => {
    backfillMutation.mutate(undefined);
  };

  const services = data?.services ?? [];
  const count = data?.count ?? 0;

  return (
    <AdminLayout title="Neighborhood Backfill">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Provider Service Neighborhood Assignment
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Legacy services created before neighborhood rollout need a neighborhood tag for
              location-aware discovery.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant={count > 0 ? "destructive" : "secondary"}
              className="text-sm px-3 py-1"
              data-testid="badge-untagged-count"
            >
              {isLoading ? "…" : `${count} service${count !== 1 ? "s" : ""} need${count === 1 ? "s" : ""} assignment`}
            </Badge>
            <Button
              onClick={handleBulkAssign}
              disabled={backfillMutation.isPending || count === 0}
              data-testid="button-bulk-auto-assign"
              className="bg-[#E85D55] hover:bg-[#d04e47] text-white"
            >
              {backfillMutation.isPending && !assigningId ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Bulk Auto-assign
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="w-4 h-4 text-[#E85D55]" />
              Untagged Services
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : services.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-12 text-center"
                data-testid="empty-state-untagged"
              >
                <CheckCircle className="w-10 h-10 text-green-500 mb-3" />
                <p className="text-gray-700 dark:text-gray-300 font-medium">All services have neighborhoods assigned</p>
                <p className="text-sm text-gray-500 mt-1">No backfill needed right now.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Service Name</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Provider</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-500">City / Location</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Coordinates</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((svc) => {
                      const providerName =
                        [svc.providerFirstName, svc.providerLastName].filter(Boolean).join(" ") ||
                        svc.providerEmail ||
                        "Unknown";
                      return (
                        <tr
                          key={svc.id}
                          className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                          data-testid={`row-service-${svc.id}`}
                        >
                          <td className="py-3 px-3 font-medium text-gray-900 dark:text-gray-100">
                            {svc.serviceName}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-gray-400">
                            {providerName}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-gray-400">
                            {svc.city || <span className="text-gray-400 italic">Unknown</span>}
                          </td>
                          <td className="py-3 px-3 text-gray-400 italic text-xs">
                            N/A
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAutoAssign(svc.id)}
                              disabled={backfillMutation.isPending}
                              data-testid={`button-auto-assign-${svc.id}`}
                            >
                              {assigningId === svc.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3 mr-1" />
                              )}
                              Auto-assign
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

        <Card className="border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10">
          <CardContent className="py-4 px-5">
            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">How it works</p>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Auto-assign uses Haversine proximity to find the nearest seeded neighborhood centroid
              matching the service's city. The neighborhood slug (not name) is written to preserve
              stability across renames. If no neighborhood is seeded for the service's city, the
              service is left unmatched.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
