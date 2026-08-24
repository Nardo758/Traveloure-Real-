import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { MapPin, CheckCircle, X, Inbox, DollarSign } from "lucide-react";

/**
 * Admin triage queue for traveler-submitted service requests
 * (GET/PATCH /api/admin/service-requests, behind the blanket admin guard §2).
 * Travelers submit via the discover-location "Request a service" dialog; each
 * request is born 'open' and can be marked 'fulfilled' (a matching service now
 * exists) or 'closed' (dismissed).
 */

interface ServiceRequest {
  id: string;
  travelerId: string | null;
  city: string;
  country: string | null;
  serviceType: string | null;
  description: string;
  budget: string | null;
  status: "open" | "fulfilled" | "closed";
  adminNotes: string | null;
  createdAt: string;
}

const STATUS_TABS: Array<ServiceRequest["status"]> = ["open", "fulfilled", "closed"];

export default function AdminServiceRequests() {
  const { toast } = useToast();
  const [status, setStatus] = useState<ServiceRequest["status"]>("open");

  const { data: requests = [], isLoading } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/admin/service-requests", status],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/service-requests?status=${status}`);
      return res.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: ServiceRequest["status"] }) => {
      const res = await apiRequest("PATCH", `/api/admin/service-requests/${id}`, { status: next });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-requests"] });
      toast({ title: "Request updated" });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Update failed", description: err?.message ?? "Try again." }),
  });

  return (
    <AdminLayout title="Service Requests">
      <div className="mb-4 flex gap-2">
        {STATUS_TABS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => setStatus(s)}
            className="capitalize"
            data-testid={`tab-service-requests-${s}`}
          >
            {s}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
          <Inbox className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">No {status} requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} data-testid={`service-request-${r.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{r.city}{r.country ? `, ${r.country}` : ""}
                      </Badge>
                      {r.serviceType && <Badge variant="outline">{r.serviceType}</Badge>}
                      {r.budget && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />{r.budget}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {status === "open" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => updateStatus.mutate({ id: r.id, next: "fulfilled" })}
                        disabled={updateStatus.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        data-testid={`button-fulfill-${r.id}`}
                      >
                        <CheckCircle className="w-4 h-4" />Fulfilled
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus.mutate({ id: r.id, next: "closed" })}
                        disabled={updateStatus.isPending}
                        className="gap-1"
                        data-testid={`button-close-${r.id}`}
                      >
                        <X className="w-4 h-4" />Close
                      </Button>
                    </div>
                  )}
                  {status !== "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatus.mutate({ id: r.id, next: "open" })}
                      disabled={updateStatus.isPending}
                      data-testid={`button-reopen-${r.id}`}
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
