import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Plus, Check, Library, Search } from "lucide-react";

interface DmoItem {
  id: string;
  name: string;
  description?: string | null;
  city: string;
  neighborhood?: string | null;
  contentType: string;
  tags?: string[] | null;
}
interface LibraryResponse { items: DmoItem[] }

// DMO content types → itinerary itemType (matches the workspace AddItemModal's set).
const TYPE_TO_ITEM: Record<string, string> = {
  restaurant: "dining",
  venue: "activity",
  attraction: "activity",
  destination: "activity",
  event: "activity",
  transport: "transport",
};

/**
 * "Add from DMO Library" — inside the expert trip workspace, browse the expert's
 * admin-approved DMO research content and drop a selected place onto the current
 * trip's itinerary. Writes via the live POST /api/trips/:tripId/itinerary-items
 * (the same endpoint AddItemModal uses) — no new server surface. Kyoto-scoped (§12).
 */
export function DmoPickerModal({
  tripId,
  dayNumber,
  onClose,
  onAdded,
}: {
  tripId: string;
  dayNumber: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<LibraryResponse>({
    queryKey: ["/api/expert-workspace/library", "Kyoto", "picker"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/expert-workspace/library?city=Kyoto&limit=100`);
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (item: DmoItem) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, {
        title: item.name,
        description: item.description || undefined,
        itemType: TYPE_TO_ITEM[item.contentType] ?? "activity",
        locationName: item.neighborhood || item.name,
        dayNumber,
      });
      return res.json();
    },
    onSuccess: (_res, item) => {
      setAdded((prev) => new Set(prev).add(item.id));
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onAdded();
      toast({ title: "Added to itinerary", description: `${item.name} → Day ${dayNumber}` });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add item", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  const items = (data?.items ?? []).filter((it) =>
    !q.trim() || it.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="w-4 h-4 text-primary" />
            Add from DMO Library — Day {dayNumber}
          </DialogTitle>
          <DialogDescription>
            Your admin-approved Kyoto research content. Add a place to this trip's itinerary.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your library…"
            className="pl-8"
            data-testid="input-dmo-picker-search"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No approved content in your library yet. Ask an admin to approve DMO content, or add it from the
            DMO Library.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
                data-testid={`dmo-picker-row-${it.id}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{it.name}</span>
                    <Badge variant="outline" className="capitalize shrink-0 text-xs">{it.contentType}</Badge>
                  </div>
                  {it.neighborhood && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin className="w-3 h-3" /> {it.neighborhood}
                    </span>
                  )}
                  {it.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{it.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={added.has(it.id) ? "outline" : "default"}
                  disabled={added.has(it.id) || addMutation.isPending}
                  onClick={() => addMutation.mutate(it)}
                  className="shrink-0"
                  data-testid={`button-dmo-add-${it.id}`}
                >
                  {added.has(it.id) ? (
                    <><Check className="w-3.5 h-3.5 mr-1" />Added</>
                  ) : (
                    <><Plus className="w-3.5 h-3.5 mr-1" />Add</>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
