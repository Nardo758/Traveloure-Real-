/**
 * /expert/ready-made — the author's console for Trips by Locals (Ready-Made Phase 2).
 *
 * This is the ENTRY POINT for the authoring lane: start a new ready-made trip (which creates the
 * authoring trip + its draft listing and drops you into the workspace builder), and see the ones
 * you've already started with their approval state.
 *
 * Deliberately separate from /expert/templates, which is the `expert_templates` GUIDES lane
 * (view-only knowledge products, jsonb itineraries, no clone) — spec v3 §0a. Same words, different
 * product; do not merge them.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Map as MapIcon, Plus } from "lucide-react";
import type { ReadyMadeListing } from "@/components/expert/ready-made-listing-panel";

const G: Record<number, string> = {
  50: "#F9FAFB", 200: "#E5E7EB", 400: "#9CA3AF",
  500: "#6B7280", 600: "#4B5563", 700: "#374151", 900: "#111827",
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

  return (
    <main style={{ padding: "32px 24px", maxWidth: 860, margin: "0 auto", fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 6 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <MapIcon style={{ width: 22, height: 22, color: G[900] }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: G[900], margin: 0 }}>Trips by Locals</h1>
          </div>
          <div style={{ fontSize: 13.5, color: G[500], marginTop: 6, maxWidth: 520, lineHeight: 1.5 }}>
            Build a complete trip once, then sell it as many times as you like. A buyer gets their own
            editable copy — you keep authoring the original.
          </div>
        </div>
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
          New ready-made trip
        </button>
      </div>

      <div style={{ marginTop: 26 }}>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : listings.length === 0 ? (
          <div
            data-testid="empty-ready-made"
            style={{ border: `1.5px dashed ${G[200]}`, borderRadius: 14, padding: "34px 22px", textAlign: "center", background: G[50] }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: G[900], marginBottom: 6 }}>No ready-made trips yet</div>
            <div style={{ fontSize: 13, color: G[500], lineHeight: 1.55, maxWidth: 400, margin: "0 auto" }}>
              Start one and the builder opens with an empty itinerary. Add days and places, set a price,
              pick a cover photo, then submit it for review.
            </div>
          </div>
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
                      {l.market} · {l.durationDays} days
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
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
