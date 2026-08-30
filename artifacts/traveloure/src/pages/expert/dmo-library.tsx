import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { EmptyState } from "@/components/backoffice/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Library,
  MapPin,
  ExternalLink,
  Sparkles,
  ArrowRight,
  PlusCircle,
  Check,
  Route as RouteIcon,
} from "lucide-react";

interface DmoItem {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  country: string;
  city: string;
  neighborhood?: string | null;
  contentType: string;
  status: string;
  tags?: string[] | null;
  confidenceScore?: string | null;
  sourceUrl: string;
  sourcePageTitle?: string | null;
  discoverPageVisible: boolean;
}

interface LibraryResponse {
  page: number;
  limit: number;
  total: number;
  items: DmoItem[];
}

// Traveloure launches Kyoto-first (§12): the DMO library is scoped to Kyoto.
const MARKET_CITY = "Kyoto";

export default function DmoLibrary() {
  const { toast } = useToast();
  const [active, setActive] = useState<DmoItem | null>(null);

  // Enrichment form state (dialog-local).
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [enrichmentSubmitted, setEnrichmentSubmitted] = useState(false);

  const { data, isLoading } = useQuery<LibraryResponse>({
    queryKey: ["/api/expert-workspace/library", MARKET_CITY],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/expert-workspace/library?city=${encodeURIComponent(MARKET_CITY)}&limit=100`,
      );
      return res.json();
    },
  });

  function openItem(item: DmoItem) {
    setActive(item);
    setEditName(item.name ?? "");
    setEditDescription(item.description ?? "");
    setEditTags((item.tags ?? []).join(", "));
    setEnrichmentSubmitted(false);
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
    onSuccess: () => {
      setEnrichmentSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/expert-workspace/library"] });
      toast({ title: "Saved", description: "Your refinements were saved to this content." });
    },
    onError: (err: any) => {
      toast({ title: "Could not save", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  // ── DMO → itinerary bridge: select places → build a Ready Made Trip draft ──
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const buildItinerary = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/expert-workspace/build-itinerary", {
        contentIds: Array.from(selected),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Draft store trip created",
        description: "Draft store trip created — opening the builder",
      });
      setSelected(new Set());
      navigate(data.redirect ?? `/expert/workspace/${data.tripId}`);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't build trip", description: err.message, variant: "destructive" });
    },
  });

  const items = data?.items ?? [];

  return (
    <ExpertLayout title="DMO Library">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Library className="w-5 h-5 text-primary" />
              Kyoto content library
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Your research library — destination content sourced from DMOs and heritage registers. Use it
              to build sellable <span className="font-medium">Ready Made Trips</span> and to enrich the
              itineraries you plan for clients. This content is a source for your work; it is never shown to
              travelers on its own.
            </p>
          </div>
        </div>

        {/* Build bar — select places, turn them into a Ready Made Trip draft. */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <RouteIcon className="w-4 h-4 text-primary" />
              <span>
                Select places to build a sellable <span className="font-medium">Ready Made Trip</span>.
                {selected.size > 0 ? ` ${selected.size} selected.` : ""}
              </span>
            </div>
            <Button
              size="sm"
              disabled={selected.size === 0 || buildItinerary.isPending}
              onClick={() => buildItinerary.mutate()}
              data-testid="button-build-itinerary"
            >
              {buildItinerary.isPending ? "Building…" : `Build Ready Made Trip${selected.size ? ` (${selected.size})` : ""}`}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Library}
            title="No content in your library yet"
            body="Approved DMO/heritage content for Kyoto will appear here as it is ingested — ready for you to refine and build into trips."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <Card
                key={item.id}
                className={`hover-elevate ${selected.has(item.id) ? "ring-2 ring-primary" : ""}`}
                data-testid={`dmo-card-${item.id}`}
              >
                <CardContent className="p-4 flex flex-col h-full">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold leading-tight">{item.name}</h3>
                    {item.contentType && (
                      <Badge variant="secondary" className="capitalize shrink-0">
                        {item.contentType}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={selected.has(item.id) ? "default" : "outline"}
                    className="mb-2 w-full"
                    onClick={() => toggleSelected(item.id)}
                    data-testid={`button-select-${item.id}`}
                  >
                    {selected.has(item.id) ? (
                      <><Check className="w-4 h-4 mr-2" />Added to trip</>
                    ) : (
                      <><PlusCircle className="w-4 h-4 mr-2" />Add to trip</>
                    )}
                  </Button>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    <MapPin className="w-3 h-3" />
                    {item.neighborhood ? `${item.neighborhood}, ` : ""}
                    {item.city}
                  </div>
                  {item.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-3 flex-1">
                      {item.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(item.tags ?? []).slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs capitalize">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-auto space-y-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => openItem(item)}
                      data-testid={`button-review-${item.id}`}
                    >
                      Review &amp; refine
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    {/* Factory wire B: library item → Content Studio prefilled draft (the DMO
                        "Create social post" follow-up — research becomes social content). */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() =>
                        navigate(
                          `/expert/content-studio?prefill=1&title=${encodeURIComponent(item.name ?? "")}` +
                            `&destination=Kyoto&type=travel-guide` +
                            `&description=${encodeURIComponent((item.description ?? "").slice(0, 500))}`,
                        )
                      }
                      data-testid={`button-social-post-${item.id}`}
                    >
                      Create social post
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>{active.name}</DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                  <MapPin className="w-3 h-3" />
                  {active.neighborhood ? `${active.neighborhood}, ` : ""}
                  {active.city}, {active.country}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <a
                  href={active.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  data-testid="link-dmo-source"
                >
                  <ExternalLink className="w-3 h-3" />
                  {active.sourcePageTitle || "View source"}
                </a>

                <div className="rounded-md bg-muted/50 border border-muted p-3 text-xs text-muted-foreground flex gap-2">
                  <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  Refine the raw content below so it's ready to build into a Ready Made Trip or a client
                  itinerary.
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    data-testid="input-edit-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    rows={5}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    data-testid="input-edit-description"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
                  <Input
                    id="edit-tags"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    data-testid="input-edit-tags"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => setActive(null)}
                  data-testid="button-close-refine"
                >
                  Close
                </Button>
                <Button
                  disabled={submitEnrichment.isPending || enrichmentSubmitted}
                  onClick={() => submitEnrichment.mutate(active)}
                  data-testid="button-submit-enrichment"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {enrichmentSubmitted ? "Saved" : "Save refinements"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ExpertLayout>
  );
}
