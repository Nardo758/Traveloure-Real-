import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Check, Clock } from "lucide-react";
// `parsePartnerSource`/`PARTNER_NETWORKS` live in the dependency-free client/src/lib/
// partner-source.ts (workspace.tsx and server-side/test code import from there directly — this
// component's own `@/components/ui/*` + React imports don't resolve outside a bundler).
import { PARTNER_NETWORKS, buildPartnerDescription } from "@/lib/partner-source";

/**
 * PartnerCatalogPickerCore — W3-A, item 10 tiers (a)+(c).
 *
 * The Partner-inventory pill's browsable catalog: reads the EXISTING `/api/catalog/*`
 * Travelpayouts tours/activities feeds (the same feeds behind the platform's discover/service
 * browsing surfaces — see server/routes/content.routes.ts ~1023-1330), one network at a time.
 *
 * §16 (affiliate-outbound rule): the raw feed payload (CatalogItem, BaseItem in
 * server/services/experience-catalog.service.ts) carries `bookingUrl` / `affiliateUrl` on
 * every item. This module deliberately OMITS both from `PartnerCatalogItem` — they are never
 * read off the raw payload, never stored in state, and never forwarded in either write path
 * below (direct item-create or suggestion). The only URL a booking action can ever open is the
 * admin-managed `affiliate_partners.websiteUrl` surfaced by the pre-existing "Affiliate
 * Networks" list (workspace.tsx) — a general partner homepage, never an item-specific
 * affiliate-tracked link. Confirmed by reading every wired network's service file
 * (tiqets/wegotrip/viator-feed/getyourguide/klook): all five map onto the same `BaseItem`
 * shape and all five carry `bookingUrl`/`affiliateUrl` that this module strips.
 *
 * Tier (a) — honest availability: every card is stamped with the feed's fetched-at time
 * (react-query's own `dataUpdatedAt`, not a client `Date.now()` guess) plus a fixed
 * "Availability confirmed at booking" label — a cached feed must never claim in-stock (§13).
 * Tier (b) (real-time per-partner availability) is explicitly out of scope for this lane.
 *
 * Tier (c) — the customer-approval gate: on an ASSIGNMENT trip (isAuthoring=false) "Add" files
 * a suggestion via the existing `POST /trips/:id/suggestions` rail instead of creating an item
 * directly — the item only materializes once the traveler approves it (booking-actions.ts).
 * On an AUTHORED build (no client) the add writes the item straight through, same as every
 * other Add-panel source. Both paths mark the write with a plain "Partner: <Network>" prefix
 * on `description` (mirrors LogBookingForm's "Booked via <Network>" convention) — the one
 * honest, non-affiliate fact carried through, and the signal `parsePartnerSource` below reads
 * back to gate the per-item Booking Brief action.
 */

/** Display-only shape — see the §16 note above for what is deliberately excluded. */
interface PartnerCatalogItem {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
}
interface CatalogFeedResponse { items: PartnerCatalogItem[]; total: number }

function formatFetchedAt(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function PartnerCatalogPickerCore({
  tripId,
  destination,
  dayNumber,
  isAuthoring,
  onAdded,
}: {
  tripId: string;
  destination: string;
  dayNumber: number;
  isAuthoring: boolean;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [networkKey, setNetworkKey] = useState(PARTNER_NETWORKS[0].key);
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());

  const network = PARTNER_NETWORKS.find((n) => n.key === networkKey)!;

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<CatalogFeedResponse>({
    queryKey: [network.path, destination],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `${network.path}?destination=${encodeURIComponent(destination)}&city=${encodeURIComponent(destination)}&limit=20`,
      );
      const json = await res.json();
      // §16 strip: rebuild each row from display fields only — bookingUrl/affiliateUrl on the
      // raw payload are never read onto PartnerCatalogItem or into any state below.
      const items: PartnerCatalogItem[] = (json.items ?? []).map((raw: any) => ({
        id: String(raw.id),
        title: raw.title || "Untitled",
        description: raw.description ?? null,
        imageUrl: raw.imageUrl ?? null,
        price: typeof raw.price === "number" ? raw.price : null,
        currency: raw.currency ?? null,
        category: Array.isArray(raw.categories) && raw.categories.length > 0 ? raw.categories[0] : null,
        latitude: raw.location?.lat ?? null,
        longitude: raw.location?.lng ?? null,
      }));
      return { items, total: json.total ?? items.length };
    },
    enabled: !!destination,
  });

  const addMutation = useMutation({
    mutationFn: async (item: PartnerCatalogItem) => {
      const description = buildPartnerDescription(network.label, item.description);
      if (isAuthoring) {
        const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, {
          title: item.title,
          itemType: "activity",
          description,
          // `estimated_cost` is a decimal(10,2) column — insertItineraryItemSchema (drizzle-zod)
          // expects a STRING, matching the same drift guard as transport-picker.tsx.
          estimatedCost: item.price != null ? String(item.price) : undefined,
          dayNumber,
          ...(item.latitude != null && item.longitude != null
            ? { latitude: String(item.latitude), longitude: String(item.longitude) }
            : {}),
        });
        return { res: await res.json(), viaSuggestion: false as const };
      }
      // Assignment trip: route the add AS a suggestion — the customer-approval gate. The item
      // only materializes into the itinerary once the traveler approves it (booking-actions.ts
      // PATCH .../suggestions/:suggestionId). No item is created here.
      const res = await apiRequest("POST", `/api/trips/${tripId}/suggestions`, {
        type: "activity",
        dayNumber,
        title: item.title,
        description,
        estimatedCost: item.price != null ? String(item.price) : undefined,
      });
      return { res: await res.json(), viaSuggestion: true as const };
    },
    onSuccess: (result, item) => {
      setAdded((prev) => new Set(prev).add(item.id));
      if (result.viaSuggestion) {
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/suggestions`] });
        toast({ title: "Sent to client for approval", description: `"${item.title}" will appear once approved.` });
      } else {
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
        onAdded();
        toast({ title: "Added to itinerary", description: `${item.title} → Day ${dayNumber}` });
      }
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add item", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" });
    },
  });

  const items = useMemo(
    () => (data?.items ?? []).filter((it) => !q.trim() || it.title.toLowerCase().includes(q.trim().toLowerCase())),
    [data, q],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" data-testid="partner-network-tabs">
        {PARTNER_NETWORKS.map((n) => (
          <Button
            key={n.key}
            type="button"
            size="sm"
            variant={n.key === networkKey ? "default" : "outline"}
            className="h-6 px-2 text-xs"
            onClick={() => setNetworkKey(n.key)}
            data-testid={`button-partner-network-${n.key}`}
          >
            {n.label}
          </Button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${network.label}…`}
          className="pl-8"
          data-testid="input-partner-catalog-search"
        />
      </div>

      {!isLoading && !isError && (data?.items?.length ?? 0) > 0 && (
        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-md border px-2.5 py-1.5"
          data-testid="text-partner-catalog-availability"
        >
          <Clock className="w-3 h-3 shrink-0" />
          <span>Fetched {formatFetchedAt(dataUpdatedAt)} · Availability confirmed at booking</span>
        </div>
      )}

      {!destination ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-partner-catalog-no-destination">
          This build has no destination set yet — add one to browse the partner catalog.
        </p>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : isError || items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-partner-catalog-empty">
          No {network.label} listings found for {destination}.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3" data-testid={`partner-catalog-row-${item.id}`}>
              <div className="flex items-start gap-3">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="w-14 h-14 rounded-md object-cover shrink-0 bg-muted"
                    data-testid={`img-partner-catalog-${item.id}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{item.title}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">{network.label}</Badge>
                    {item.category && <Badge variant="outline" className="capitalize shrink-0 text-xs">{item.category}</Badge>}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description}</p>
                  )}
                  {item.price != null && (
                    <span className="text-xs text-muted-foreground mt-0.5 block">
                      ~{item.currency ?? "USD"} {item.price}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={added.has(item.id) ? "outline" : "default"}
                  disabled={added.has(item.id) || addMutation.isPending}
                  onClick={() => addMutation.mutate(item)}
                  className="shrink-0"
                  data-testid={`button-partner-catalog-add-${item.id}`}
                >
                  {added.has(item.id) ? (
                    <><Check className="w-3.5 h-3.5 mr-1" />{isAuthoring ? "Added" : "Sent"}</>
                  ) : (
                    <><Plus className="w-3.5 h-3.5 mr-1" />{isAuthoring ? `Add to Day ${dayNumber}` : "Suggest to client"}</>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
