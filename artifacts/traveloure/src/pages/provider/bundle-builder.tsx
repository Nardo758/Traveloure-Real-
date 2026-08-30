/**
 * Bundle Builder — full-page create flow for a new bundle.
 * Graduated from the BundleBuilder mockup (provider-console/BundleBuilder.tsx).
 *
 * Route: /provider/bundles/new
 *
 * POST /api/provider/bundles { serviceName, description?, price, componentServiceIds }
 * Redirects to /provider/workstation on success.
 */
import { useState, useMemo, useEffect } from "react";
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

// ── design tokens ─────────────────────────────────────────────────────────────
const INK   = "#1A1A18";
const MUT   = "#7A7A72";
const HAIR  = "#E8E8E2";
const GRD   = "#FAFAF8";
const PAP   = "#FFFFFF";
const ACC   = "#35605A";
const ACCS  = "#EDF2F1";

// ── service shape ─────────────────────────────────────────────────────────────
interface EligibleService {
  id: string;
  serviceName: string | null;
  price: string | number | null;
  deliveryMethod: string | null;
  approvalStatus: string | null;
  status: string | null;
  productShape: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  in_person:        "In person",
  video_call:       "Video call",
  phone_call:       "Phone call",
  async_messaging:  "Async messaging",
  voice_notes:      "Voice notes",
  pdf_guide:        "PDF guide",
  hybrid:           "Hybrid",
};

function methodLabel(m: string | null): string {
  if (!m) return "Unknown";
  return METHOD_LABELS[m] ?? m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveMethod(components: EligibleService[]): { label: string; why: string } {
  const methodSet = new Set(components.map((c) => c.deliveryMethod).filter(Boolean));
  const methods = Array.from(methodSet) as string[];
  if (methods.length === 0) return { label: "—", why: "Pick at least two components and the method follows from them." };
  if (methods.length === 1) {
    const l = methodLabel(methods[0]);
    return { label: l, why: `Every component is "${l}", so the bundle is too.` };
  }
  const labels = methods.map(methodLabel).join(" and ");
  return { label: "Hybrid", why: `Components mix ${labels}, so the bundle is Hybrid.` };
}

// ── small primitives ──────────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em",
      textTransform: "uppercase", color: MUT, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", border: `1px solid ${HAIR}`, borderRadius: 6,
  padding: "9px 11px", fontSize: 13.5, color: INK,
  background: PAP, outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
};

// ── page ──────────────────────────────────────────────────────────────────────
// hint: Logic changed on both sides. Requires understanding intent of each change.
export default function ProviderBundleBuilder() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [picked, setPicked] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  // bundle name — auto-suggested from components, editable
  const [bundleName, setBundleName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);

  // fetch provider's approved, active, non-bundle services
  const { data: rawServices = [], isLoading } = useQuery<EligibleService[]>({
    queryKey: ["/api/provider/services"],
    select: (data: any[]) =>
      data.filter(
        (s) =>
          s.approvalStatus === "approved" &&
          s.status === "active" &&
          s.productShape !== "bundle" &&
          s.productShape !== "property" &&
          s.productShape !== "property_room",
      ),
  });

  const pickedComponents = useMemo(
    () => picked.map((id) => rawServices.find((s) => s.id === id)).filter(Boolean) as EligibleService[],
    [rawServices, picked],
  );

  // Auto-suggest bundle name from the first two component names
  useEffect(() => {
    if (nameEdited) return;
    if (pickedComponents.length === 0) { setBundleName(""); return; }
    const parts = pickedComponents.slice(0, 2).map((c) => c.serviceName ?? "Untitled");
    setBundleName(parts.join(" + "));
  }, [pickedComponents, nameEdited]);

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
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function remove(id: string) {
    setPicked((prev) => prev.filter((x) => x !== id));
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/bundles", {
        serviceName: bundleName.trim(),
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
      <div style={{ maxWidth: 760 }}>

        {/* breadcrumb */}
        <nav style={{ fontSize: 12.5, color: MUT, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <Link href="/provider/workstation">
            <a style={{ color: ACC, textDecoration: "underline", textUnderlineOffset: 2 }}>Workstation</a>
          </Link>
          <span>›</span>
          <span style={{ color: INK, fontWeight: 600 }}>New bundle</span>
        </nav>

        {/* back link */}
        <Link href="/provider/workstation">
          <a
            style={{
              display: "inline-block", fontSize: 13, color: ACC,
              textDecoration: "underline", textUnderlineOffset: 2, marginBottom: 14,
            }}
          >
            ← Back to "What are you building?"
          </a>
        </Link>

        {/* main card */}
        <div
          data-testid="bundle-builder-card"
          style={{ background: PAP, borderRadius: 7, border: `1px solid ${HAIR}`, overflow: "hidden" }}
        >
          {/* card header */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              padding: "14px 22px", borderBottom: `1px solid ${HAIR}`,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, color: INK, margin: 0 }}>New bundle</h3>
          </div>

          <div style={{ padding: "20px 22px" }}>

            {/* info banner */}
            <div
              style={{
                borderRadius: 6, fontSize: 12.5, lineHeight: 1.55, padding: "11px 14px",
                marginBottom: 22, background: GRD, border: `1px dashed ${HAIR}`, color: MUT,
              }}
            >
              A bundle is{" "}
              <strong style={{ color: INK }}>not a new kind of thing</strong> — it is your own
              approved listings sold together at one price. That is why it has a picker instead of a
              create form.{" "}
              {/* DotGhost */}
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", border: `1.5px solid ${MUT}`, verticalAlign: "middle" }} />
            </div>

            {/* ── PICK THE COMPONENTS ────────────────────────────────────── */}
            <SectionLabel>Pick the components</SectionLabel>

            {isLoading ? (
              <div
                style={{
                  borderRadius: 6, padding: "20px 16px", textAlign: "center",
                  fontSize: 13, border: `1px solid ${HAIR}`, color: MUT,
                }}
              >
                Loading your approved services…
              </div>
            ) : rawServices.length === 0 ? (
              <div
                style={{
                  borderRadius: 6, padding: "20px 16px", textAlign: "center",
                  fontSize: 13, border: `1px solid ${HAIR}`, background: GRD, color: MUT,
                }}
              >
                No approved services yet — a bundle unlocks when you have 2 or more.{" "}
                <Link href="/provider/services/new">
                  <a style={{ color: ACC, textDecoration: "underline" }}>Create a service →</a>
                </Link>
              </div>
            ) : (
              <div
                data-testid="bundle-component-picker"
                style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}
              >
                {rawServices.map((s) => {
                  const on = picked.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      data-testid={`component-${s.id}`}
                      aria-pressed={on}
                      style={{
                        display: "flex", alignItems: "center", gap: 13,
                        padding: "13px 16px", borderRadius: 6, cursor: "pointer",
                        textAlign: "left", font: "inherit", background: on ? ACCS : PAP,
                        border: `1.5px solid ${on ? ACC : HAIR}`,
                        transition: "border-color 0.12s, background 0.12s",
                      }}
                    >
                      {/* checkbox */}
                      <span
                        style={{
                          width: 19, height: 19, flexShrink: 0, borderRadius: 4,
                          border: `1.5px solid ${on ? ACC : HAIR}`,
                          background: on ? ACC : PAP,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {on && <CheckIcon />}
                      </span>

                      {/* name + sub-label */}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: INK }}>
                          {s.serviceName ?? "Untitled"}
                        </span>
                        <span style={{ display: "block", fontSize: 12.5, color: MUT, marginTop: 1 }}>
                          {methodLabel(s.deliveryMethod)}
                          {s.price != null ? ` · $${s.price} on its own` : ""}
                        </span>
                      </span>

                      {/* approval chip */}
                      {s.approvalStatus === "approved" && (
                        <span
                          style={{
                            fontSize: 11.5, padding: "2px 9px", borderRadius: 100,
                            border: `1px solid ${HAIR}`, color: MUT, background: PAP,
                            flexShrink: 0,
                          }}
                        >
                          approved
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── IN THIS BUNDLE ──────────────────────────────────────────── */}
            {pickedComponents.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <SectionLabel>In this bundle</SectionLabel>

                <div
                  style={{
                    border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden",
                    marginBottom: 10,
                  }}
                >
                  {pickedComponents.map((c, i) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "11px 16px",
                        borderBottom: i < pickedComponents.length - 1 ? `1px solid ${HAIR}` : "none",
                      }}
                    >
                      {/* ordinal */}
                      <span
                        style={{
                          width: 20, height: 20, borderRadius: "50%",
                          background: HAIR, color: MUT,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11.5, fontWeight: 600, flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>

                      {/* name */}
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: INK }}>
                        {c.serviceName ?? "Untitled"}
                      </span>

                      {/* price */}
                      <span style={{ fontSize: 13, color: MUT, flexShrink: 0 }}>
                        {c.price != null ? `$${c.price}` : "—"}
                      </span>

                      {/* remove */}
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 12.5, color: ACC, padding: 0, font: "inherit",
                          textDecoration: "underline", textUnderlineOffset: 2, flexShrink: 0,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.55, margin: 0 }}>
                  These stay linked to the originals. Editing a component edits the listing it came
                  from, and a component that leaves approval takes the bundle out of sale with it.
                </p>
              </div>
            )}

            {/* ── delivery + price grid ───────────────────────────────────── */}
            <div
              style={{
                display: "grid", gap: 20, marginBottom: 22,
                gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
              }}
            >
              {/* delivery method */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: INK, marginBottom: 5 }}>
                  Delivery method
                </label>
                <input
                  readOnly
                  value={derivedMethod}
                  data-testid="input-derived-method"
                  style={{ ...inp, background: GRD, color: MUT }}
                />
                <p style={{ fontSize: 12.5, color: MUT, marginTop: 5, lineHeight: 1.5 }}>
                  <strong style={{ color: INK }}>Derived, not chosen.</strong> {derivedWhy}
                </p>
              </div>

              {/* bundle price */}
              <div>
                <label
                  htmlFor="bundle-price"
                  style={{ display: "block", fontSize: 13, fontWeight: 500, color: INK, marginBottom: 5 }}
                >
                  Bundle price
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13.5, color: MUT }}>$</span>
                  <input
                    id="bundle-price"
                    type="number"
                    min="1"
                    step="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                    data-testid="input-bundle-price"
                    style={{ ...inp, maxWidth: 120 }}
                  />
                </div>
                <p style={{ fontSize: 12.5, color: MUT, marginTop: 5, lineHeight: 1.5 }}>
                  {componentTotal > 0 && (
                    <>
                      Components total{" "}
                      <strong style={{ color: INK }}>${componentTotal}</strong> — {" "}
                    </>
                  )}
                  <strong style={{ color: INK }}>you set the bundle price.</strong> Nothing is
                  auto-summed and no discount is calculated for you; whatever you type is what a
                  traveler pays, in one booking.
                </p>
              </div>
            </div>

            {/* ── bundle name (auto-suggested, editable) ──────────────────── */}
            <div style={{ marginBottom: 22 }}>
              <label
                htmlFor="bundle-name"
                style={{ display: "block", fontSize: 13, fontWeight: 500, color: INK, marginBottom: 5 }}
              >
                Bundle name
              </label>
              <input
                id="bundle-name"
                value={bundleName}
                onChange={(e) => { setBundleName(e.target.value); setNameEdited(true); }}
                placeholder="e.g. Kyoto Full Experience"
                data-testid="input-bundle-name"
                style={inp}
              />
              <p style={{ fontSize: 12, color: MUT, marginTop: 4, lineHeight: 1.45 }}>
                Auto-suggested from your components — edit it any time before submitting.
              </p>
            </div>

            {/* ── submit footer ───────────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!formValid || createMutation.isPending}
                className="text-white"
                style={{ background: ACC, borderColor: ACC }}
                data-testid="button-submit-bundle"
              >
                {createMutation.isPending ? "Submitting…" : "Submit for review"}
              </Button>
              <span style={{ fontSize: 12.5, color: MUT }}>
                A bundle is reviewed like any other listing.
              </span>
              {!formValid && picked.length > 0 && (
                <span style={{ fontSize: 12, color: MUT }}>
                  {picked.length < 2
                    ? `Need ${2 - picked.length} more component${2 - picked.length === 1 ? "" : "s"}.`
                    : bundleName.trim().length === 0
                      ? "Add a bundle name."
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
