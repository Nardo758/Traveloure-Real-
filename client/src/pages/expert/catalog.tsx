/**
 * Catalog — Backoffice Phase B3 (ratified v9 spec, module 4) + Console IA C2
 * (§17 17→9 collapse; mockup-console-pages.html section 5, the Catalog frame).
 *
 * "Catalog — what I sell: services + builds + their distribution states, per-service
 * availability (closes the 'no slot UI for experts' hole). Absorbs: My Offerings, Store
 * Listings management." §17: "Catalog = the storefront's management home."
 *
 * C2 completed the absorption: the STOREFRONT HEADER at the top (the /p/:handle link,
 * honest Live status derived from the same approval gates the public page enforces,
 * Preview + Copy link, and the storefront caption share tool); the MyOfferingsTable now
 * carries the real per-service actions (edit/pause/duplicate — lifted from the retired
 * /expert/services page's wiring); and Share & Promote's offering-scoped creation half
 * (per-row share kits + the Posting Opportunities card) moved in via the shared
 * components/backoffice/share-tools.tsx. Both "My Offerings" (/expert/services) and
 * "Share & Promote" (/expert/share-promote) now redirect here.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useExpertVerificationStatus } from "@/hooks/use-expert-verification-status";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { MyOfferingsTable } from "@/components/backoffice/my-offerings-table";
import { PostingOpportunitiesCard, StorefrontShareTools, ensureShortLink } from "@/components/backoffice/share-tools";
import { PageHeader, EmptyState, StatusBadge, type StatusBadgeEntry } from "@/components/backoffice/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LayoutGrid, CalendarClock, Trash2, Plus, Copy, ExternalLink, ShieldAlert } from "lucide-react";

interface MyService {
  id: string;
  serviceName?: string;
  title?: string;
  approvalStatus?: string;
  status?: string;
}

interface AvailabilitySlot {
  id: string;
  date: string;
  startTime: string | null;
  capacity: number | null;
  bookedCount: number | null;
  status: string | null;
}

/** apiRequest throws `Error("<status>: <body>")` — pull the server's honest message out of it
 *  (falling back to the raw text) so a 409 booked-slot refusal reads as prose, not a status code. */
function parseApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const match = err.message.match(/^\d+:\s*([\s\S]*)$/);
    const body = match ? match[1] : err.message;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) return parsed.message as string;
    } catch {
      // not JSON — use the raw body text
    }
    return body || fallback;
  }
  return fallback;
}

function formatSlotDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// ─── Verification status banner (dispatch v1.3 R2, docs/DECISIONS.md ruling 53) ─────────────
// "Verification moves early in expert onboarding with explicit pending-state UX: the expert
// always knows verification status, what's blocking, and what happens next. It must never be
// discovered at the publish click." Catalog is the first console page an expert reaches to
// build listings (per §22b, it's already "what I sell"'s home) — so this is where the
// requirement surfaces BEFORE any effort goes into a service, not just at the ServiceForm
// Publish button. Reuses expert-status.tsx's own copy/verbs and the identical
// /api/expert/application-status field via the shared hook — one source of truth, not a
// second implementation. §13: renders nothing while the real status is unknown (loading or
// unresolvable) rather than guessing "pending"; renders nothing once actually verified.

const IDENTITY_STATUS_BADGE_MAP: Record<string, StatusBadgeEntry> = {
  pending: { label: "Not started", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700 border-blue-200" },
  verified: { label: "Verified", className: "bg-green-100 text-green-700 border-green-200" },
  failed: { label: "Needs attention", className: "bg-red-100 text-red-700 border-red-200" },
};

function VerificationStatusBanner() {
  const { enabled, isLoading, isError, status, isVerified } = useExpertVerificationStatus();

  // Not an expert session, still loading, or already verified — nothing to say.
  if (!enabled || isLoading || isVerified) return null;

  if (isError || !status) {
    return (
      <Card className="border border-amber-300 bg-amber-50" data-testid="card-verification-status-unknown">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-console-darkest">Verification status unavailable</p>
            <p className="text-xs text-console-mid mt-1">
              We couldn't load your identity-verification status just now. Publishing a listing requires a
              verified identity — check{" "}
              <Link href="/expert-status">
                <span className="underline cursor-pointer font-medium">your Expert Status page</span>
              </Link>
              .
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const copy: Record<"pending" | "processing" | "failed", { title: string; body: string }> = {
    pending: {
      title: "Identity verification required to publish",
      body: "You can build and save drafts freely, but a listing can't go live until you verify your identity — takes about 2 minutes.",
    },
    processing: {
      title: "Identity verification in progress",
      body: "Your verification is being processed — usually a few minutes. Drafts stay unblocked while you wait; publishing unlocks once it clears.",
    },
    failed: {
      title: "Identity verification needs attention",
      body: "Your last verification attempt was unsuccessful, so publishing is still blocked. Retry with a clear photo of your ID.",
    },
  };
  const { title, body } = copy[status as "pending" | "processing" | "failed"];

  return (
    <Card className="border border-amber-300 bg-amber-50" data-testid="card-verification-status-banner">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-console-darkest">{title}</p>
              <StatusBadge status={status} map={IDENTITY_STATUS_BADGE_MAP} />
            </div>
            <p className="text-xs text-console-mid mt-1">{body}</p>
          </div>
          {status !== "processing" && (
            <Link href="/expert-status">
              <Button size="sm" variant="outline" className="flex-shrink-0" data-testid="button-catalog-go-verify">
                {status === "failed" ? "Retry verification" : "Verify identity"}
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Storefront header (C2 — mockup section 5) ──────────────────────────────

/**
 * The /p/:handle management header. Handle comes from the session-backed cached auth user
 * (/api/auth/user — §14: never client-supplied); the Live count N is derived from the SAME
 * three owner-console queries the offerings table already loads (react-query dedups the
 * keys — no new endpoint), filtered by each lane's PUBLIC read-gate so the chip mirrors
 * exactly what /p/:handle serves (storefront.routes.ts: services approved+active; templates
 * approved+published; Ready Made status approved; 404 at zero — that IS "not live"). §13:
 * no chip renders until the real counts are loaded.
 */
function StorefrontHeader() {
  const { toast } = useToast();
  const { user } = useAuth();
  const handle = (user as any)?.handle as string | null | undefined;

  const services = useQuery<any[]>({ queryKey: ["/api/expert/services"] });
  const templates = useQuery<any[]>({ queryKey: ["/api/expert/templates"] });
  const readyMade = useQuery<{ listings: any[] }>({ queryKey: ["/api/expert/ready-made/mine"] });
  const countsLoaded = !services.isLoading && !templates.isLoading && !readyMade.isLoading;

  const approvedCount =
    (Array.isArray(services.data) ? services.data : []).filter(
      (s: any) => s.approvalStatus === "approved" && s.status === "active",
    ).length +
    (Array.isArray(templates.data) ? templates.data : []).filter(
      (t: any) => t.approvalStatus === "approved" && t.isPublished,
    ).length +
    (readyMade.data?.listings ?? []).filter((r: any) => r.status === "approved").length;

  const isLive = !!handle && countsLoaded && approvedCount > 0;
  const publicPath = handle ? `/p/${handle}` : null;
  const publicUrl = publicPath ? `${window.location.origin}${publicPath}` : null;

  async function copyLink() {
    if (!publicUrl || !publicPath) return;
    // Same tracked short-link rail the share tools use, full-URL fallback on any error.
    const link = await ensureShortLink({ targetType: "storefront" }, publicPath);
    await navigator.clipboard.writeText(link);
    toast({ title: "Link copied", description: link });
  }

  return (
    <Card className="border border-console-light" data-testid="card-storefront-header">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-console-darkest">Your storefront</h2>
            {handle ? (
              <p
                className="text-[12.5px] text-console-mid truncate"
                style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
                data-testid="text-storefront-url"
              >
                {window.location.host}
                {publicPath}
              </p>
            ) : (
              <p className="text-sm text-console-mid" data-testid="text-storefront-no-handle">
                No handle yet —{" "}
                <Link href="/expert/settings">
                  <span className="underline cursor-pointer font-medium" style={{ color: "#E85D55" }} data-testid="link-storefront-claim-handle">
                    Claim your handle in Settings →
                  </span>
                </Link>
              </p>
            )}
          </div>
          {handle && (
            countsLoaded ? (
              isLive ? (
                <Badge
                  className="text-xs border bg-green-100 text-green-800 border-green-200"
                  data-testid="badge-storefront-live"
                >
                  Live · {approvedCount} approved item{approvedCount === 1 ? "" : "s"}
                </Badge>
              ) : (
                <Badge
                  className="text-xs border bg-amber-100 text-amber-800 border-amber-200"
                  data-testid="badge-storefront-not-live"
                >
                  Not live yet — approval pending
                </Badge>
              )
            ) : (
              <Skeleton className="h-5 w-32" />
            )
          )}
          <span className="flex-1" />
          {isLive && publicUrl && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}
                data-testid="button-storefront-preview"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Preview
              </Button>
              <Button size="sm" variant="outline" onClick={copyLink} data-testid="button-storefront-copy-link">
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy link
              </Button>
            </div>
          )}
        </div>

        {/* C2: the storefront caption share tool (moved from Share & Promote) — only when the
            page is actually live; promoting a 404 storefront would be a dead share (§13). */}
        {isLive && handle && (
          <div className="pt-3 border-t border-console-light">
            <p className="text-xs font-medium text-console-mid mb-2">Share your storefront</p>
            <StorefrontShareTools handle={handle} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Availability section ────────────────────────────────────────────────────

function AvailabilitySection() {
  const { toast } = useToast();
  const { data: services, isLoading: servicesLoading } = useQuery<MyService[]>({
    queryKey: ["/api/expert/services"],
  });
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [capacity, setCapacity] = useState("");

  const list = Array.isArray(services) ? services : [];
  const activeServiceId = selectedServiceId || list[0]?.id || "";

  const { data: slots, isLoading: slotsLoading } = useQuery<AvailabilitySlot[]>({
    queryKey: [`/api/me/services/${activeServiceId}/slots`],
    enabled: !!activeServiceId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { date };
      if (startTime.trim()) body.startTime = startTime.trim();
      if (capacity.trim()) body.capacity = Number(capacity);
      const res = await apiRequest("POST", `/api/me/services/${activeServiceId}/slots`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/me/services/${activeServiceId}/slots`] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/next-availability"] });
      toast({ title: "Slot added", description: "Travelers can now book this date." });
      setDate("");
      setStartTime("");
      setCapacity("");
    },
    onError: (err) => {
      toast({
        title: "Could not add slot",
        description: parseApiErrorMessage(err, "Please check the date and try again."),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const res = await apiRequest("DELETE", `/api/me/slots/${slotId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/me/services/${activeServiceId}/slots`] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/next-availability"] });
      toast({ title: "Slot removed" });
    },
    onError: (err) => {
      // 409 booked-slot refusal surfaces here, honestly, as the server wrote it.
      toast({
        title: "Could not remove slot",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  return (
    <section data-testid="section-catalog-availability">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Availability
      </h2>
      <Card className="border border-console-light">
        <CardContent className="p-4 space-y-4">
          {servicesLoading ? (
            <Skeleton className="h-9 w-64" />
          ) : list.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No services yet"
              body="Create a service first, then publish dates travelers can book."
              testId="empty-catalog-no-services"
            />
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Label htmlFor="catalog-service-picker" className="text-sm text-console-mid whitespace-nowrap">
                  Service
                </Label>
                <Select value={activeServiceId} onValueChange={setSelectedServiceId}>
                  <SelectTrigger id="catalog-service-picker" className="w-64" data-testid="select-catalog-service">
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.serviceName ?? s.title ?? "Untitled service"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const current = list.find((s) => s.id === activeServiceId);
                  return current?.approvalStatus ? <StatusBadge status={current.approvalStatus} /> : null;
                })()}
              </div>

              {slotsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !slots || slots.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="No availability published yet"
                  body="Travelers can't pick a time until you add slots."
                  testId="empty-catalog-no-slots"
                />
              ) : (
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-console-light p-3"
                      data-testid={`catalog-slot-${slot.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-console-darkest">
                          {formatSlotDate(slot.date)}
                          {slot.startTime && <span className="text-console-mid"> · {slot.startTime}</span>}
                        </p>
                        <p className="text-xs text-console-mid">
                          {(slot.bookedCount ?? 0)} / {slot.capacity ?? 1} booked
                          {slot.status ? ` · ${slot.status}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 flex-shrink-0"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(slot.id)}
                        data-testid={`button-delete-slot-${slot.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <form
                className="flex items-end gap-2 flex-wrap pt-2 border-t border-console-light"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!date || !activeServiceId) return;
                  createMutation.mutate();
                }}
              >
                <div>
                  <Label htmlFor="catalog-slot-date" className="text-xs text-console-mid">Date</Label>
                  <Input
                    id="catalog-slot-date"
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    data-testid="input-slot-date"
                  />
                </div>
                <div>
                  <Label htmlFor="catalog-slot-time" className="text-xs text-console-mid">Start time (optional)</Label>
                  <Input
                    id="catalog-slot-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    data-testid="input-slot-start-time"
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor="catalog-slot-capacity" className="text-xs text-console-mid">Capacity</Label>
                  <Input
                    id="catalog-slot-capacity"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="1"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    data-testid="input-slot-capacity"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="gap-1.5"
                  disabled={createMutation.isPending || !date || !activeServiceId}
                  data-testid="button-add-slot"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add slot
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
// C2: the StoreListingsQuickBlock was REMOVED — it linked to /expert/ready-made, which the
// C1 retirement turned into a redirect straight back to /expert/catalog (a navigation loop).
// Ready Made rows in the offerings table now open their source build in the Workstation.

export default function ExpertCatalog() {
  return (
    <ExpertLayout title="Catalog">
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <PageHeader
          title="Catalog"
          subtitle="Everything you sell, in one place"
          icon={LayoutGrid}
          testId="text-catalog-title"
          actions={
            // The retired /expert/services page's create entry, preserved (the /new + /:id/edit
            // ServiceForm routes are untouched — only the list page redirects here).
            <Link href="/expert/services/new">
              <Button className="bg-primary" data-testid="button-catalog-new-service">
                <Plus className="w-4 h-4 mr-2" /> New Service
              </Button>
            </Link>
          }
        />

        <VerificationStatusBanner />

        <StorefrontHeader />

        <section data-testid="section-catalog-offerings">
          <MyOfferingsTable />
        </section>

        <AvailabilitySection />

        {/* C2: Share & Promote's opportunity-scoped creation half (review share cards +
            open-slot promos) — real rows only (§13). */}
        <section data-testid="section-catalog-promote">
          <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
            Promote
          </h2>
          <PostingOpportunitiesCard />
        </section>
      </div>
    </ExpertLayout>
  );
}
