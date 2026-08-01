import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Plus, Check, Library, Search, Pencil, Sparkles } from "lucide-react";

interface DmoItem {
  id: string;
  name: string;
  description?: string | null;
  city: string;
  neighborhood?: string | null;
  contentType: string;
  tags?: string[] | null;
  // L27-P1: dmo_raw_content.latitude/longitude are real decimal columns, returned by
  // GET /api/expert-workspace/library as-is (full row spread). No ingestion path writes
  // them today, so they are typically null — but when present they are the item's OWN
  // coordinate, not a neighborhood substitute, so they're safe to carry through.
  latitude?: string | number | null;
  longitude?: string | number | null;
  // W5-C: the server now overlays the requesting expert's OWN latest expert_dmo_edits row
  // onto name/description/tags/etc — `name`/`description`/`tags` above are already the
  // MERGED (refined-if-present) values. `isRefined` says whether an overlay actually
  // happened; `raw` is the untouched original so the UI can show what changed, honestly.
  isRefined?: boolean;
  raw?: {
    name: string;
    description?: string | null;
    shortDescription?: string | null;
    tags?: string[] | null;
  };
}

// Mirrors workspace.tsx's isLocatedItem: decimal columns arrive as strings over JSON;
// reject null/NaN so an absent coordinate is never coerced into a fabricated one.
function hasRealCoords(item: { latitude?: string | number | null; longitude?: string | number | null }): boolean {
  const lat = item.latitude == null ? NaN : typeof item.latitude === "number" ? item.latitude : parseFloat(item.latitude);
  const lng = item.longitude == null ? NaN : typeof item.longitude === "number" ? item.longitude : parseFloat(item.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
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
 * DmoPickerCore — the modal's search + list + add body, extracted (Phase A2) so the
 * workspace's Add panel can embed the same browse/add flow inline without the Dialog
 * chrome. Same fetch, same POST /api/trips/:tripId/itinerary-items write — one logic home.
 *
 * C7 (§17 17→9): also carries the review-and-refine flow (expert_dmo_edits) folded in
 * from the retired dmo-library.tsx — same POST /api/expert-workspace/content/:id/edit →
 * PATCH /api/expert-workspace/edits/:id/submit write, verbatim — so the Add panel's DMO
 * drawer is the library's one home; /expert/dmo-library redirects to the Workstation.
 */
export function DmoPickerCore({
  tripId,
  dayNumber,
  onAdded,
}: {
  tripId: string;
  dayNumber: number;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());

  // Refine editor state (one open editor at a time, form state scoped to it).
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [refined, setRefined] = useState<Set<string>>(new Set());

  function toggleRefine(item: DmoItem) {
    if (refiningId === item.id) {
      setRefiningId(null);
      return;
    }
    setRefiningId(item.id);
    setEditName(item.name ?? "");
    setEditDescription(item.description ?? "");
    setEditTags((item.tags ?? []).join(", "));
    // Reopening re-enables save (mirrors dmo-library.tsx's reset on open).
    setRefined((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  }

  // Save enrichment as a draft edit, then submit it — refines the raw content (name,
  // description, tags) before it's built into a Ready Made Trip or a client itinerary.
  const submitEnrichment = useMutation({
    mutationFn: async (item: DmoItem) => {
      const tags = editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const editRes = await apiRequest("POST", `/api/expert-workspace/content/${item.id}/edit`, {
        editedName: editName || undefined,
        editedDescription: editDescription || undefined,
        editedTags: tags.length > 0 ? tags : undefined,
      });
      const edit = await editRes.json();
      await apiRequest("PATCH", `/api/expert-workspace/edits/${edit.id}/submit`);
      return edit;
    },
    onSuccess: (_edit, item) => {
      setRefined((prev) => new Set(prev).add(item.id));
      queryClient.invalidateQueries({ queryKey: ["/api/expert-workspace/library"] });
      toast({ title: "Saved", description: "Your refinements were saved to this content." });
    },
    onError: (err: any) => {
      toast({ title: "Could not save", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  const { data, isLoading } = useQuery<LibraryResponse>({
    queryKey: ["/api/expert-workspace/library", "Kyoto", "picker"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/expert-workspace/library?city=Kyoto&limit=100`);
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (item: DmoItem) => {
      // L27-P1: never geocode client-side and never substitute a neighborhood centroid —
      // only carry the item's OWN latitude/longitude, and only when it's a real value.
      const withCoords = hasRealCoords(item);
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, {
        title: item.name,
        description: item.description || undefined,
        itemType: TYPE_TO_ITEM[item.contentType] ?? "activity",
        locationName: item.neighborhood || item.name,
        ...(withCoords ? { latitude: String(item.latitude), longitude: String(item.longitude) } : {}),
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
    // Plan-approval mode flip (migration 164): once the client approves a delivered plan, this
    // 409s with an honest "send it as a suggestion instead" message — parse it out rather than
    // showing the raw `"409: {...}"` string.
    onError: (err: any) => {
      toast({ title: "Couldn't add item", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" });
    },
  });

  const items = (data?.items ?? []).filter((it) =>
    !q.trim() || it.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
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
            No approved content in your library yet. Ask an admin to approve DMO content — it will
            appear here, ready to refine and add to trips.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div
                key={it.id}
                className="rounded-lg border p-3"
                data-testid={`dmo-picker-row-${it.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{it.name}</span>
                      <Badge variant="outline" className="capitalize shrink-0 text-xs">{it.contentType}</Badge>
                      {it.isRefined && (
                        <Badge className="shrink-0 text-xs gap-1" data-testid={`badge-refined-${it.id}`}>
                          <Sparkles className="w-3 h-3" /> Refined
                        </Badge>
                      )}
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
                  <div className="flex flex-col items-stretch gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant={added.has(it.id) ? "outline" : "default"}
                      disabled={added.has(it.id) || addMutation.isPending}
                      onClick={() => addMutation.mutate(it)}
                      data-testid={`button-dmo-add-${it.id}`}
                    >
                      {added.has(it.id) ? (
                        <><Check className="w-3.5 h-3.5 mr-1" />Added</>
                      ) : (
                        <><Plus className="w-3.5 h-3.5 mr-1" />Add</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => toggleRefine(it)}
                      data-testid={`button-dmo-refine-${it.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      {refiningId === it.id ? "Close" : "Refine"}
                    </Button>
                  </div>
                </div>

                {refiningId === it.id && (
                  <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-3" data-testid={`dmo-refine-editor-${it.id}`}>
                    <p className="text-xs text-muted-foreground flex gap-2">
                      <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      Refine the raw content below so it's ready to build into a Ready Made Trip or a
                      client itinerary.
                    </p>
                    {it.isRefined && it.raw && (
                      <p className="text-xs text-muted-foreground/80 rounded-md bg-background border px-2 py-1.5" data-testid={`dmo-refine-original-${it.id}`}>
                        Original (unrefined): <span className="italic">{it.raw.name}</span>
                        {it.raw.description ? ` — ${it.raw.description}` : ""}
                      </p>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor={`dmo-refine-name-${it.id}`} className="text-xs">Name</Label>
                      <Input
                        id={`dmo-refine-name-${it.id}`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        data-testid="input-dmo-refine-name"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`dmo-refine-description-${it.id}`} className="text-xs">Description</Label>
                      <Textarea
                        id={`dmo-refine-description-${it.id}`}
                        rows={4}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        data-testid="input-dmo-refine-description"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`dmo-refine-tags-${it.id}`} className="text-xs">Tags (comma-separated)</Label>
                      <Input
                        id={`dmo-refine-tags-${it.id}`}
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        data-testid="input-dmo-refine-tags"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {/* Factory wire B (carried from the retired dmo-library.tsx): library item →
                          Content Studio prefilled draft — research becomes social content. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() =>
                          navigate(
                            `/expert/content-studio?prefill=1&title=${encodeURIComponent(it.name ?? "")}` +
                              `&destination=Kyoto&type=travel-guide` +
                              `&description=${encodeURIComponent((it.description ?? "").slice(0, 500))}`,
                          )
                        }
                        data-testid={`button-social-post-${it.id}`}
                      >
                        Create social post
                      </Button>
                      <Button
                        size="sm"
                        disabled={submitEnrichment.isPending || refined.has(it.id)}
                        onClick={() => submitEnrichment.mutate(it)}
                        data-testid="button-dmo-refine-submit"
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-1" />
                        {refined.has(it.id) ? "Saved" : submitEnrichment.isPending ? "Saving…" : "Save refinements"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

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
        <DmoPickerCore tripId={tripId} dayNumber={dayNumber} onAdded={onAdded} />
      </DialogContent>
    </Dialog>
  );
}
