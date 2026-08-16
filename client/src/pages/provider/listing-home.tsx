/**
 * Listing Home — the page a provider lands on after saving a service.
 * Shows the draft state, a checklist of what's left, the edit-split rule (gap #17),
 * settings links, and the submit-for-review action.
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
import {
  DollarSign,
  CalendarDays,
  ImageIcon,
  ChevronRight,
  CheckSquare,
} from "lucide-react";

// ── colours (console design tokens, matching _consoleShared.tsx) ─────────────
const INK = "#1A1A18";
const MUTED = "#7A7A72";
const HAIR = "#E8E8E2";
const GROUND = "#FAFAF8";
const ACCENT = "#35605A";
const SOFT = "#EDF2F1";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";

// ── service shape returned by GET /api/provider/services/:id ─────────────────
interface ServiceDetail {
  id: string;
  serviceName: string | null;
  description: string | null;
  deliveryMethod: string | null;
  productShape: string | null;
  price: string | number | null;
  categoryId: number | null;
  approvalStatus: string | null;
  status: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  routePoints?: { id: string; name: string; latitude: string | null; longitude: string | null }[];
}

// ── checklist derivation ─────────────────────────────────────────────────────
interface CheckItem {
  key: string;
  label: string;
  desc: string;
  done: boolean;
  href?: string;
}

function deriveChecklist(s: ServiceDetail): CheckItem[] {
  const editHref = `/provider/services/${s.id}/edit`;

  const items: CheckItem[] = [
    {
      key: "name",
      label: "Add a title",
      desc: s.serviceName ? `"${s.serviceName}"` : "Required — travelers see this first.",
      done: !!(s.serviceName && s.serviceName.trim().length > 0),
      href: editHref,
    },
    {
      key: "delivery",
      label: "Set the delivery method",
      desc: s.deliveryMethod
        ? s.deliveryMethod.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "In person, video call, PDF guide, etc.",
      done: !!s.deliveryMethod,
      href: editHref,
    },
    {
      key: "price",
      label: "Set a price",
      desc:
        s.price != null && s.price !== ""
          ? `$${s.price} per person`
          : "Required before you can submit for review.",
      done: s.price != null && s.price !== "" && Number(s.price) > 0,
      href: editHref,
    },
    {
      key: "description",
      label: "Write a description",
      desc:
        s.description && s.description.trim().length >= 80
          ? "Done — enough detail for review."
          : "At least 80 characters for review. You can write it now or finish later.",
      done: !!(s.description && s.description.trim().length >= 80),
      href: editHref,
    },
  ];

  // location — only relevant for place-anchored listings (in-person, property)
  const needsLocation = isPlaceAnchored({
    deliveryMethod: s.deliveryMethod,
    productShape: s.productShape,
  });

  if (needsLocation) {
    const hasPin = s.latitude != null && s.longitude != null;
    items.push({
      key: "location",
      label: "Confirm where it happens",
      desc: hasPin
        ? "Meeting point pinned — travelers see this before booking."
        : "Add a pin in the Logistics step so travelers know where to show up.",
      done: hasPin,
      href: `${editHref}?step=logistics`,
    });
  }

  return items;
}

// ── status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string | null }) {
  if (status === "approved" || status === "active") {
    return (
      <span
        className="inline-block text-[11.5px] px-[9px] py-[3px] rounded-full border"
        style={{ borderColor: "#BFD5D0", background: SOFT, color: ACCENT }}
      >
        Live
      </span>
    );
  }
  if (status === "submitted" || status === "in_review") {
    return (
      <span
        className="inline-block text-[11.5px] px-[9px] py-[3px] rounded-full border"
        style={{ borderColor: WARN_LINE, background: WARN_BG, color: WARN_INK }}
      >
        In review
      </span>
    );
  }
  return (
    <span
      className="inline-block text-[11.5px] px-[9px] py-[3px] rounded-full border"
      style={{ borderColor: WARN_LINE, background: WARN_BG, color: WARN_INK }}
    >
      Draft
    </span>
  );
}

// ── check row (done state) ────────────────────────────────────────────────────
function DoneRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div
      className="flex gap-[13px] items-start px-[18px] py-[14px] border-b last:border-b-0"
      style={{ borderColor: HAIR }}
    >
      <span
        className="w-[19px] h-[19px] flex-none rounded-[5px] flex items-center justify-center mt-[1px]"
        style={{ background: ACCENT, border: `1.5px solid ${ACCENT}` }}
      >
        <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4 10.5l4 4 8-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-medium" style={{ color: INK }}>{label}</span>
        <span className="block text-[12.5px] mt-[2px] leading-[1.45]" style={{ color: MUTED }}>{desc}</span>
      </span>
    </div>
  );
}

// ── check row (pending state) ─────────────────────────────────────────────────
function PendingRow({ label, desc, href }: { label: string; desc: string; href?: string }) {
  const inner = (
    <div
      className="flex gap-[13px] items-start px-[18px] py-[14px] border-b last:border-b-0 w-full text-left"
      style={{ borderColor: HAIR }}
    >
      <span
        className="w-[19px] h-[19px] flex-none rounded-[5px] flex items-center justify-center mt-[1px]"
        style={{ border: `1.5px solid ${HAIR}`, background: "#fff" }}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-medium" style={{ color: INK }}>{label}</span>
        <span className="block text-[12.5px] mt-[2px] leading-[1.45]" style={{ color: MUTED }}>{desc}</span>
      </span>
      {href && (
        <span className="text-[12.5px] whitespace-nowrap self-center" style={{ color: ACCENT }}>
          Fix it →
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href}>
        <a className="block hover:bg-[#FAFAF8] transition-colors">{inner}</a>
      </Link>
    );
  }
  return <div>{inner}</div>;
}

// ── settings row ──────────────────────────────────────────────────────────────
function SettingsRow({
  icon,
  title,
  desc,
  href,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
  last?: boolean;
}) {
  return (
    <Link href={href}>
      <a
        className="flex gap-[13px] items-start px-[18px] py-[14px] hover:bg-[#FAFAF8] transition-colors"
        style={{ borderBottom: last ? "none" : `1px solid ${HAIR}` }}
      >
        <span
          className="w-[19px] h-[19px] flex-none flex items-center justify-center mt-[1px]"
          style={{ color: MUTED }}
        >
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-medium" style={{ color: INK }}>{title}</span>
          <span className="block text-[12.5px] mt-[2px] leading-[1.45]" style={{ color: MUTED }}>{desc}</span>
        </span>
        <ChevronRight className="w-4 h-4 self-center flex-none" style={{ color: ACCENT }} />
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

  const checklist = useMemo(
    () => (service ? deriveChecklist(service) : []),
    [service],
  );
  const pending = checklist.filter((c) => !c.done);
  const done = checklist.filter((c) => c.done);

  const isSubmitted =
    service?.approvalStatus === "submitted" || service?.approvalStatus === "in_review";
  const isLive =
    service?.approvalStatus === "approved" && service?.status === "active";

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/provider/services/${serviceId}`, {
        approvalStatus: "submitted",
      });
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
      toast({
        title: "Could not submit",
        description: "Please check your listing and try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/provider/services/${serviceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      navigate("/provider/services");
      toast({ title: "Listing deleted" });
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Could not delete this listing.";
      toast({ title: "Cannot delete", description: msg, variant: "destructive" });
    },
  });

  const editHref = `/provider/services/${serviceId}/edit`;
  const availabilityHref = `/provider/services?availability=${serviceId}`;

  if (isLoading) {
    return (
      <ProviderLayout title="Listing">
        <div className="space-y-4 max-w-5xl">
          <Skeleton className="h-[80px] w-full" />
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[150px] w-full" />
        </div>
      </ProviderLayout>
    );
  }

  if (!service) {
    return (
      <ProviderLayout title="Listing">
        <div className="py-16 text-center text-sm" style={{ color: MUTED }}>
          Listing not found.{" "}
          <Link href="/provider/services">
            <a className="underline" style={{ color: ACCENT }}>Back to Catalog →</a>
          </Link>
        </div>
      </ProviderLayout>
    );
  }

  const listingName = service.serviceName || "Untitled listing";

  return (
    <ProviderLayout title={listingName}>
      <div className="max-w-5xl">
        {/* breadcrumb */}
        <div className="mb-4 text-[12.5px] flex items-center gap-1.5" style={{ color: MUTED }}>
          <Link href="/provider/services">
            <a className="underline underline-offset-2" style={{ color: ACCENT }}>Catalog</a>
          </Link>
          <span>›</span>
          <span style={{ color: INK, fontWeight: 600 }}>{listingName}</span>
        </div>

        {/* back link */}
        <Link href="/provider/services">
          <a
            className="inline-block text-[13px] underline underline-offset-2 mb-[14px]"
            style={{ color: ACCENT }}
          >
            ← Back to Catalog
          </a>
        </Link>

        {/* hero card */}
        <div
          className="bg-white rounded-[7px] p-[20px_22px] flex gap-4 items-start flex-wrap mb-5"
          style={{ border: `1px solid ${ACCENT}` }}
          data-testid="listing-home-hero"
        >
          <div
            className="w-[34px] h-[34px] flex-none rounded-full flex items-center justify-center"
            style={{ background: SOFT }}
          >
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 10.5l4 4 8-9" stroke={ACCENT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex-1 min-w-[220px]">
            <h2 className="text-[17px] font-semibold mb-[3px] leading-tight" style={{ color: INK }}>
              {isSubmitted
                ? "In review — keep editing while you wait"
                : isLive
                  ? "Your listing is live"
                  : "Your listing is saved — finish it now or later"}
            </h2>
            <p className="text-[13px] m-0" style={{ color: MUTED }}>
              {listingName}
              {service.deliveryMethod ? ` · ${service.deliveryMethod.replace(/_/g, " ")}` : ""}
              {service.price ? ` · $${service.price} per person` : ""}
            </p>
          </div>
          <StatusChip status={isLive ? "active" : (service.approvalStatus ?? "draft")} />
        </div>

        <div
          className="grid gap-5 items-start"
          style={{ gridTemplateColumns: "minmax(0,1fr) 336px" }}
        >
          {/* ── left column ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-5">
            {/* checklist */}
            <div
              className="bg-white rounded-[7px] overflow-hidden"
              style={{ border: `1px solid ${HAIR}` }}
              data-testid="listing-home-checklist"
            >
              <div
                className="flex items-center gap-2.5 flex-wrap px-[22px] py-[14px] border-b"
                style={{ borderColor: HAIR }}
              >
                <h3 className="text-[15px] font-semibold m-0" style={{ color: INK }}>
                  {pending.length === 0
                    ? "Everything is filled in"
                    : `${pending.length} thing${pending.length === 1 ? "" : "s"} left before review`}
                </h3>
                <span
                  className="ml-auto inline-flex items-center gap-1.5 text-[11.5px]"
                  style={{ color: MUTED }}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  {done.length}/{checklist.length} done
                </span>
              </div>
              {/* pending items */}
              {pending.map((item) => (
                <PendingRow key={item.key} label={item.label} desc={item.desc} href={item.href} />
              ))}
              {/* done items */}
              {done.map((item) => (
                <DoneRow key={item.key} label={item.label} desc={item.desc} />
              ))}
            </div>

            {/* gap #17 — editing a live listing */}
            <div
              className="bg-white rounded-[7px] overflow-hidden"
              style={{ border: `1px solid ${HAIR}` }}
              data-testid="listing-home-edit-split"
            >
              <div
                className="flex items-center gap-2.5 flex-wrap px-[22px] py-[14px] border-b"
                style={{ borderColor: HAIR }}
              >
                <h3 className="text-[15px] font-semibold m-0" style={{ color: INK }}>
                  Editing a live listing
                </h3>
                <span
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium rounded-full border px-2.5 py-0.5"
                  style={{ background: WARN_BG, borderColor: WARN_LINE, color: WARN_INK }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: "#C79A3C" }} />
                  Proposed — gap #17
                </span>
              </div>
              <div className="px-[22px] py-[20px]">
                <p className="text-[12.5px] leading-[1.65] mb-3.5" style={{ color: MUTED }}>
                  The proposed split: edits that cannot mislead a traveler about{" "}
                  <strong style={{ color: INK }}>what they are buying</strong> go straight live;
                  edits that change the thing itself re-enter review, and the previously approved
                  version stays live while they do.
                </p>
                <div
                  className="grid overflow-hidden rounded-[6px]"
                  style={{
                    gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                    border: `1px solid ${HAIR}`,
                  }}
                >
                  <div
                    className="px-4 py-3.5"
                    style={{ borderRight: `1px solid ${HAIR}`, background: SOFT }}
                  >
                    <h6
                      className="text-[10.5px] tracking-[0.07em] uppercase font-semibold mb-2.5 mt-0"
                      style={{ color: ACCENT }}
                    >
                      Goes live immediately
                    </h6>
                    <ul className="list-none m-0 p-0 text-[12.5px] leading-[1.9]" style={{ color: INK }}>
                      {[
                        "Price and pricing settings",
                        "Photos and gallery order",
                        "Availability, slots and blackouts",
                        "Description wording",
                        "What to bring · access notes",
                        "Meeting-point pin position",
                      ].map((t) => (
                        <li key={t}>
                          <span style={{ color: MUTED }}>— </span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="px-4 py-3.5">
                    <h6
                      className="text-[10.5px] tracking-[0.07em] uppercase font-semibold mb-2.5 mt-0"
                      style={{ color: WARN_INK }}
                    >
                      Re-enters review
                    </h6>
                    <ul className="list-none m-0 p-0 text-[12.5px] leading-[1.9]" style={{ color: INK }}>
                      {[
                        "Listing name",
                        "Category and offering",
                        "Delivery method",
                        "Safety attestations",
                        "Adding a route where there was none",
                      ].map((t) => (
                        <li key={t}>
                          <span style={{ color: MUTED }}>— </span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="text-[12px] mt-3 leading-[1.55]" style={{ color: MUTED }}>
                  While a re-review is pending, the listing shows{" "}
                  <span
                    className="inline-block text-[11.5px] px-[9px] py-[2px] rounded-full border"
                    style={{ borderColor: "#BFD5D0", background: SOFT, color: ACCENT }}
                  >
                    Live
                  </span>
                  {" +"}
                  <span
                    className="inline-block ml-1 text-[11.5px] px-[9px] py-[2px] rounded-full border"
                    style={{ borderColor: WARN_LINE, background: WARN_BG, color: WARN_INK }}
                  >
                    Edit in review
                  </span>{" "}
                  on Catalog — travelers keep booking the approved version, and the edit lands only when it passes.{" "}
                  <strong style={{ color: INK }}>Nothing is taken down for an edit.</strong>
                </p>
              </div>
            </div>

            {/* submit card */}
            {!isLive && (
              <div
                className="bg-white rounded-[7px] p-[20px_22px]"
                style={{ border: `1px solid ${HAIR}` }}
                data-testid="listing-home-submit"
              >
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[260px]">
                    <div className="text-[14px] font-semibold mb-1" style={{ color: INK }}>
                      {isSubmitted ? "In review — changes can still be made" : "Ready when you are"}
                    </div>
                    <div className="text-[12.5px] leading-[1.55]" style={{ color: MUTED }}>
                      {isSubmitted
                        ? "Our team is reviewing your listing. You can keep editing — changes are re-checked before anything goes live."
                        : "Reviewed by our team, usually within 2 business days. You can keep editing while it is in review — changes are re-checked before anything goes live."}
                    </div>
                  </div>
                  <div className="flex gap-2.5 items-center flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => navigate("/provider/services")}
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

            {/* gap #18 — delete */}
            <div
              className="bg-white rounded-[7px] p-[20px_22px]"
              style={{ border: `1px dashed ${HAIR}` }}
              data-testid="listing-home-delete"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px] text-[12.5px] leading-[1.6]" style={{ color: MUTED }}>
                  <strong style={{ color: INK }}>Deleting a listing that has bookings.</strong>{" "}
                  The confirm dialog is not the whole answer — a listing with travelers on it should
                  not be deletable at all.
                  <span
                    className="inline-flex items-center gap-1.5 text-[11.5px] font-medium rounded-full border px-2.5 py-0.5 ml-1.5"
                    style={{ background: WARN_BG, borderColor: WARN_LINE, color: WARN_INK }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: "#C79A3C" }} />
                    Proposed — gap #18
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(`Delete "${listingName}"? This cannot be undone.`)) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-listing"
                >
                  Delete this listing
                </Button>
              </div>
            </div>
          </div>

          {/* ── right rail (336px) ─────────────────────────────────────────── */}
          <aside className="flex flex-col gap-5">
            {/* listing settings */}
            <div
              className="bg-white rounded-[7px] overflow-hidden"
              style={{ border: `1px solid ${HAIR}` }}
              data-testid="listing-home-settings"
            >
              <div
                className="px-[22px] py-[14px] border-b"
                style={{ borderColor: HAIR }}
              >
                <h3 className="text-[15px] font-semibold m-0" style={{ color: INK }}>
                  Listing settings
                </h3>
              </div>
              <div>
                <SettingsRow
                  icon={<DollarSign className="w-[15px] h-[15px]" />}
                  title="Pricing & fees"
                  desc="Surcharges, deposit, cancellation. Tune later — not required to go live."
                  href={editHref}
                />
                <SettingsRow
                  icon={<CalendarDays className="w-[15px] h-[15px]" />}
                  title="Availability"
                  desc="Slots, ranges and blackout dates. Lives on Catalog, beside the listing."
                  href={availabilityHref}
                />
                <SettingsRow
                  icon={<ImageIcon className="w-[15px] h-[15px]" />}
                  title="Photos & media"
                  desc="Cover photo, gallery, short clip."
                  href={editHref}
                  last
                />
              </div>
            </div>

            {/* after creation card */}
            <div
              className="bg-white rounded-[7px] p-[20px_22px]"
              style={{ border: `1px solid ${HAIR}` }}
              data-testid="listing-home-after-creation"
            >
              <div className="text-[13.5px] font-semibold mb-1.5" style={{ color: INK }}>
                After creation there are two things to do
              </div>
              <div className="text-[12.5px] leading-[1.6]" style={{ color: MUTED }}>
                <strong style={{ color: INK }}>1 · Publish availability</strong> — the Catalog
                section, unchanged by this proposal. Nothing is bookable until it exists.
                <br />
                <strong style={{ color: INK }}>2 · Develop the offering</strong> — the checklist
                rows walk back into the flow's steps, including the Logistics step for anything about
                where it happens. There is no third verb and no third surface.
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(availabilityHref)}
                  data-testid="button-publish-availability"
                >
                  Publish availability →
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`${editHref}?step=logistics`)}
                  data-testid="button-fix-location"
                >
                  Fix the location →
                </Button>
              </div>
            </div>

            {/* noteQuiet — what changed */}
            <div
              className="rounded-[6px] text-[12.5px] leading-[1.5] p-[11px_14px]"
              style={{
                background: GROUND,
                border: `1px dashed ${HAIR}`,
                color: MUTED,
              }}
              data-testid="listing-home-note"
            >
              <strong style={{ color: INK }}>What changed:</strong> today the form collects
              everything before it will save anything, and the last screen shows a disabled button
              with five red asterisks. Here the listing exists after five fields, and what is left is
              named in plain language.
            </div>
          </aside>
        </div>
      </div>
    </ProviderLayout>
  );
}
