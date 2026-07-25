/**
 * ready-made-listing-panel.tsx — the authoring-mode listing editor (Ready-Made Phase 2).
 *
 * Lives in the Expert Workspace's right panel and is rendered ONLY when the workspace is in
 * `authoring` mode (the server tells the client the mode — see GET /api/expert/workspace-context).
 * It edits the `ready_made_trips` row that sits beside the authoring trip: what the listing is
 * called, how long it runs, when it's best, what it costs, and the hero photo that sells it.
 *
 * Rules this surface upholds (all enforced server-side too — this is the honest UI of them):
 *  • The hero can only come from the Unsplash picker (D2 "Unsplash proves the photo"), and the
 *    photographer credit travels with it. There is deliberately no "paste an image URL" input.
 *  • The author's take is READ from the fee band, never computed in the client (§8) — if the band
 *    is unavailable we say so rather than showing an invented split (§13).
 *  • Approval is not self-service: status is displayed, never edited here (D1a). Changing a
 *    headline claim on an approved listing sends it back for re-review, and we say so out loud.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, ImageIcon, Loader2, Search, Send, X } from "lucide-react";
import { READY_MADE_PLAN_TYPES } from "@shared/ready-made-plan-types";

// Same neutral scale as the workspace right rail this panel is rendered inside
// (client/src/pages/expert/workspace.tsx) so it doesn't read as a foreign element. The primary
// action uses the darkest neutral rather than introducing a second accent colour.
const G: Record<number, string> = {
  50: "#F9FAFB", 200: "#E5E7EB", 300: "#D1D5DB", 400: "#9CA3AF",
  500: "#6B7280", 600: "#4B5563", 700: "#374151", 900: "#111827",
};
const P = G[900];

export interface ReadyMadeListing {
  id: string;
  title: string;
  market: string;
  durationDays: number;
  planType: string | null;
  bestSeason: string | null;
  pricingMode: "fixed" | "per_traveler";
  priceCents: number | null;
  heroImageUrl: string | null;
  heroImageMeta: { photographer?: string; profileUrl?: string } | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  rejectionReason: string | null;
  buildReview?: {
    score: number;
    issues: Array<{ type: string; severity: string; message: string }>;
    suggestions: Array<{ type: string; message: string }>;
    reviewedAt: string;
  } | null;
}

interface EarningsPreview {
  available: boolean;
  reason?: string;
  platformFeeRate?: number;
  expertShareRate?: number;
  priceCents?: number | null;
  platformFeeCents?: number | null;
  expertEarningsCents?: number | null;
}

interface HeroResult {
  url: string;
  thumbnailUrl: string;
  description: string | null;
  meta: Record<string, unknown>;
}

const STATUS_COPY: Record<ReadyMadeListing["status"], { label: string; bg: string; fg: string; note: string }> = {
  draft: { label: "Draft", bg: "#F5F5F0", fg: G[600], note: "Only you can see this. Submit it for review when the build is ready." },
  submitted: { label: "In review", bg: "#FFFBEB", fg: "#B45309", note: "Our team is reviewing this listing. You can keep editing — material changes restart the review." },
  approved: { label: "Approved", bg: "#F0FDF4", fg: "#15803D", note: "Live for travelers. Changing the title, length, price or photo sends it back for re-review." },
  rejected: { label: "Needs changes", bg: "#FEF2F2", fg: "#991B1B", note: "Address the reviewer's note, then resubmit." },
};

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "—" : `$${(cents / 100).toFixed(2)}`;

const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: G[400], letterSpacing: "0.08em",
  textTransform: "uppercase", marginBottom: 5, display: "block",
};
const field: React.CSSProperties = {
  width: "100%", padding: "7px 9px", borderRadius: 8, border: `1.5px solid ${G[200]}`,
  fontSize: 12.5, outline: "none", boxSizing: "border-box", background: "white", fontFamily: "inherit",
};

export default function ReadyMadeListingPanel({
  listing, tripId,
}: {
  listing: ReadyMadeListing;
  tripId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState({
    title: listing.title,
    planType: listing.planType ?? "",
    bestSeason: listing.bestSeason ?? "",
    durationDays: String(listing.durationDays),
    pricingMode: listing.pricingMode,
    // Dollars in the input, cents on the wire — the server is the only place a price is a number.
    price: listing.priceCents === null ? "" : (listing.priceCents / 100).toFixed(2),
  });
  const [heroOpen, setHeroOpen] = useState(false);
  const [heroQuery, setHeroQuery] = useState(listing.market);
  const [heroSubmitted, setHeroSubmitted] = useState("");

  const { data: earnings, isLoading: earningsLoading } = useQuery<EarningsPreview>({
    queryKey: [`/api/expert/ready-made/${listing.id}/earnings-preview`],
  });

  const { data: heroResults, isFetching: heroFetching } = useQuery<{ ready: boolean; reason?: string; results: HeroResult[] }>({
    queryKey: ["/api/expert/ready-made/hero-search", heroSubmitted],
    queryFn: async () => {
      const res = await fetch(`/api/expert/ready-made/hero-search?q=${encodeURIComponent(heroSubmitted)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Hero search failed");
      return res.json();
    },
    enabled: heroOpen && heroSubmitted.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await fetch(`/api/expert/ready-made/${listing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Could not save the listing");
      return body as { listing: ReadyMadeListing; reReviewRequired: boolean };
    },
    onSuccess: (body) => {
      qc.invalidateQueries({ queryKey: [`/api/expert/workspace-context/${tripId}`] });
      qc.invalidateQueries({ queryKey: [`/api/expert/ready-made/${listing.id}/earnings-preview`] });
      toast(
        body.reReviewRequired
          ? { title: "Saved — back in review", description: "That change affects what a buyer sees, so the listing re-enters the approval queue." }
          : { title: "Listing saved" },
      );
    },
    onError: (e: Error) => toast({ title: "Not saved", description: e.message, variant: "destructive" }),
  });

  const saveDetails = () => {
    const patch: Record<string, unknown> = {
      title: draft.title.trim(),
      planType: draft.planType === "" ? null : draft.planType,
      bestSeason: draft.bestSeason.trim() === "" ? null : draft.bestSeason.trim(),
      pricingMode: draft.pricingMode,
    };
    const days = Number(draft.durationDays);
    if (Number.isFinite(days) && days >= 1) patch.durationDays = Math.trunc(days);
    if (draft.price.trim() === "") {
      patch.priceCents = null;
    } else {
      const dollars = Number(draft.price);
      if (!Number.isFinite(dollars)) {
        toast({ title: "Price isn't a number", variant: "destructive" });
        return;
      }
      patch.priceCents = Math.round(dollars * 100);
    }
    save.mutate(patch);
  };

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/expert/ready-made/${listing.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(body.missing)
          ? body.missing.map((m: { message: string }) => m.message).join(" · ")
          : body.message;
        throw new Error(detail ?? "Could not submit the listing");
      }
      return body as { listing: ReadyMadeListing };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/expert/workspace-context/${tripId}`] });
      toast({ title: "Submitted for review", description: "It goes live in the store once an admin approves it." });
    },
    onError: (e: Error) => toast({ title: "Not ready to submit", description: e.message, variant: "destructive" }),
  });

  const buildReview = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/expert/ready-made/${listing.id}/build-review`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Review failed");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/expert/workspace-context/${tripId}`] });
      toast({ title: "Build review complete", description: "Advisory only — you can still submit whenever you're ready." });
    },
    onError: (e: Error) => toast({ title: "Review failed", description: e.message, variant: "destructive" }),
  });

  const status = STATUS_COPY[listing.status];
  const dirty =
    draft.title !== listing.title ||
    draft.planType !== (listing.planType ?? "") ||
    draft.bestSeason !== (listing.bestSeason ?? "") ||
    draft.durationDays !== String(listing.durationDays) ||
    draft.pricingMode !== listing.pricingMode ||
    draft.price !== (listing.priceCents === null ? "" : (listing.priceCents / 100).toFixed(2));

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }} data-testid="panel-ready-made-listing">
      {/* Status — displayed, never editable here (approval is not self-service, D1a). */}
      <div style={{ background: status.bg, borderRadius: 10, padding: "9px 11px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <span data-testid="text-listing-status" style={{ fontSize: 11, fontWeight: 800, color: status.fg, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {status.label}
          </span>
        </div>
        <div style={{ fontSize: 11, color: status.fg, lineHeight: 1.5 }}>{status.note}</div>
        {listing.status === "rejected" && listing.rejectionReason && (
          <div data-testid="text-listing-rejection" style={{ marginTop: 6, fontSize: 11, color: "#991B1B", background: "white", border: "1px solid #FCA5A5", borderRadius: 7, padding: "6px 8px" }}>
            {listing.rejectionReason}
          </div>
        )}
      </div>

      {/* Hero — picker only. No free-text URL field: the provenance rule is the UI, not a hint. */}
      <div style={{ marginBottom: 16 }}>
        <span style={label}>Cover photo</span>
        {listing.heroImageUrl ? (
          <div>
            <img
              src={listing.heroImageUrl}
              alt={draft.title}
              data-testid="img-listing-hero"
              style={{ width: "100%", height: 118, objectFit: "cover", borderRadius: 10, display: "block", border: `1px solid ${G[200]}` }}
            />
            {listing.heroImageMeta?.photographer && (
              <div style={{ fontSize: 10, color: G[400], marginTop: 4 }}>
                Photo by{" "}
                <a href={listing.heroImageMeta.profileUrl} target="_blank" rel="noreferrer" style={{ color: G[500], textDecoration: "underline" }}>
                  {listing.heroImageMeta.photographer}
                </a>{" "}
                on Unsplash
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
              <button onClick={() => { setHeroOpen(true); setHeroSubmitted(heroQuery); }} data-testid="button-change-hero" style={{ flex: 1, padding: "6px", borderRadius: 8, border: `1px solid ${G[200]}`, background: "white", fontSize: 11.5, fontWeight: 600, color: G[700], cursor: "pointer" }}>
                Change photo
              </button>
              <button
                onClick={() => save.mutate({ heroImageUrl: null })}
                data-testid="button-remove-hero"
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${G[200]}`, background: "white", fontSize: 11.5, color: G[500], cursor: "pointer" }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setHeroOpen(true); setHeroSubmitted(heroQuery); }}
            data-testid="button-choose-hero"
            style={{ width: "100%", padding: "18px 12px", borderRadius: 10, border: `1.5px dashed ${G[300]}`, background: G[50], cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: G[500] }}
          >
            <ImageIcon style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Choose a cover photo</span>
            <span style={{ fontSize: 10.5, color: G[400] }}>From Unsplash — the credit is added for you</span>
          </button>
        )}
      </div>

      {/* Details */}
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 14 }}>
        <div>
          <span style={label}>Listing title</span>
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            data-testid="input-listing-title"
            placeholder="Three slow days in Higashiyama"
            style={field}
          />
        </div>
        <div>
          <span style={label}>Type of plan</span>
          <select
            value={draft.planType}
            onChange={(e) => setDraft((d) => ({ ...d, planType: e.target.value }))}
            data-testid="select-listing-plan-type"
            style={{ ...field, cursor: "pointer", color: draft.planType === "" ? G[400] : undefined }}
          >
            <option value="">Choose a plan type…</option>
            {READY_MADE_PLAN_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <span style={label}>Days</span>
            <input
              value={draft.durationDays}
              onChange={(e) => setDraft((d) => ({ ...d, durationDays: e.target.value }))}
              data-testid="input-listing-duration"
              inputMode="numeric"
              style={field}
            />
          </div>
          <div>
            <span style={label}>Best season</span>
            <input
              value={draft.bestSeason}
              onChange={(e) => setDraft((d) => ({ ...d, bestSeason: e.target.value }))}
              data-testid="input-listing-season"
              placeholder="Autumn"
              style={field}
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <span style={label}>Price (USD)</span>
            <input
              value={draft.price}
              onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
              data-testid="input-listing-price"
              placeholder="49.00"
              inputMode="decimal"
              style={field}
            />
          </div>
          <div>
            <span style={label}>Charged</span>
            <select
              value={draft.pricingMode}
              onChange={(e) => setDraft((d) => ({ ...d, pricingMode: e.target.value as "fixed" | "per_traveler" }))}
              data-testid="select-listing-pricing-mode"
              style={{ ...field, cursor: "pointer" }}
            >
              <option value="fixed">Per trip</option>
              <option value="per_traveler">Per traveler</option>
            </select>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: G[400] }}>Market: {listing.market}</div>
        <button
          onClick={saveDetails}
          disabled={!dirty || save.isPending}
          data-testid="button-save-listing"
          style={{
            padding: "8px", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700,
            background: dirty && !save.isPending ? P : G[200],
            color: dirty && !save.isPending ? "white" : G[400],
            cursor: dirty && !save.isPending ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {save.isPending && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
          {dirty ? "Save listing details" : "Saved"}
        </button>
      </div>

      {/* Submit for review — the push into the store. Only offered from draft / needs-changes;
          the SERVER is the authority on readiness (plan type, hero, price, no empty days) and
          names exactly what's missing, so this button is honest even when incomplete. */}
      {(listing.status === "draft" || listing.status === "rejected") && (
        <div style={{ borderTop: `1px solid ${G[200]}`, paddingTop: 12, marginBottom: 14 }}>
          <span style={label}>{listing.status === "rejected" ? "Resubmit" : "Publish to the store"}</span>
          <div style={{ fontSize: 11, color: G[500], lineHeight: 1.5, marginBottom: 8 }}>
            Needs a plan type, a cover photo, a price, and no empty days. An admin reviews it before it
            appears in Ready Made Trips.
          </div>
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || dirty}
            data-testid="button-submit-listing"
            title={dirty ? "Save your listing details first" : undefined}
            style={{
              width: "100%", padding: "8px", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700,
              background: !dirty && !submit.isPending ? "#15803D" : G[200],
              color: !dirty && !submit.isPending ? "white" : G[400],
              cursor: !dirty && !submit.isPending ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {submit.isPending ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Send style={{ width: 12, height: 12 }} />}
            {listing.status === "rejected" ? "Resubmit for review" : "Submit for review"}
          </button>
        </div>
      )}

      {/* AI Build Review — the optimizer's analysis engine applied to this build (advisory only;
          it NEVER gates submit). Same code as the paid AI optimization, different application. */}
      <div style={{ borderTop: `1px solid ${G[200]}`, paddingTop: 12, marginBottom: 14 }}>
        <span style={label}>AI build review</span>
        <div style={{ fontSize: 11, color: G[500], lineHeight: 1.5, marginBottom: 8 }}>
          Runs the trip optimizer over your build — overloaded days, travel time, meal gaps, pacing.
          Advisory only; it never blocks submitting.
        </div>
        <button
          onClick={() => buildReview.mutate()}
          disabled={buildReview.isPending}
          data-testid="button-build-review"
          style={{ width: "100%", padding: "7px", borderRadius: 8, border: `1px solid ${G[200]}`, background: "white", fontSize: 12, fontWeight: 600, color: G[600], cursor: "pointer" }}
        >
          {buildReview.isPending ? "Reviewing…" : listing.buildReview ? "Re-run review" : "Review my build"}
        </button>
        {listing.buildReview && (
          <div style={{ marginTop: 8, background: G[50], borderRadius: 9, padding: "9px 11px" }} data-testid="build-review-result">
            <div style={{ fontSize: 13, fontWeight: 800, color: listing.buildReview.score >= 80 ? "#15803D" : listing.buildReview.score >= 60 ? "#B45309" : "#991B1B" }}>
              Score: {listing.buildReview.score}/100
            </div>
            {listing.buildReview.issues.length === 0 && listing.buildReview.suggestions.length === 0 && (
              <div style={{ fontSize: 11, color: G[500], marginTop: 4 }}>No issues found.</div>
            )}
            {listing.buildReview.issues.map((i, idx) => (
              <div key={idx} style={{ fontSize: 11, color: i.severity === "high" ? "#991B1B" : "#B45309", marginTop: 4 }}>• {i.message}</div>
            ))}
            {listing.buildReview.suggestions.map((sg, idx) => (
              <div key={idx} style={{ fontSize: 11, color: G[600], marginTop: 4 }}>◦ {sg.message}</div>
            ))}
          </div>
        )}
      </div>

      {/* Factory wire B: hand this build to Content Studio as a prefilled social-post draft. */}
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={() => {
            const params = new URLSearchParams({
              prefill: "1",
              title: listing.title,
              destination: listing.market,
              type: "itinerary",
            });
            window.location.assign(`/expert/content-studio?${params.toString()}`);
          }}
          data-testid="button-create-social-post"
          style={{
            width: "100%", padding: "7px", borderRadius: 8, border: `1px solid ${G[200]}`,
            background: "white", fontSize: 12, fontWeight: 600, color: G[600], cursor: "pointer",
          }}
        >
          Create social post from this trip
        </button>
      </div>

      {/* Author's take — resolved from the fee band, never computed here (§8). */}
      <div style={{ borderTop: `1px solid ${G[200]}`, paddingTop: 12 }}>
        <span style={label}>Your share</span>
        {earningsLoading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : !earnings?.available ? (
          <div data-testid="text-earnings-unavailable" style={{ fontSize: 11.5, color: G[500], background: G[50], borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
            The revenue split isn't configured yet, so we can't show your share. Nothing is wrong with your
            listing — an admin needs to activate the Ready-Made Trip fee band.
          </div>
        ) : (
          <div style={{ background: G[50], borderRadius: 9, padding: "9px 11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: G[600], marginBottom: 4 }}>
              <span>Traveler pays</span>
              <span data-testid="text-earnings-price" style={{ fontWeight: 600, color: G[900] }}>{money(earnings.priceCents)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: G[600], marginBottom: 4 }}>
              <span>Platform fee ({Math.round((earnings.platformFeeRate ?? 0) * 100)}%)</span>
              <span data-testid="text-earnings-fee">−{money(earnings.platformFeeCents)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800, color: G[900], borderTop: `1px solid ${G[200]}`, paddingTop: 5 }}>
              <span>You keep</span>
              <span data-testid="text-earnings-expert">{money(earnings.expertEarningsCents)}</span>
            </div>
            {earnings.priceCents === null && (
              <div style={{ fontSize: 10.5, color: G[400], marginTop: 5 }}>Set a price to see the amounts.</div>
            )}
            {listing.pricingMode === "per_traveler" && (
              <div style={{ fontSize: 10.5, color: G[400], marginTop: 5 }}>Per traveler — a party of four pays four times this.</div>
            )}
          </div>
        )}
      </div>

      {/* ── Unsplash picker ── */}
      {heroOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(26,26,24,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setHeroOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="modal-hero-picker"
            style={{ background: "white", borderRadius: 14, width: "min(620px, 100%)", maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${G[200]}`, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: G[900], flex: 1 }}>Choose a cover photo</span>
              <button onClick={() => setHeroOpen(false)} data-testid="button-close-hero-picker" style={{ background: "none", border: "none", cursor: "pointer", color: G[400], display: "flex" }}>
                <X style={{ width: 17, height: 17 }} />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); setHeroSubmitted(heroQuery); }}
              style={{ padding: "10px 14px", display: "flex", gap: 7, borderBottom: `1px solid ${G[200]}` }}
            >
              <input
                value={heroQuery}
                onChange={(e) => setHeroQuery(e.target.value)}
                data-testid="input-hero-search"
                placeholder="kyoto autumn temple"
                style={{ ...field, flex: 1 }}
              />
              <button type="submit" data-testid="button-hero-search" style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: P, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <Search style={{ width: 12, height: 12 }} /> Search
              </button>
            </form>
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {heroFetching ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
                </div>
              ) : heroResults?.ready === false ? (
                // Honest unavailability — an empty grid would read as "no photos match" (§13).
                <div data-testid="text-hero-unavailable" style={{ fontSize: 12.5, color: G[500], lineHeight: 1.55, textAlign: "center", padding: "20px 10px" }}>
                  Photo search isn't connected yet. Ask an admin to configure the Unsplash key — until then a
                  cover photo can't be chosen here, and we won't let you paste one from elsewhere.
                </div>
              ) : (heroResults?.results ?? []).length === 0 ? (
                <div style={{ fontSize: 12.5, color: G[500], textAlign: "center", padding: "20px 10px" }}>
                  No photos matched “{heroSubmitted}”. Try a different search.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {(heroResults?.results ?? []).map((r) => (
                    <button
                      key={r.url}
                      data-testid="button-hero-option"
                      onClick={() => {
                        save.mutate({ heroImageUrl: r.url, heroImageMeta: r.meta });
                        setHeroOpen(false);
                      }}
                      style={{ padding: 0, border: `1px solid ${G[200]}`, borderRadius: 9, overflow: "hidden", cursor: "pointer", background: "white", position: "relative" }}
                    >
                      <img src={r.thumbnailUrl} alt={r.description ?? ""} style={{ width: "100%", height: 86, objectFit: "cover", display: "block" }} />
                      {listing.heroImageUrl === r.url && (
                        <div style={{ position: "absolute", top: 5, right: 5, background: "#16A34A", borderRadius: 99, width: 17, height: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Check style={{ width: 11, height: 11, color: "white" }} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
