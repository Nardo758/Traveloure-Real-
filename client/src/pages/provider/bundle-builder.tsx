/**
 * Bundle Builder — full-page create flow for a new bundle.
 * Graduated from the BundleBuilder mockup (provider-console/BundleBuilder.tsx).
 *
 * Route: /provider/bundles/new
 * Replaces the workstation dialog; the Bundle rung tile links here.
 *
 * POST /api/provider/bundles { serviceName, description?, price, componentServiceIds }
 * Redirects to /provider/workstation on success (same behaviour as the dialog).
 */
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

function parseApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

// ── colours ──────────────────────────────────────────────────────────────────
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const ACC = "#35605A";
const ACCS = "#EDF2F1";
const WBG = "#FBF6EC";
const WLN = "#D9C79A";
const WINK = "#6B551F";

// ── eligible component shape ──────────────────────────────────────────────────
interface EligibleService {
  id: string;
  serviceName: string | null;
  price: string | number | null;
  deliveryMethod: string | null;
  approvalStatus: string | null;
  status: string | null;
  productShape: string | null;
}

// ── delivery method label ─────────────────────────────────────────────────────
const METHOD_LABELS: Record<string, string> = {
  in_person: "In person",
  video_call: "Video call",
  phone_call: "Phone call",
  async_messaging: "Async messaging",
  voice_notes: "Voice notes",
  pdf_guide: "PDF guide",
};

function methodLabel(m: string | null): string {
  if (!m) return "Unknown";
  return METHOD_LABELS[m] ?? m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── derived delivery method ───────────────────────────────────────────────────
function deriveMethod(components: EligibleService[]): { label: string; why: string } {
  const methodSet = new Set(components.map((c) => c.deliveryMethod).filter(Boolean));
  const methods = Array.from(methodSet) as string[];
  if (methods.length === 0) {
    return { label: "—", why: "Pick at least two components and the method follows from them." };
  }
  if (methods.length === 1) {
    const l = methodLabel(methods[0]);
    return { label: l, why: `Every component is "${l}", so the bundle is too.` };
  }
  const labels = methods.map(methodLabel).join(" and ");
  return { label: "Hybrid", why: `Components mix ${labels}, so the bundle is Hybrid.` };
}

// ── check icon ────────────────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function ProviderBundleBuilder() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [picked, setPicked] = useState<string[]>([]);
  const [bundleName, setBundleName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  // fetch provider's approved, active, non-bundle services
  const { data: rawServices = [], isLoading } = useQuery<EligibleService[]>({
    queryKey: ["/api/provider/services"],
    select: (data: any[]) =>
      data.filter(
        (s) =>
          s.approvalStatus === "approved" &&
          s.status === "active" &&
          s.productShape !== "bundle",
      ),
  });

  const pickedComponents = useMemo(
    () => rawServices.filter((s) => picked.includes(s.id)),
    [rawServices, picked],
  );

  const { label: derivedMethod, why: derivedWhy } = useMemo(
    () => deriveMethod(pickedComponents),
    [pickedComponents],
  );

  const componentTotal = pickedComponents.reduce((acc, s) => {
    const n = Number(s.price);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  const priceNum = parseFloat(price);
  const formValid =
    bundleName.trim().length > 0 &&
    Number.isFinite(priceNum) &&
    priceNum > 0 &&
    picked.length >= 2;

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/bundles", {
        serviceName: bundleName.trim(),
        description: description.trim() || undefined,
        price,
        componentServiceIds: picked,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bundles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({
        title: "Bundle submitted for review",
        description: "It appears in your Catalog and goes live once approved.",
      });
      navigate("/provider/workstation");
    },
    onError: (err) => {
      toast({
        title: "Could not create bundle",
        description: parseApiErrorMessage(err, "Please check the fields and try again."),
        variant: "destructive",
      });
    },
  });

  return (
    <ProviderLayout title="New bundle">
      <div className="max-w-3xl">
        {/* back link */}
        <Link href="/provider/workstation">
          <a
            className="inline-block text-[13px] underline underline-offset-2 mb-[14px]"
            style={{ color: ACC }}
          >
            ← Back to "What are you building?"
          </a>
        </Link>

        {/* main card */}
        <div
          className="bg-white rounded-[7px] overflow-hidden"
          style={{ border: `1px solid ${HAIR}` }}
          data-testid="bundle-builder-card"
        >
          {/* card header */}
          <div
            className="flex items-center gap-2.5 flex-wrap px-[22px] py-[14px] border-b"
            style={{ borderColor: HAIR }}
          >
            <h3 className="text-[15px] font-semibold m-0" style={{ color: INK }}>
              New bundle
            </h3>
            <span
              className="inline-flex items-center gap-1.5 text-[11.5px] font-medium rounded-full border px-2.5 py-0.5"
              style={{ background: WBG, borderColor: WLN, color: WINK }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: "#C79A3C" }} />
              Proposed — gap #9 · ratify or amend
            </span>
            <span className="ml-auto text-[12px]" style={{ color: MUT }}>
              Previewing the unlocked state
            </span>
          </div>

          <div className="px-[22px] py-[20px]">
            {/* explainer */}
            <div
              className="rounded-[6px] text-[12.5px] leading-[1.5] p-[11px_14px] mb-[18px]"
              style={{ background: GRD, border: `1px dashed ${HAIR}`, color: MUT }}
            >
              A bundle is{" "}
              <strong style={{ color: INK }}>not a new kind of thing</strong> — it is your own
              approved listings sold together at one price, in one booking. Components stay linked
              to the originals — editing a component edits the listing it came from.
            </div>

            {/* name field */}
            <div className="mb-4">
              <label
                className="block text-[13px] font-medium mb-[5px]"
                style={{ color: INK }}
                htmlFor="bundle-name"
              >
                Bundle name
              </label>
              <input
                id="bundle-name"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                placeholder="e.g. Kyoto Full Experience"
                className="w-full rounded-[6px] text-[13.5px] px-[11px] py-[9px] outline-none focus:ring-1"
                style={{
                  border: `1px solid ${HAIR}`,
                  background: PAPER,
                  color: INK,
                }}
                data-testid="input-bundle-name"
              />
            </div>

            {/* description field */}
            <div className="mb-4">
              <label
                className="block text-[13px] font-medium mb-[5px]"
                style={{ color: INK }}
                htmlFor="bundle-description"
              >
                Description{" "}
                <span className="font-normal text-[12px]" style={{ color: MUT }}>
                  (optional)
                </span>
              </label>
              <textarea
                id="bundle-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Tell travelers what makes this bundle special."
                className="w-full rounded-[6px] text-[13.5px] px-[11px] py-[9px] resize-y outline-none focus:ring-1"
                style={{ border: `1px solid ${HAIR}`, background: PAPER, color: INK }}
                data-testid="input-bundle-description"
              />
            </div>

            {/* component picker */}
            <div className="mb-4">
              <label className="block text-[13px] font-medium mb-[5px]" style={{ color: INK }}>
                Pick components{" "}
                <span className="font-normal text-[12px]" style={{ color: MUT }}>
                  (at least 2 approved services)
                </span>
              </label>

              {isLoading ? (
                <div
                  className="rounded-[6px] px-4 py-6 text-center text-[13px]"
                  style={{ border: `1px solid ${HAIR}`, color: MUT }}
                >
                  Loading your approved services…
                </div>
              ) : rawServices.length === 0 ? (
                <div
                  className="rounded-[6px] px-4 py-6 text-center text-[13px]"
                  style={{ border: `1px solid ${HAIR}`, background: GRD, color: MUT }}
                >
                  No approved services yet — a bundle unlocks when you have 2 or more.{" "}
                  <Link href="/provider/services/new">
                    <a className="underline" style={{ color: ACC }}>Create a service →</a>
                  </Link>
                </div>
              ) : (
                <div
                  className="rounded-[6px] overflow-hidden"
                  style={{ border: `1px solid ${HAIR}` }}
                  data-testid="bundle-component-picker"
                >
                  {rawServices.map((s, i) => {
                    const on = picked.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggle(s.id)}
                        data-testid={`component-${s.id}`}
                        aria-pressed={on}
                        className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors"
                        style={{
                          borderBottom:
                            i < rawServices.length - 1 ? `1px solid ${HAIR}` : "none",
                          background: on ? ACCS : PAPER,
                        }}
                      >
                        {/* checkbox */}
                        <span
                          className="w-[18px] h-[18px] flex-none rounded-[4px] flex items-center justify-center"
                          style={{
                            border: on ? `1.5px solid ${ACC}` : `1.5px solid ${HAIR}`,
                            background: on ? ACC : PAPER,
                          }}
                        >
                          {on && <CheckIcon />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-medium truncate" style={{ color: INK }}>
                            {s.serviceName ?? "Untitled"}
                          </span>
                          <span className="block text-[11.5px]" style={{ color: MUT }}>
                            {methodLabel(s.deliveryMethod)}
                          </span>
                        </span>
                        <span className="text-[12.5px] flex-none" style={{ color: MUT }}>
                          {s.price != null ? `$${s.price}` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="text-[12px] mt-2" style={{ color: MUT }}>
                {picked.length < 2
                  ? `${picked.length} of 2 minimum selected.`
                  : `${picked.length} selected. Components total $${componentTotal}.`}
              </div>
            </div>

            {/* selected components summary (shown when 2+ picked) */}
            {pickedComponents.length >= 2 && (
              <div className="mb-4">
                <div
                  className="rounded-[6px] overflow-hidden"
                  style={{ border: `1px solid ${HAIR}` }}
                >
                  <div
                    className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em]"
                    style={{ borderBottom: `1px solid ${HAIR}`, color: MUT, background: GRD }}
                  >
                    Bundle contains
                  </div>
                  {pickedComponents.map((c, i) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2.5 px-4 py-2.5"
                      style={{ borderBottom: i < pickedComponents.length - 1 ? `1px solid ${HAIR}` : "none" }}
                    >
                      <span className="flex-1 min-w-0 text-[13px] truncate" style={{ color: INK }}>
                        {c.serviceName ?? "Untitled"}
                      </span>
                      <span className="text-[12.5px]" style={{ color: MUT }}>
                        ${c.price ?? "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        className="text-[12px] underline underline-offset-1"
                        style={{ color: MUT, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[11.5px] mt-2 leading-[1.55]" style={{ color: MUT }}>
                  These stay linked to the originals. Editing a component edits the listing it came
                  from, and a component that leaves approval takes the bundle out of sale with it.
                </p>
              </div>
            )}

            {/* delivery + price grid */}
            <div
              className="grid gap-4 mb-4"
              style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}
            >
              <div>
                <label className="block text-[13px] font-medium mb-[5px]" style={{ color: INK }}>
                  Delivery method
                </label>
                <input
                  readOnly
                  value={derivedMethod}
                  className="w-full rounded-[6px] text-[13.5px] px-[11px] py-[9px]"
                  style={{ border: `1px solid ${HAIR}`, background: GRD, color: MUT }}
                  data-testid="input-derived-method"
                />
                <div className="text-[12px] mt-[5px] leading-[1.5]" style={{ color: MUT }}>
                  <strong style={{ color: INK }}>Derived, not chosen.</strong> {derivedWhy}
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-[5px]" style={{ color: INK }} htmlFor="bundle-price">
                  Bundle price
                </label>
                <div className="flex gap-2 items-center">
                  <span className="text-[13px]" style={{ color: MUT }}>$</span>
                  <input
                    id="bundle-price"
                    type="number"
                    min="1"
                    step="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                    className="rounded-[6px] text-[13.5px] px-[11px] py-[9px] outline-none focus:ring-1"
                    style={{ border: `1px solid ${HAIR}`, background: PAPER, color: INK, maxWidth: 130, width: "100%" }}
                    data-testid="input-bundle-price"
                  />
                </div>
                <div className="text-[12px] mt-[5px] leading-[1.5]" style={{ color: MUT }}>
                  {componentTotal > 0 && (
                    <>
                      Components total{" "}
                      <strong style={{ color: INK }}>${componentTotal}</strong> —{" "}
                    </>
                  )}
                  <strong style={{ color: INK }}>you set the bundle price.</strong> Nothing is
                  auto-summed; whatever you type is what a traveler pays in one booking.
                </div>
              </div>
            </div>

            {/* availability intersection notice */}
            <div
              className="rounded-[6px] text-[12.5px] leading-[1.5] p-[11px_14px] mb-[18px]"
              style={{ background: WBG, border: `1px solid ${WLN}`, color: WINK }}
            >
              <strong style={{ fontWeight: 650 }}>Availability is the intersection.</strong> A
              bundle is bookable only when every component is — the proposed rule, stated here so it
              is not discovered at checkout. Set it on{" "}
              <Link href="/provider/services">
                <a className="underline underline-offset-1 font-medium" style={{ color: ACC }}>
                  Availability →
                </a>
              </Link>
            </div>

            {/* footer */}
            <div className="flex gap-2.5 items-center flex-wrap">
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!formValid || createMutation.isPending}
                className="text-white"
                style={{ background: ACC, borderColor: ACC }}
                data-testid="button-submit-bundle"
              >
                {createMutation.isPending ? "Submitting…" : "Submit for review"}
              </Button>
              <span className="text-[12.5px]" style={{ color: MUT }}>
                A bundle is reviewed like any other listing.
              </span>
              {!formValid && (
                <span className="text-[12px]" style={{ color: MUT }}>
                  {bundleName.trim().length === 0
                    ? "Add a bundle name."
                    : picked.length < 2
                      ? `Need ${2 - picked.length} more component${2 - picked.length === 1 ? "" : "s"}.`
                      : !(priceNum > 0)
                        ? "Set a price greater than $0."
                        : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProviderLayout>
  );
}
