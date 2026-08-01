import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Check } from "lucide-react";

/**
 * Display-only shape for a ground-transport catalog row.
 *
 * §16 (affiliate-outbound rule): the raw /api/catalog/ground-transport payload (CatalogItem,
 * server/services/travelpayouts/omio.service.ts) also carries `bookingUrl` / `affiliateUrl`.
 * This interface deliberately OMITS both — they are never read off the payload, never stored
 * in state, and never forwarded in either write below. The per-row "Book via agent" action
 * rides the §16 rail's catalog variant (POST /api/affiliate-booking-requests/from-catalog):
 * the client sends only {provider, itemId, destination} and the SERVER re-resolves the item
 * from the same catalog feed and attaches the affiliate URL itself — the URL never exists
 * client-side.
 */
interface TransportOption {
  id: string;
  title: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  duration?: string | number | null;
}
interface GroundTransportResponse { items: TransportOption[]; total: number }

/**
 * TransportPickerCore — the Add panel's seventh source pill (Workstation audit B-1).
 * Lists ground-transport routes for the build's destination from the existing Travelpayouts/
 * Omio catalog feed. Two actions per row: Add drops an INFORMATIONAL itinerary item (no URL
 * persisted), and Book via agent files a §16 booking-agent request via the from-catalog rail
 * (URL resolved server-side). Modeled on DmoPickerCore's search + list + add structure.
 */
export function TransportPickerCore({
  tripId,
  destination,
  dayNumber,
  onAdded,
}: {
  tripId: string;
  destination: string;
  dayNumber: number;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [agentRequested, setAgentRequested] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery<GroundTransportResponse>({
    queryKey: ["/api/catalog/ground-transport", destination],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/catalog/ground-transport?destination=${encodeURIComponent(destination)}&limit=20`);
      const json = await res.json();
      // §16 strip: rebuild each row from display fields only — bookingUrl/affiliateUrl on the
      // raw payload are never read onto TransportOption or into any state below.
      const items: TransportOption[] = (json.items ?? []).map((raw: any) => ({
        id: raw.id,
        title: raw.title,
        description: raw.description ?? null,
        price: typeof raw.price === "number" ? raw.price : null,
        currency: raw.currency ?? null,
        duration: raw.duration ?? null,
      }));
      return { items, total: json.total ?? items.length };
    },
    enabled: !!destination,
  });

  const addMutation = useMutation({
    mutationFn: async (opt: TransportOption) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, {
        title: opt.title,
        itemType: "transport",
        description: [opt.description, opt.duration ? `~${opt.duration}` : null].filter(Boolean).join(" · ") || undefined,
        // `estimated_cost` is a decimal(10,2) column — insertItineraryItemSchema (drizzle-zod)
        // expects a STRING, not the raw number `opt.price` carries (Fix 1's same-drift sibling,
        // matching service-picker-modal.tsx's `String(s.price)` next to it on the same endpoint).
        estimatedCost: opt.price != null ? String(opt.price) : undefined,
        dayNumber,
      });
      return res.json();
    },
    onSuccess: (_res, opt) => {
      setAdded((prev) => new Set(prev).add(opt.id));
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onAdded();
      toast({ title: "Added to itinerary", description: `${opt.title} → Day ${dayNumber}` });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add item", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  // §16: only a catalog REFERENCE goes up — the server re-resolves the item and attaches the
  // affiliate URL itself (this component never holds one to send).
  const agentBookMutation = useMutation({
    mutationFn: async (opt: TransportOption) => {
      const res = await apiRequest("POST", "/api/affiliate-booking-requests/from-catalog", {
        provider: "omio",
        itemId: opt.id,
        destination,
      });
      return res.json();
    },
    onSuccess: (_res, opt) => {
      setAgentRequested((prev) => new Set(prev).add(opt.id));
      toast({
        title: "Booking request sent",
        description: `A booking agent will arrange "${opt.title}" and confirm with you.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't request booking", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  const items = (data?.items ?? []).filter((it) =>
    !q.trim() || it.title.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search routes…"
          className="pl-8"
          data-testid="input-transport-picker-search"
        />
      </div>

      {!destination ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-transport-picker-no-destination">
          This build has no destination set yet — add one to search ground transport.
        </p>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : isError || items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-transport-picker-empty">
          No ground transport routes found for {destination}.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((opt) => (
            <div key={opt.id} className="rounded-lg border p-3" data-testid={`transport-picker-row-${opt.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{opt.title}</span>
                    <Badge variant="outline" className="capitalize shrink-0 text-xs">Transport</Badge>
                  </div>
                  {opt.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{opt.description}</p>
                  )}
                  {opt.price != null && (
                    <span className="text-xs text-muted-foreground mt-0.5 block">
                      ~{opt.currency ?? "USD"} {opt.price}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant={added.has(opt.id) ? "outline" : "default"}
                    disabled={added.has(opt.id) || addMutation.isPending}
                    onClick={() => addMutation.mutate(opt)}
                    data-testid={`button-transport-add-${opt.id}`}
                  >
                    {added.has(opt.id) ? (
                      <><Check className="w-3.5 h-3.5 mr-1" />Added</>
                    ) : (
                      <><Plus className="w-3.5 h-3.5 mr-1" />Add</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7"
                    disabled={agentRequested.has(opt.id) || agentBookMutation.isPending}
                    onClick={() => agentBookMutation.mutate(opt)}
                    data-testid={`button-transport-agent-book-${opt.id}`}
                  >
                    {agentRequested.has(opt.id) ? (
                      <><Check className="w-3.5 h-3.5 mr-1" />Agent requested</>
                    ) : (
                      <>Book via agent</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
