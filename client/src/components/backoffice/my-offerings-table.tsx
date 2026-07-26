/**
 * MyOfferingsTable — the mockup's single cross-lane offerings table (backoffice Phase 1c;
 * docs/backoffice/mockups/mockup-backoffice-dashboard.html "My Offerings").
 *
 * Pure client aggregation of the three existing owner-console endpoints — no new backend
 * (EXPERT_SIDE_MAP: "client aggregation + a normalized status column"). Status vocabulary maps
 * 1:1 onto the real approval lifecycle (D1a): draft → submitted ("Pending Review") → approved /
 * rejected. Share links only exist for approved items (the public read-gates would 404 otherwise).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { LayoutList, Share2, Pencil } from "lucide-react";

type Lane = "service" | "template" | "ready_made";

interface OfferingRow {
  id: string;
  lane: Lane;
  laneLabel: string;
  name: string;
  price: string | null;
  approval: string; // normalized: approved | submitted | draft | rejected | unknown
  editHref: string;
  publicHref: string | null; // only when approved (+published where applicable)
  nextAvailability: string | null; // ISO date, service lane only; null = no slots / not applicable
}

function formatNextAvailability(dateStr: string | null): string {
  if (!dateStr) return "No slots scheduled";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "No slots scheduled";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  submitted: "Pending Review",
  draft: "Draft",
  rejected: "Rejected",
};
const STATUS_CLASS: Record<string, string> = {
  approved: "bg-green-100 text-green-800 border-green-200",
  submitted: "bg-amber-100 text-amber-800 border-amber-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

export function MyOfferingsTable() {
  const { toast } = useToast();

  const services = useQuery<any[]>({ queryKey: ["/api/expert/services"] });
  const templates = useQuery<any[]>({ queryKey: ["/api/expert/templates"] });
  const readyMade = useQuery<any[]>({ queryKey: ["/api/expert/ready-made/mine"] });
  // Backoffice C1: soonest future, not-fully-booked vendor_availability_slots row per
  // service id (service lane only — templates/Ready Made Trips have no slots).
  const nextAvailability = useQuery<Record<string, string>>({ queryKey: ["/api/me/next-availability"] });

  const isLoading = services.isLoading || templates.isLoading || readyMade.isLoading;

  const rows: OfferingRow[] = [
    ...(Array.isArray(services.data) ? services.data : []).map((s: any): OfferingRow => {
      const approval = s.approvalStatus ?? "unknown";
      return {
        id: s.id,
        lane: "service",
        laneLabel: "Service",
        name: s.serviceName ?? s.title ?? "Untitled service",
        price: s.price != null ? `$${Number(s.price).toFixed(0)}` : null,
        approval,
        editHref: "/expert/services",
        publicHref: approval === "approved" ? `/services/${s.id}` : null,
        nextAvailability: nextAvailability.data?.[s.id] ?? null,
      };
    }),
    ...(Array.isArray(templates.data) ? templates.data : []).map((t: any): OfferingRow => {
      const approval = t.approvalStatus ?? "unknown";
      return {
        id: t.id,
        lane: "template",
        laneLabel: "Itinerary Template",
        name: t.title ?? "Untitled template",
        price: t.price != null ? `$${Number(t.price).toFixed(0)}` : null,
        approval,
        editHref: "/expert/templates",
        publicHref: approval === "approved" && t.isPublished ? `/expert-templates/${t.id}` : null,
        nextAvailability: null,
      };
    }),
    ...(Array.isArray(readyMade.data) ? readyMade.data : []).map((r: any): OfferingRow => {
      const approval = r.status ?? "unknown";
      return {
        id: r.id,
        lane: "ready_made",
        laneLabel: "Ready Made Trip",
        name: r.title ?? "Untitled trip",
        price: r.priceCents != null ? `$${(r.priceCents / 100).toFixed(0)}` : null,
        nextAvailability: null,
        approval,
        editHref: "/expert/ready-made",
        publicHref: approval === "approved" ? `/ready-made/${r.id}` : null,
      };
    }),
  ];

  async function share(row: OfferingRow) {
    if (!row.publicHref) return;
    const fallbackUrl = `${window.location.origin}${row.publicHref}`;
    try {
      const res = await fetch("/api/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetType: row.lane, targetId: row.id }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json() as { url: string };
      const shortUrl = `${window.location.origin}${data.url}`;
      navigator.clipboard.writeText(shortUrl);
      toast({ title: "Link copied", description: shortUrl });
    } catch {
      // Graceful fallback to the existing full public URL on any error.
      navigator.clipboard.writeText(fallbackUrl);
      toast({ title: "Link copied", description: fallbackUrl });
    }
  }

  return (
    <Card data-testid="card-my-offerings">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LayoutList className="w-4 h-4 text-primary" />
          My Offerings
          {!isLoading && (
            <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-offerings">
            No offerings yet — create a service, itinerary template, or Ready Made Trip to start selling.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-semibold">Offering</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Price</th>
                  <th className="py-2 pr-3 font-semibold">Next availability</th>
                  <th className="py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.lane}-${row.id}`} className="border-b last:border-0" data-testid={`offering-row-${row.lane}-${row.id}`}>
                    <td className="py-2.5 pr-3 font-medium">{row.name}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{row.laneLabel}</td>
                    <td className="py-2.5 pr-3">
                      <Badge className={`text-xs border ${STATUS_CLASS[row.approval] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {STATUS_LABEL[row.approval] ?? row.approval}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">{row.price ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground" data-testid={`next-availability-${row.lane}-${row.id}`}>
                      {row.lane === "service" ? formatNextAvailability(row.nextAvailability) : "—"}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        <Link href={row.editHref}>
                          <Button size="sm" variant="ghost" data-testid={`button-edit-${row.lane}-${row.id}`}>
                            <Pencil className="w-3.5 h-3.5 mr-1" />
                            Edit
                          </Button>
                        </Link>
                        {row.publicHref && (
                          <Button size="sm" variant="ghost" onClick={() => share(row)} data-testid={`button-share-${row.lane}-${row.id}`}>
                            <Share2 className="w-3.5 h-3.5 mr-1" />
                            Share
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
