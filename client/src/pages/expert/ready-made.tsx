/**
 * /expert/ready-made — Store Listings: the seller console of the workstation→store pipeline.
 *
 * Decision-maker model (2026-07-25): "Ready Made Trips" is the ONE commerce store where Local
 * Experts and Trip Advisors sell their content; the Workstation is the factory; "Trips by Locals"
 * is a consumer shelf section inside the store (Local Expert content vs Advisor content), not a
 * product or a console name. This page is the seller's view of that pipeline: start a new store
 * listing (creates the authoring trip + draft listing and opens the workspace builder) and track
 * each listing's approval state on its way to the shelf.
 *
 * `expert_templates` (/expert/templates) is the older store-itinerary console being folded into
 * this one factory — its existing stock keeps selling until the migration decision lands.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Loader2, Map as MapIcon, Plus } from "lucide-react";
import type { ReadyMadeListing } from "@/components/expert/ready-made-listing-panel";
import { STORE_GATE_MESSAGE } from "@shared/launch-markets";
import { planTypeLabel } from "@shared/ready-made-plan-types";
import { EmptyState } from "@/components/backoffice/primitives";

// Console palette (two-palettes decision — warm back-office greys, see index.css .console-scope).
const G: Record<number, string> = {
  50: "#FAFAF8", 100: "#F3F3EE", 200: "#E8E8E2", 400: "#A8A8A0",
  500: "#7A7A72", 600: "#5C5C55", 700: "#45453F", 900: "#1A1A18",
};

type ListingRow = ReadyMadeListing & { sourceTripId: string; updatedAt: string | null };

const STATUS_STYLE: Record<ReadyMadeListing["status"], { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "#F3F4F6", fg: G[600] },
  submitted: { label: "In review", bg: "#FFFBEB", fg: "#B45309" },
  approved: { label: "Approved", bg: "#F0FDF4", fg: "#15803D" },
  rejected: { label: "Needs changes", bg: "#FEF2F2", fg: "#991B1B" },
};

export default function ExpertReadyMade() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ listings: ListingRow[] }>({
    queryKey: ["/api/expert/ready-made/mine"],
  });
  const listings = data?.listings ?? [];

  const { data: expertRoleData } = useQuery<{ role: string; roleLabel: string | null; applicationStatus: string | null }>({
    queryKey: ["/api/expert/role"],
  });
  const isEventPlanner = expertRoleData?.role === "event_planner";

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/expert/ready-made", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        // Title/market/duration are placeholders the author renames in the listing panel; the
        // server owns the defaults (and the Kyoto launch scope) — we don't dictate them here.
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Could not start a new ready-made trip");
      return body as { tripId: string; redirect: string };
    },
    onSuccess: (body) => {
      qc.invalidateQueries({ queryKey: ["/api/expert/ready-made/mine"] });
      setLocation(body.redirect);
    },
    onError: (e: Error) => toast({ title: "Not started", description: e.message, variant: "destructive" }),
  });

  // ExpertLayout wrap (design-audit fix 3): this page previously rendered a bare <main> with
  // no sidebar/topbar — clicking "Store Listings" dropped the user out of the console chrome.
  return (
    <ExpertLayout title="Store Listings">
    <div style={{ padding: "32px 24px", maxWidth: 860, margin: "0 auto", fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 6 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <MapIcon style={{ width: 22, height: 22, color: G[900] }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: G[900], margin: 0 }}>Store Listings</h1>
          </div>
          <div style={{ fontSize: 13.5, color: G[500], marginTop: 6, maxWidth: 520, lineHeight: 1.5 }}>
            Build a complete trip once, then sell it in the Ready Made Trips store as many times as you
            like. A buyer gets their own editable copy — you keep authoring the original.
          </div>
        </div>
        {!isEventPlanner && (
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            data-testid="button-new-ready-made"
            style={{
              flexShrink: 0, padding: "9px 15px", borderRadius: 9, border: "none", background: G[900],
              color: "white", fontSize: 13, fontWeight: 700, cursor: create.isPending ? "wait" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {create.isPending ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Plus style={{ width: 14, height: 14 }} />}
            New store listing
          </button>
        )}
      </div>

      {/* A5/F8: explicit gate, not a silently missing button — the server 403s with the same
          message (shared/launch-markets.ts STORE_GATE_MESSAGE). */}
      {isEventPlanner && (
        <div
          data-testid="notice-store-gate"
          style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 10, background: G[100],
            border: `1px solid ${G[200]}`, fontSize: 13, color: G[600], lineHeight: 1.5,
          }}
        >
          {STORE_GATE_MESSAGE}
        </div>
      )}

      <div style={{ marginTop: 26 }}>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : listings.length === 0 ? (
          <EmptyState
            testId="empty-ready-made"
            icon={MapIcon}
            title="No store listings yet"
            body="Start one and the builder opens with an empty itinerary. Add days and places, choose a plan type, set a price, pick a cover photo, then submit it for review."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {listings.map((l) => {
              const s = STATUS_STYLE[l.status];
              return (
                <button
                  key={l.id}
                  onClick={() => setLocation(`/expert/workspace/${l.sourceTripId}`)}
                  data-testid={`card-ready-made-${l.id}`}
                  style={{
                    textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 13,
                    padding: 12, borderRadius: 13, border: `1px solid ${G[200]}`, background: "white",
                  }}
                >
                  {l.heroImageUrl ? (
                    <img src={l.heroImageUrl} alt="" style={{ width: 78, height: 58, objectFit: "cover", borderRadius: 9, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 78, height: 58, borderRadius: 9, background: G[50], border: `1px dashed ${G[200]}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: G[400] }}>
                      No photo
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: G[900], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.title}
                    </div>
                    <div style={{ fontSize: 12, color: G[500], marginTop: 3 }}>
                      {planTypeLabel(l.planType) ?? "No plan type yet"} · {l.market} · {l.durationDays} days
                      {/* Honest empty state: an unpriced listing shows "No price yet", never $0. */}
                      {" · "}
                      {l.priceCents === null ? "No price yet" : `$${(l.priceCents / 100).toFixed(2)}${l.pricingMode === "per_traveler" ? " / traveler" : ""}`}
                    </div>
                  </div>
                  <span
                    data-testid={`status-ready-made-${l.id}`}
                    style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 99, background: s.bg, color: s.fg, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}
                  >
                    {s.label}
                  </span>
                  {/* Preview-as-buyer: the exact redacted page a buyer sees (server flags preview). */}
                  <span
                    onClick={(e) => { e.stopPropagation(); setLocation(`/ready-made/${l.id}`); }}
                    data-testid={`preview-ready-made-${l.id}`}
                    style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 99, border: `1px solid ${G[200]}`, color: G[500], fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}
                  >
                    Preview
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </ExpertLayout>
  );
}
