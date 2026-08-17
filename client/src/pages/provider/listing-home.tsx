/**
 * Listing Home — the page a provider lands on after saving a service.
 * Shows the draft state, a checklist of what's left, listing settings,
 * and the submit-for-review action.
 *
 * Route: /provider/services/:id  (before /:id/edit so it matches first)
 * Faithful to the ListingHome mockup (provider-console/ListingHome.tsx).
 */
import { useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isPlaceAnchored } from "@shared/service-fundamentals";
import { DollarSign, CalendarDays, ImageIcon } from "lucide-react";

// ── colours (console design tokens) ──────────────────────────────────────────
const INK  = "#1A1A18";
const MUTED = "#7A7A72";
const HAIR  = "#E8E8E2";
const GROUND = "#FAFAF8";
const ACCENT = "#35605A";
const SOFT  = "#EDF2F1";
const WARN_BG   = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK  = "#6B551F";

// ── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "saved just now";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 90)     return "saved a moment ago";
  if (diff < 3600)   return `saved ${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400)  return `saved ${Math.floor(diff / 3600)} hours ago`;
  return `saved on ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function fmtMethod(m: string | null | undefined): string {
  if (!m) return "";
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── service shape returned by GET /api/provider/services/:id ─────────────────
interface ServiceDetail {
  id: string;
  serviceName: string | null;
  description: string | null;
  shortDescription: string | null;
  deliveryMethod: string | null;
  productShape: string | null;
  price: string | number | null;
  categoryId: number | null;
  approvalStatus: string | null;
  status: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  locationPrecision: string | null;
  imageUrl: string | null;
  availability: unknown[] | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  routePoints?: { id: string; name: string; latitude: string | null; longitude: string | null }[];
}

// Attestations endpoint shape
interface AttestationItem {
  key: string;
  affirmed: boolean;
  affirmedAt: string | null;
}
interface AttestationsShape {
  applicable: AttestationItem[];
  affirmedOther: { key: string; affirmedAt: string }[];
}

// ── checklist item ────────────────────────────────────────────────────────────
interface CheckItem {
  key: string;
  label: string;
  desc: React.ReactNode;
  done: boolean;
  /** Right-aligned action label shown on pending rows */
  actionLabel?: string;
  href?: string;
}

function deriveChecklist(
  s: ServiceDetail,
  attestations: AttestationsShape | null | undefined,
): CheckItem[] {
  const editHref      = `/provider/services/${s.id}/edit`;
  const logisticsHref = `${editHref}?step=logistics`;
  const basicsHref    = `${editHref}?step=basics`;
  const availHref     = `/provider/services?availability=${encodeURIComponent(s.id)}`;
  const photosHref    = `${editHref}?step=photos`;

  const isInPerson = isPlaceAnchored({ deliveryMethod: s.deliveryMethod, productShape: s.productShape });

  // 1 — Cover photo
  const hasCoverPhoto = !!(s.imageUrl);
  const items: CheckItem[] = [
    {
      key: "photo",
      label: "Add a cover photo",
      desc: "Listings without one get far fewer opens. One good photo is enough to start.",
      done: hasCoverPhoto,
      actionLabel: "Open photos →",
      href: photosHref,
    },
  ];

  // 2 — Confirm where it happens (in-person / hybrid only)
  if (isInPerson) {
    const pinConfirmed = !!(s.latitude != null && s.longitude != null);
    items.push({
      key: "location",
      label: "Confirm where it happens",
      desc: (
        <>
          Your address is typed, but the pin is not confirmed yet — an address alone is not a location.
          This row opens the flow&apos;s <strong style={{ color: INK }}>step 4, Logistics</strong>,
          where the map now lives.
        </>
      ),
      done: pinConfirmed,
      actionLabel: "Open Logistics →",
      href: logisticsHref,
    });
  }

  // 3 — Safety basics (attestations, in-person / hybrid only)
  if (isInPerson) {
    const allAffirmed =
      attestations != null &&
      attestations.applicable.length > 0 &&
      attestations.applicable.every((a) => a.affirmed);
    items.push({
      key: "attestations",
      label: "Confirm the safety basics",
      desc: "Liability cover and the in-person conduct standards, on the Scheduling step.",
      done: allAffirmed,
      actionLabel: "Open Scheduling →",
      href: `${editHref}?step=scheduling`,
    });
  }

  // 4 — Publish some availability
  const hasAvailability = Array.isArray(s.availability) && s.availability.length > 0;
  items.push({
    key: "availability",
    label: "Publish some availability",
    desc: "Nothing else in the flow makes this bookable — a listing with no slots can be approved and still sell nothing.",
    done: hasAvailability,
    actionLabel: "Open Availability →",
    href: availHref,
  });

  // 5 — Expand the description
  const descLen = s.description?.length ?? 0;
  const TARGET = 140;
  const descDone = descLen >= TARGET;
  items.push({
    key: "description",
    label: "Expand the description",
    desc: descDone
      ? `${descLen} characters — enough detail for review.`
      : `A one-liner is enough to save a draft, not to sell. ${descLen} of ${TARGET} characters so far.`,
    done: descDone,
    actionLabel: "Open Basics →",
    href: basicsHref,
  });

  return items;
}

// ── status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string | null }) {
  if (status === "approved" || status === "active") {
    return (
      <span
        style={{
          display: "inline-block", fontSize: 11.5, padding: "3px 9px",
          borderRadius: 100, border: `1px solid #BFD5D0`,
          background: SOFT, color: ACCENT,
        }}
      >
        Live
      </span>
    );
  }
  if (status === "submitted" || status === "in_review") {
    return (
      <span
        style={{
          display: "inline-block", fontSize: 11.5, padding: "3px 9px",
          borderRadius: 100, border: `1px solid ${WARN_LINE}`,
          background: WARN_BG, color: WARN_INK,
        }}
      >
        In review
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-block", fontSize: 11.5, padding: "3px 9px",
        borderRadius: 100, border: `1px solid ${WARN_LINE}`,
        background: WARN_BG, color: WARN_INK,
      }}
    >
      Draft
    </span>
  );
}

// ── done row ─────────────────────────────────────────────────────────────────
function DoneRow({ label, desc }: { label: string; desc: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex", gap: 13, alignItems: "flex-start",
        padding: "14px 18px", borderBottom: `1px solid ${HAIR}`,
      }}
    >
      {/* filled checkmark */}
      <span
        style={{
          width: 19, height: 19, flexShrink: 0, borderRadius: 5, marginTop: 1,
          background: ACCENT, border: `1.5px solid ${ACCENT}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4 10.5l4 4 8-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {/* strikethrough label */}
        <span
          style={{
            display: "block", fontSize: 13.5, fontWeight: 500, color: MUTED,
            textDecoration: "line-through", textDecorationColor: MUTED,
          }}
        >
          {label}
        </span>
        <span style={{ display: "block", fontSize: 12.5, marginTop: 2, lineHeight: 1.45, color: MUTED }}>
          {desc}
        </span>
      </span>
    </div>
  );
}

// ── pending row ───────────────────────────────────────────────────────────────
function PendingRow({
  label, desc, href, actionLabel,
}: { label: string; desc: React.ReactNode; href?: string; actionLabel?: string }) {
  const inner = (
    <div
      style={{
        display: "flex", gap: 13, alignItems: "flex-start",
        padding: "14px 18px", borderBottom: `1px solid ${HAIR}`, width: "100%",
      }}
    >
      {/* empty checkbox */}
      <span
        style={{
          width: 19, height: 19, flexShrink: 0, borderRadius: 5, marginTop: 1,
          border: `1.5px solid ${HAIR}`, background: "#fff",
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, color: INK }}>
          {label}
        </span>
        <span style={{ display: "block", fontSize: 12.5, marginTop: 2, lineHeight: 1.45, color: MUTED }}>
          {desc}
        </span>
      </span>
      {actionLabel && (
        <span
          style={{
            fontSize: 12.5, color: ACCENT, whiteSpace: "nowrap",
            alignSelf: "center", marginLeft: 8, flexShrink: 0,
          }}
        >
          {actionLabel}
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href}>
        <a style={{ display: "block" }} className="hover:bg-[#FAFAF8] transition-colors">{inner}</a>
      </Link>
    );
  }
  return <div>{inner}</div>;
}

// ── settings row ──────────────────────────────────────────────────────────────
function SettingsRow({
  icon, title, desc, href, last,
}: { icon: React.ReactNode; title: string; desc: string; href: string; last?: boolean }) {
  return (
    <Link href={href}>
      <a
        className="hover:bg-[#FAFAF8] transition-colors"
        style={{
          display: "flex", gap: 13, alignItems: "flex-start",
          padding: "14px 18px",
          borderBottom: last ? "none" : `1px solid ${HAIR}`,
        }}
      >
        <span style={{ width: 19, height: 19, flexShrink: 0, marginTop: 1, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, color: INK }}>{title}</span>
          <span style={{ display: "block", fontSize: 12.5, marginTop: 2, lineHeight: 1.45, color: MUTED }}>{desc}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, alignSelf: "center", color: ACCENT }}>
          <path d="M7 5l5 5-5 5" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </Link>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function ProviderListingHome() {
  const params = useParams<{ id: string }>();
  const serviceId = params?.id ?? "";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: service, isLoading } = useQuery<ServiceDetail>({
    queryKey: [`/api/provider/services/${serviceId}`],
    enabled: !!serviceId,
  });

  const { data: attestations } = useQuery<AttestationsShape>({
    queryKey: [`/api/provider/services/${serviceId}/attestations`],
    enabled: !!serviceId,
  });

  const checklist = useMemo(
    () => (service ? deriveChecklist(service, attestations) : []),
    [service, attestations],
  );

  const pending = checklist.filter((c) => !c.done);
  const done    = checklist.filter((c) => c.done);

  const isSubmitted =
    service?.approvalStatus === "submitted" || service?.approvalStatus === "in_review";
  const isLive =
    service?.approvalStatus === "approved" && service?.status === "active";

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/provider/services/${serviceId}/submit`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/provider/services/${serviceId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({
        title: "Submitted for review",
        description: "Our team reviews listings within 2 business days. You can keep editing while it waits.",
      });
    },
    onError: () => {
      toast({ title: "Could not submit", description: "Please check your listing and try again.", variant: "destructive" });
    },
  });

  const editHref      = `/provider/services/${serviceId}/edit`;
  const availHref     = `/provider/services?availability=${encodeURIComponent(serviceId)}`;
  const logisticsHref = `${editHref}?step=logistics`;

  if (isLoading) {
    return (
      <ProviderLayout title="Listing">
        <div className="space-y-4 max-w-5xl">
          <Skeleton className="h-[80px] w-full" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      </ProviderLayout>
    );
  }

  if (!service) {
    return (
      <ProviderLayout title="Listing">
        <div className="py-16 text-center text-sm" style={{ color: MUTED }}>
          Listing not found.{" "}
          <Link href="/provider/workstation">
            <a className="underline" style={{ color: ACCENT }}>Back to Workstation →</a>
          </Link>
        </div>
      </ProviderLayout>
    );
  }

  const listingName = service.serviceName || "Untitled listing";

  return (
    <ProviderLayout title={listingName}>
      <div style={{ maxWidth: 1020 }}>

        {/* breadcrumb */}
        <nav style={{ fontSize: 12.5, color: MUTED, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <Link href="/provider/workstation">
            <a style={{ color: ACCENT, textDecoration: "underline", textUnderlineOffset: 2 }}>Workstation</a>
          </Link>
          <span>›</span>
          <Link href={editHref}>
            <a style={{ color: ACCENT, textDecoration: "underline", textUnderlineOffset: 2 }}>
              {listingName}
            </a>
          </Link>
          <span>›</span>
          <span style={{ color: INK, fontWeight: 600 }}>Listing home</span>
        </nav>

        {/* back link */}
        <Link href="/provider/workstation">
          <a
            style={{
              display: "inline-block", fontSize: 13, color: ACCENT,
              textDecoration: "underline", textUnderlineOffset: 2, marginBottom: 14,
            }}
          >
            ← Back
          </a>
        </Link>

        {/* ── hero card ─────────────────────────────────────────────────── */}
        <div
          data-testid="listing-home-hero"
          style={{
            background: "#fff", borderRadius: 7, padding: "20px 22px",
            border: `1px solid ${ACCENT}`, display: "flex", gap: 16,
            alignItems: "flex-start", flexWrap: "wrap", marginBottom: 20,
          }}
        >
          {/* check circle */}
          <div
            style={{
              width: 34, height: 34, flexShrink: 0, borderRadius: "50%",
              background: SOFT, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 10.5l4 4 8-9" stroke={ACCENT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: INK, margin: "0 0 3px", lineHeight: 1.25 }}>
              {isSubmitted
                ? "In review — keep editing while you wait"
                : isLive
                  ? "Your listing is live"
                  : "Your listing is saved — finish it now or later"}
            </h2>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
              {listingName}
              {service.deliveryMethod ? ` · ${fmtMethod(service.deliveryMethod)}` : ""}
              {service.price ? ` · $${service.price} per person` : ""}
              {" · "}
              {timeAgo(service.updatedAt)}
            </p>
          </div>
          <StatusChip status={isLive ? "active" : (service.approvalStatus ?? "draft")} />
        </div>

        {/* ── 2-column body ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid", gap: 20, alignItems: "start",
            gridTemplateColumns: "minmax(0,1fr) 320px",
          }}
        >
          {/* ── left column ─────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* checklist card */}
            <div
              data-testid="listing-home-checklist"
              style={{ background: "#fff", borderRadius: 7, border: `1px solid ${HAIR}`, overflow: "hidden" }}
            >
              {/* card header */}
              <div
                style={{
                  padding: "14px 22px", borderBottom: `1px solid ${HAIR}`,
                  display: "flex", flexDirection: "column", gap: 3,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: INK, margin: 0 }}>
                    {pending.length === 0
                      ? "Everything is filled in"
                      : `${pending.length} thing${pending.length === 1 ? "" : "s"} left before review`}
                  </h3>
                  {/* DotGhost */}
                  <span style={{ width: 10, height: 10, borderRadius: "50%", border: `1.5px solid ${MUTED}`, display: "inline-block", flexShrink: 0 }} />
                </div>
                <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
                  Derived from the draft — rows navigate, they do not tick
                </p>
              </div>

              {/* pending items */}
              {pending.map((item) => (
                <PendingRow
                  key={item.key}
                  label={item.label}
                  desc={item.desc}
                  href={item.href}
                  actionLabel={item.actionLabel}
                />
              ))}

              {/* "Already done" section */}
              {done.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "10px 18px 6px",
                      borderTop: pending.length > 0 ? `1px solid ${HAIR}` : undefined,
                      borderBottom: `1px solid ${HAIR}`,
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED }}>
                      Already done
                    </span>
                  </div>
                  {done.map((item) => (
                    <DoneRow key={item.key} label={item.label} desc={item.desc} />
                  ))}
                </>
              )}

              {/* footer note */}
              <div style={{ padding: "11px 18px", borderTop: `1px solid ${HAIR}`, background: GROUND }}>
                <p style={{ fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.55 }}>
                  Each row <strong style={{ color: INK }}>opens the surface that owns the work</strong>.
                  Nothing ticks because you clicked it here — the tick is read back from the listing.
                </p>
              </div>
            </div>

            {/* submit card */}
            {!isLive && (
              <div
                data-testid="listing-home-submit"
                style={{ background: "#fff", borderRadius: 7, padding: "20px 22px", border: `1px solid ${HAIR}` }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>
                      {isSubmitted ? "In review — changes can still be made" : "Ready when you are"}
                    </div>
                    <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
                      {isSubmitted
                        ? "Our team is reviewing your listing. You can keep editing — changes are re-checked before anything goes live."
                        : "Reviewed by our team, usually within 2 business days. You can keep editing while it is in review."}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <Button
                      variant="outline"
                      onClick={() => navigate("/provider/workstation")}
                      data-testid="button-finish-later"
                    >
                      Finish later
                    </Button>
                    {!isSubmitted && (
                      <Button
                        onClick={() => submitMutation.mutate()}
                        disabled={submitMutation.isPending}
                        className="text-white"
                        style={{ background: ACCENT, borderColor: ACCENT }}
                        data-testid="button-submit-for-review"
                      >
                        Submit for review
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── right rail (320px) ──────────────────────────────────────── */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* listing settings */}
            <div
              data-testid="listing-home-settings"
              style={{ background: "#fff", borderRadius: 7, border: `1px solid ${HAIR}`, overflow: "hidden" }}
            >
              <div style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}` }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: INK, margin: 0 }}>Listing settings</h3>
              </div>
              <SettingsRow
                icon={<DollarSign size={15} />}
                title="Pricing & fees"
                desc="Surcharges, deposit, cancellation. Tune later — not required to go live."
                href={editHref}
              />
              <SettingsRow
                icon={<CalendarDays size={15} />}
                title="Availability"
                desc="Slots, ranges and blackout dates. Lives on Catalog, beside the listing."
                href={availHref}
              />
              <SettingsRow
                icon={<ImageIcon size={15} />}
                title="Photos & media"
                desc="Cover photo, gallery, short clip."
                href={`${editHref}?step=photos`}
                last
              />
            </div>

            {/* after creation card */}
            <div
              data-testid="listing-home-after-creation"
              style={{ background: "#fff", borderRadius: 7, padding: "20px 22px", border: `1px solid ${HAIR}` }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 8 }}>
                After creation there are two things to do
              </div>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                <strong style={{ color: INK }}>1 · Publish availability</strong> — the Catalog
                section, unchanged by this proposal. Nothing is bookable until it exists.
                <br />
                <br />
                <strong style={{ color: INK }}>2 · Develop the offering</strong> — the checklist
                rows walk back into the flow's steps, including the new{" "}
                <strong style={{ color: INK }}>step 4, Logistics</strong>, for anything about
                where it happens. There is no third verb and no third surface.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(availHref)}
                  data-testid="button-publish-availability"
                >
                  Publish availability →
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(logisticsHref)}
                  data-testid="button-fix-location"
                >
                  Fix the location →
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </ProviderLayout>
  );
}
