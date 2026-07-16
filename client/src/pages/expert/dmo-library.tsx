import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ArrowRight,
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

const STATUS_TABS = [
  { key: "pending_expert_review", label: "Pending review" },
  { key: "published", label: "Published" },
  { key: "rejected", label: "Rejected" },
];

// Traveloure launches Kyoto-first (§12): the DMO library is scoped to Kyoto.
const MARKET_CITY = "Kyoto";

function statusBadge(status: string) {
  switch (status) {
    case "published":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Published</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "quarantined":
      return <Badge variant="destructive">Quarantined</Badge>;
    default:
      return <Badge variant="secondary">Pending review</Badge>;
  }
}

export default function DmoLibrary() {
  const { toast } = useToast();
  const [status, setStatus] = useState("pending_expert_review");
  const [active, setActive] = useState<DmoItem | null>(null);

  // Enrichment form state (dialog-local).
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  // True once the expert has submitted an enrichment for the open item — the
  // server gates publishing on a submitted edit existing, so we mirror that here.
  const [enrichmentSubmitted, setEnrichmentSubmitted] = useState(false);

  const { data, isLoading } = useQuery<LibraryResponse>({
    queryKey: ["/api/expert-workspace/library", MARKET_CITY, status],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/expert-workspace/library?city=${encodeURIComponent(MARKET_CITY)}&status=${status}&limit=100`,
      );
      return res.json();
    },
  });

  function openItem(item: DmoItem) {
    setActive(item);
    setEditName(item.name ?? "");
    setEditDescription(item.description ?? "");
    setEditTags((item.tags ?? []).join(", "));
    setRejectReason("");
    setEnrichmentSubmitted(false);
  }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/expert-workspace/library"] });
  };

  // Save enrichment as a draft edit, then submit it (the server requires a
  // *submitted* edit before the content can be published to Discover).
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
      toast({ title: "Enrichment submitted", description: "You can now publish this to Discover." });
    },
    onError: (err: any) => {
      toast({ title: "Could not submit enrichment", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  const publish = useMutation({
    mutationFn: async (item: DmoItem) => {
      const res = await apiRequest("POST", `/api/expert-workspace/content/${item.id}/publish`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Published to Discover", description: "Travelers can now see this content." });
      setActive(null);
      refresh();
    },
    onError: (err: any) => {
      toast({ title: "Could not publish", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  const reject = useMutation({
    mutationFn: async (item: DmoItem) => {
      const res = await apiRequest("POST", `/api/expert-workspace/content/${item.id}/reject`, {
        reason: rejectReason,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "This content will not be published." });
      setActive(null);
      refresh();
    },
    onError: (err: any) => {
      toast({ title: "Could not reject", description: String(err?.message ?? err), variant: "destructive" });
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
              Raw destination content sourced from DMOs and heritage registers. Nothing here is visible to
              travelers until you review, enrich, and publish it — you are the gate to the Discover page.
            </p>
          </div>
        </div>

        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} data-testid={`tab-dmo-${t.key}`}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {STATUS_TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-6">
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-40 rounded-lg" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-muted py-16 text-center">
                  <Library className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                  <h3 className="font-semibold mb-1">
                    {t.key === "pending_expert_review"
                      ? "No content awaiting review"
                      : t.key === "published"
                        ? "Nothing published yet"
                        : "Nothing rejected"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {t.key === "pending_expert_review"
                      ? "New DMO/heritage content will appear here for review as it is ingested."
                      : t.key === "published"
                        ? "Content you publish from the review queue will show up here."
                        : "Content you reject will be listed here."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((item) => (
                    <Card key={item.id} className="hover-elevate" data-testid={`dmo-card-${item.id}`}>
                      <CardContent className="p-4 flex flex-col h-full">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-semibold leading-tight">{item.name}</h3>
                          {statusBadge(item.status)}
                        </div>
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
                        <Button
                          size="sm"
                          variant={item.status === "pending_expert_review" ? "default" : "outline"}
                          className="w-full mt-auto"
                          onClick={() => openItem(item)}
                          data-testid={`button-review-${item.id}`}
                        >
                          {item.status === "pending_expert_review" ? (
                            <>
                              Review &amp; enrich
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                          ) : (
                            "View"
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {active.name}
                  {statusBadge(active.status)}
                </DialogTitle>
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

                {active.status === "pending_expert_review" ? (
                  <>
                    <div className="rounded-md bg-muted/50 border border-muted p-3 text-xs text-muted-foreground flex gap-2">
                      <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      Enrich the raw content below, then submit it for publishing. Nothing reaches travelers
                      until you publish.
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

                    <Button
                      variant="secondary"
                      className="w-full"
                      disabled={submitEnrichment.isPending || enrichmentSubmitted}
                      onClick={() => submitEnrichment.mutate(active)}
                      data-testid="button-submit-enrichment"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {enrichmentSubmitted ? "Enrichment submitted" : "Submit enrichment"}
                    </Button>

                    <div className="space-y-1 pt-2">
                      <Label htmlFor="reject-reason">Reject reason (optional, for rejecting)</Label>
                      <Input
                        id="reject-reason"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="e.g. duplicate, low quality"
                        data-testid="input-reject-reason"
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{active.description}</p>
                )}
              </div>

              {active.status === "pending_expert_review" && (
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    variant="outline"
                    className="text-destructive"
                    disabled={reject.isPending || !rejectReason.trim()}
                    onClick={() => reject.mutate(active)}
                    data-testid="button-reject"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    disabled={publish.isPending || !enrichmentSubmitted}
                    onClick={() => publish.mutate(active)}
                    data-testid="button-publish"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Publish to Discover
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </ExpertLayout>
  );
}
