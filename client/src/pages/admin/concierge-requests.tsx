import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Crown, UserCheck } from "lucide-react";

interface ConciergeRequest {
  id: string;
  intent: string;
  event_type: string | null;
  chosen_tier: "expert" | "full" | string | null;
  status: string;
  created_at: string | null;
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
}

function tierBadge(tier: string | null) {
  if (tier === "full") {
    return (
      <Badge className="bg-purple-100 text-purple-700 border-purple-200">
        <Crown className="w-3 h-3 mr-1" /> Full / Done-for-You
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
      <UserCheck className="w-3 h-3 mr-1" /> Expert
    </Badge>
  );
}

function requesterName(r: ConciergeRequest) {
  const full = `${r.user_first_name || ""} ${r.user_last_name || ""}`.trim();
  return full || r.user_email || "Guest";
}

export default function AdminConciergeRequests() {
  const { data, isLoading } = useQuery<{ requests: ConciergeRequest[]; count: number }>({
    queryKey: ["/api/admin/concierge-requests"],
  });

  const requests = data?.requests ?? [];

  return (
    <AdminLayout title="Concierge Requests">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Concierge Requests
          </h1>
          <p className="text-muted-foreground mt-1">
            Human-fulfillment concierge leads (Expert &amp; Full / Done-for-You tiers). These
            are the traveler requests the concierge Full tier promises to follow up on — reach
            out to close them.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Incoming requests ({requests.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </>
            ) : requests.length > 0 ? (
              requests.map((r) => (
                <div
                  key={r.id}
                  className="p-4 border rounded-lg"
                  data-testid={`card-concierge-request-${r.id}`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tierBadge(r.chosen_tier)}
                        <Badge variant="outline">{r.status}</Badge>
                        {r.event_type && (
                          <span className="text-sm text-muted-foreground">{r.event_type}</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm">{r.intent}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {requesterName(r)}
                        {r.user_email ? ` · ${r.user_email}` : ""}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <Sparkles className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No concierge requests yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
