/**
 * Provider Property Builder — the stepped create flow for new properties.
 *
 * Graduated from the ratified canvas mockup (PropertyStep1/2/3.tsx) into production.
 * Three steps: 1. The property · 2. Rooms · 3. Review.
 *
 * Replaces the in-workstation Dialog that served the same purpose. The Dialog state
 * (propertyBuilderOpen, etc.) is now live in this page; the EDITOR Dialog (editing
 * EXISTING properties) stays in workstation.tsx — this page is create-only.
 *
 * Write path: POST /api/provider/properties (server/routes/provider.routes.ts:557).
 * Rooms inherit the property pin (one placement locates the whole house).
 * Night availability is published on Catalog → Availability after creation.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { LocationPointPicker, type LocationPoint } from "@/components/backoffice/location-point-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

/* ── design tokens ─────────────────────────────────────────────────────── */
const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";

const CANCELLATION_OPTIONS = [
  "Flexible — full refund up to 5 days before check-in",
  "Moderate — full refund up to 14 days before check-in",
  "Strict — 50% refund up to 30 days before check-in",
];

const AMENITY_PRESETS = [
  "Wi-Fi",
  "Kitchen",
  "Air conditioning",
  "Washer",
  "Japanese bath (ofuro)",
  "Parking",
  "Air conditioning",
  "TV",
  "Breakfast included",
];

const AMENITY_GRID = [
  "Wi-Fi",
  "Kitchen",
  "Air conditioning",
  "Washer",
  "Japanese bath (ofuro)",
  "Parking",
];

interface RoomDraft {
  key: string;
  roomName: string;
  price: string;
  units: string;
}

function parseApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const match = err.message.match(/^\d+:\s*([\s\S]*)$/);
    const body = match ? match[1] : err.message;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) return parsed.message as string;
    } catch { /* raw body */ }
    return body || fallback;
  }
  return fallback;
}

type Step = "property" | "rooms" | "review";

export default function PropertyCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  /* ── step ── */
  const [step, setStep] = useState<Step>("property");

  /* ── step 1 state ── */
  const [propName, setPropName] = useState("");
  const [propCancellation, setPropCancellation] = useState(CANCELLATION_OPTIONS[1]);
  const [propDescription, setPropDescription] = useState("");
  const [propLocation, setPropLocation] = useState("");
  const [propPoint, setPropPoint] = useState<LocationPoint | null>(null);
  const [propCheckIn, setPropCheckIn] = useState("");
  const [propCheckOut, setPropCheckOut] = useState("");
  const [propMinStay, setPropMinStay] = useState("");
  const [propHouseRules, setPropHouseRules] = useState("");
  const [amenities, setAmenities] = useState<string[]>(["Wi-Fi", "Kitchen", "Air conditioning"]);
  const [amenityDraft, setAmenityDraft] = useState("");
  const [propertyPhotos, setPropertyPhotos] = useState<{ name: string; url: string }[]>([]);
  const [roomPhotos, setRoomPhotos] = useState<Record<string, { name: string; url: string }[]>>({});
  const [draftStatus, setDraftStatus] = useState<"loading" | "saved" | "saving">("loading");
  const draftHydrated = useRef(false);
  const draftKey = "provider-property-create-draft";
  const [roomDrafts, setRoomDrafts] = useState<RoomDraft[]>([
    { key: "r0", roomName: "", price: "", units: "" },
  ]);

  // Creation is intentionally resumable in this browser. There is no server draft endpoint
  // behind POST /properties, so do not imply that an abandoned form has been submitted.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        setStep(d.step === "rooms" || d.step === "review" ? d.step : "property");
        setPropName(d.propName ?? ""); setPropCancellation(d.propCancellation ?? CANCELLATION_OPTIONS[1]);
        setPropDescription(d.propDescription ?? ""); setPropLocation(d.propLocation ?? "");
        setPropPoint(d.propPoint ?? null); setPropCheckIn(d.propCheckIn ?? "");
        setPropCheckOut(d.propCheckOut ?? ""); setPropMinStay(d.propMinStay ?? "");
        setPropHouseRules(d.propHouseRules ?? ""); setAmenities(d.amenities ?? ["Wi-Fi", "Kitchen", "Air conditioning"]);
        setRoomDrafts(d.roomDrafts?.length ? d.roomDrafts : [{ key: "r0", roomName: "", price: "", units: "" }]);
      }
    } catch { /* A damaged local draft must never prevent starting a new property. */ }
    draftHydrated.current = true;
    setDraftStatus("saved");
  }, []);

  useEffect(() => {
    if (!draftHydrated.current) return;
    setDraftStatus("saving");
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify({
          step, propName, propCancellation, propDescription, propLocation, propPoint,
          propCheckIn, propCheckOut, propMinStay, propHouseRules, amenities, roomDrafts,
        }));
        setDraftStatus("saved");
      } catch { setDraftStatus("saved"); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [step, propName, propCancellation, propDescription, propLocation, propPoint, propCheckIn,
    propCheckOut, propMinStay, propHouseRules, amenities, roomDrafts]);

  function addPhotos(files: FileList | null, roomKey?: string) {
    if (!files) return;
    const photos = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 6)
      .map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
    if (roomKey) setRoomPhotos((prev) => ({ ...prev, [roomKey]: [...(prev[roomKey] ?? []), ...photos] }));
    else setPropertyPhotos((prev) => [...prev, ...photos]);
  }

  /* ── validation ── */
  const step1Valid = propName.trim().length > 0;
  const roomsValid =
    roomDrafts.length > 0 &&
    roomDrafts.every((r) => {
      const p = parseFloat(r.price);
      return r.roomName.trim().length > 0 && Number.isFinite(p) && p > 0;
    });
  const formValid = step1Valid && roomsValid;

  /* ── room helpers ── */
  function addRoom() {
    setRoomDrafts((prev) => [
      ...prev,
      { key: `r${Date.now()}-${prev.length}`, roomName: "", price: "", units: "" },
    ]);
  }
  function removeRoom(key: string) {
    setRoomDrafts((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }
  function updateRoom(key: string, patch: Partial<RoomDraft>) {
    setRoomDrafts((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  /* ── amenity helpers ── */
  function toggleAmenityPreset(label: string) {
    setAmenities((prev) =>
      prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label],
    );
  }
  function addCustomAmenity() {
    const v = amenityDraft.trim();
    if (!v || amenities.includes(v)) { setAmenityDraft(""); return; }
    setAmenities((prev) => [...prev, v]);
    setAmenityDraft("");
  }

  /* ── create mutation ── */
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/properties", {
        serviceName: propName.trim(),
        description: propDescription.trim() || undefined,
        location: propLocation.trim() || undefined,
        ...(propPoint ? { locationPoint: propPoint } : {}),
        cancellationPolicy: propCancellation || undefined,
        checkInTime: propCheckIn.trim() || undefined,
        checkOutTime: propCheckOut.trim() || undefined,
        houseRules: propHouseRules.trim() || undefined,
        amenities: amenities.length > 0 ? amenities : undefined,
        minStayNights: propMinStay.trim() ? Number(propMinStay) : undefined,
        rooms: roomDrafts.map((r) => ({
          roomName: r.roomName.trim(),
          price: r.price,
          ...(r.units.trim() ? { units: parseInt(r.units, 10) } : {}),
        })),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({
        title: "Property submitted for review",
        description:
          "It appears in your Catalog and goes live once approved. Publish night availability on each room next.",
      });
       try { window.localStorage.removeItem(draftKey); } catch { /* ignore storage failures */ }
       const firstRoomId = Array.isArray(data?.rooms) ? data.rooms[0]?.id : undefined;
       navigate(firstRoomId ? `/provider/availability?serviceId=${firstRoomId}` : "/provider/workstation");
    },
    onError: (err) => {
      toast({
        title: "Could not create property",
        description: parseApiErrorMessage(err, "Please check the fields and try again."),
        variant: "destructive",
      });
    },
  });

  const steps: { key: Step; label: string }[] = [
    { key: "property", label: "1. The property" },
    { key: "rooms", label: "2. Rooms" },
    { key: "review", label: "3. Review" },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <ProviderLayout title="New property">
      <div className="p-6" style={{ color: INK }}>
        {/* back link */}
        <Link
          href="/provider/workstation"
          style={{
            color: ACC, fontSize: 13, textDecoration: "underline", textUnderlineOffset: 2,
            display: "inline-block", marginBottom: 14,
          }}
          data-testid="link-property-back-to-workstation"
        >
          ← Back to "What are you building?"
        </Link>

        {/* main card */}
        <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
          {/* card header — property name + step pills */}
          <div
            style={{
              padding: "14px 22px", borderBottom: `1px solid ${HAIR}`,
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>New property</h3>
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
              {steps.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    if (i === 0) setStep("property");
                    if (i === 1 && step1Valid) setStep("rooms");
                    if (i === 2 && formValid) setStep("review");
                  }}
                  disabled={(i === 1 && !step1Valid) || (i === 2 && !formValid)}
                  style={{
                    border: `1px solid ${i === stepIndex ? INK : HAIR}`,
                    background: i === stepIndex ? INK : PAPER,
                    color: i === stepIndex ? "#fff" : MUT,
                    borderRadius: 100, padding: "5px 13px", fontSize: 12,
                    cursor: i === stepIndex ? "default" : "pointer",
                    fontFamily: "inherit", opacity: (i === 1 && !step1Valid) || (i === 2 && !formValid) ? 0.45 : 1,
                  }}
                  data-testid={`tab-property-step-${s.key}`}
                >
                  {s.label}
                </button>
              ))}
            </span>
          </div>

          {/* ── Step 1: The property ── */}
          {step === "property" && (
            <div style={{ padding: "20px 22px" }}>
              {/* intro note */}
              <div style={noteQuiet()}>
                A property is <b style={{ color: INK }}>the place</b>. What guests actually book
                are its rooms — that is the next step. Three steps total; nothing here is asked twice.
              </div>

              {/* name + cancellation — 2 col */}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, marginTop: 18 }}>
                <div>
                  <label style={lbl()}>Property name</label>
                  <input
                    style={inp()}
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                    maxLength={255}
                    placeholder="e.g. Machiya Guesthouse Kyoto"
                    data-testid="input-property-name"
                  />
                </div>
                <div>
                  <label style={lbl()}>Cancellation policy</label>
                  <select
                    style={inp()}
                    value={propCancellation}
                    onChange={(e) => setPropCancellation(e.target.value)}
                    data-testid="select-property-cancellation"
                  >
                    {CANCELLATION_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <div style={help()}>Stay-shaped windows, not the session policy — a night is not a slot.</div>
                </div>
              </div>

              {/* description */}
              <div style={{ marginTop: 16 }}>
                <label style={lbl()}>Description <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  style={{ ...inp(), resize: "vertical", minHeight: 64 }}
                  value={propDescription}
                  onChange={(e) => setPropDescription(e.target.value)}
                  placeholder="What makes this property worth staying at."
                  data-testid="input-property-description"
                />
              </div>

               {/* Photos are staged locally until the property has an id. The create API currently
                   has no property upload rail, so files are not sent to a made-up endpoint. */}
              <div style={{ marginTop: 16 }}>
                <label style={lbl()}>Photos <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span></label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
                   {propertyPhotos.slice(0, 3).map((photo) => (
                     <img key={photo.url} src={photo.url} alt={photo.name} style={{ ...photobox(), objectFit: "cover" }} />
                   ))}
                   {Array.from({ length: Math.max(0, 3 - propertyPhotos.length) }).map((_, i) => (
                     <div key={`empty-${i}`} style={photobox()}>▤</div>
                   ))}
                  <div
                    style={{ ...photobox(), borderStyle: "dashed", cursor: "pointer", color: MUT, background: GRD }}
                  >
                     <label style={{ cursor: "pointer", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                       + Add
                       <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                         onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
                         data-testid="input-property-photos" />
                     </label>
                  </div>
                </div>
                <div style={help()}>
                  Property photos are the building and the shared spaces. Each room carries its own photo on the next step.
                   Previews are saved only in this browser until submission; the current create API does not accept image uploads.
                </div>
              </div>

              {/* divider */}
              <div style={{ height: 1, background: HAIR, margin: "22px 0 16px" }} />

              {/* Where is it */}
              <h5 style={grouplabel()}>Where is it</h5>
              <div style={{ ...noteQuiet(), marginBottom: 14 }}>
                The <b style={{ color: INK }}>same confirm-gated pin</b> the create flow uses on
                its Logistics step — arm, click, confirm. No coordinate is ever derived from the
                address line; rooms inherit the property pin, so one placement locates the whole house.
              </div>

              {/* address line + pin picker */}
              <div style={{ marginBottom: 14 }}>
                <label style={lbl()}>Address / directions line <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span></label>
                <input
                  style={{ ...inp(), fontSize: 12.5 }}
                  value={propLocation}
                  onChange={(e) => setPropLocation(e.target.value)}
                  placeholder="e.g. Shimbashi-dori, Gion, Kyoto"
                  maxLength={255}
                  data-testid="input-property-location"
                />
                <div style={help()}>Display text shown to guests. The pin places you on the map; we never guess coordinates from text.</div>
              </div>

              <LocationPointPicker
                value={propPoint}
                precision={null}
                addressHint={propLocation}
                onChange={setPropPoint}
                label="Pin the property on the map (optional)"
                helpText="Confirming a pin places this property — and its rooms — accurately on planning maps."
                idPrefix="property-create-location"
              />

              {/* divider */}
              <div style={{ height: 1, background: HAIR, margin: "22px 0 16px" }} />

              {/* check-in / check-out / min stay — 3 col */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
                <div>
                  <label style={lbl()}>Check-in from <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span></label>
                  <input style={inp()} value={propCheckIn} onChange={(e) => setPropCheckIn(e.target.value)} placeholder="e.g. 15:00" data-testid="input-property-checkin" />
                </div>
                <div>
                  <label style={lbl()}>Check-out by <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span></label>
                  <input style={inp()} value={propCheckOut} onChange={(e) => setPropCheckOut(e.target.value)} placeholder="e.g. 11:00" data-testid="input-property-checkout" />
                </div>
                <div>
                  <label style={lbl()}>Minimum stay (nights) <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span></label>
                  <input
                    style={inp()} type="number" min={1} step={1}
                    value={propMinStay} onChange={(e) => setPropMinStay(e.target.value)}
                    placeholder="e.g. 2"
                    data-testid="input-property-minstay"
                  />
                </div>
              </div>

              {/* house rules */}
              <div style={{ marginTop: 16 }}>
                <label style={lbl()}>House rules <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  style={{ ...inp(), resize: "vertical", minHeight: 64 }}
                  value={propHouseRules}
                  onChange={(e) => setPropHouseRules(e.target.value)}
                  placeholder="e.g. Shoes off at the entrance. No smoking inside."
                  data-testid="input-property-houserules"
                />
              </div>

              {/* amenities */}
              <div style={{ marginTop: 16 }}>
                <label style={lbl()}>Amenities <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span></label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "9px 16px", marginBottom: 10 }}>
                  {AMENITY_GRID.map((label) => {
                    const on = amenities.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-checked={on}
                        onClick={() => toggleAmenityPreset(label)}
                        style={{
                          display: "flex", alignItems: "center", gap: 9, fontSize: 13, cursor: "pointer",
                          background: "none", border: "none", textAlign: "left", padding: "3px 0",
                          color: INK, fontFamily: "inherit",
                        }}
                        data-testid={`amenity-toggle-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                      >
                        <span
                          style={{
                            width: 17, height: 17, flex: "0 0 17px", borderRadius: 4,
                            border: `1.5px solid ${on ? ACC : HAIR}`, background: on ? ACC : PAPER,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {on && (
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                              <path d="M2 6.2L4.8 9 10 3.4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
                {/* custom amenity input */}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <input
                    style={{ ...inp(), flex: 1, fontSize: 12.5 }}
                    value={amenityDraft}
                    onChange={(e) => setAmenityDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomAmenity())}
                    placeholder="Add a custom amenity"
                    data-testid="input-amenity-draft"
                  />
                  <button
                    type="button"
                    onClick={addCustomAmenity}
                    style={{ ...btnGhostSm(), flexShrink: 0 }}
                  >
                    Add
                  </button>
                </div>
                {amenities.filter((a) => !AMENITY_GRID.includes(a)).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {amenities.filter((a) => !AMENITY_GRID.includes(a)).map((a) => (
                      <span
                        key={a}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5,
                          padding: "2px 8px 2px 10px", borderRadius: 100, border: `1px solid ${HAIR}`,
                          color: INK, background: GRD,
                        }}
                      >
                        {a}
                        <button
                          type="button"
                          onClick={() => setAmenities((prev) => prev.filter((x) => x !== a))}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: MUT, display: "flex" }}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Rooms ── */}
          {step === "rooms" && (
            <div style={{ padding: "20px 22px" }}>
              <div style={{ ...notice(), marginBottom: 18 }}>
                <b style={{ fontWeight: 650 }}>Each room becomes its own bookable listing under this property.</b>{" "}
                The property is the parent record, and every room is a child row a traveler can book by
                the night — so a booking, a review and a payout all attach to a room, not to the building.
              </div>

              {/* pin inheritance */}
              <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.55, marginBottom: 14 }}>
                <b style={{ color: INK }}>All rooms take their location from the property pin</b> — one
                placement locates the whole house.{" "}
                {!propPoint && (
                  <span style={{ color: WARN_INK }}>The pin is not placed yet, so no room is locatable. </span>
                )}
                {!propPoint && (
                  <button
                    type="button"
                    onClick={() => setStep("property")}
                    style={{ background: "none", border: "none", color: ACC, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}
                  >
                    Drop the pin on step 1 →
                  </button>
                )}
              </div>

              {/* room cards */}
              <div style={{ marginBottom: 10 }}>
                {roomDrafts.map((draft, idx) => (
                  <div
                    key={draft.key}
                    style={{
                      display: "flex", gap: 14, alignItems: "flex-start",
                      border: `1px solid ${HAIR}`, borderRadius: 6, padding: "12px 14px",
                      marginBottom: 10, flexWrap: "wrap",
                    }}
                    data-testid={`row-room-draft-${idx}`}
                  >
                    <label style={{ width: 56, height: 42, flex: "0 0 56px", borderRadius: 5, background: "#EDEBE3", border: `1px dashed ${HAIR}`, display: "flex", alignItems: "center", justifyContent: "center", color: MUT, cursor: "pointer", overflow: "hidden" }}>
                      {roomPhotos[draft.key]?.[0] ? <img src={roomPhotos[draft.key][0].url} alt="Room preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "+ Photo"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { addPhotos(e.target.files, draft.key); e.target.value = ""; }} data-testid={`input-room-photo-${idx}`} />
                    </label>

                    <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
                      <input
                        aria-label="Room name"
                        style={{ ...inp(), fontWeight: 600 }}
                        value={draft.roomName}
                        onChange={(e) => updateRoom(draft.key, { roomName: e.target.value })}
                        maxLength={255}
                        placeholder={`Room ${idx + 1} name, e.g. Garden View Double`}
                        data-testid={`input-room-draft-name-${idx}`}
                      />
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: MUT }}>
                        <span>Sleeps</span>
                        <input
                          aria-label="Sleeps"
                          style={{ ...inp(), maxWidth: 60, fontSize: 12.5 }}
                          type="number" min={1} step={1}
                          value={draft.units}
                          onChange={(e) => updateRoom(draft.key, { units: e.target.value })}
                          placeholder="—"
                          data-testid={`input-room-draft-units-${idx}`}
                        />
                        <span>$</span>
                        <input
                          aria-label="Nightly price"
                          style={{ ...inp(), maxWidth: 90, fontSize: 12.5 }}
                          type="number" min={0.01} step={0.01}
                          value={draft.price}
                          onChange={(e) => updateRoom(draft.key, { price: e.target.value })}
                          placeholder="0.00"
                          data-testid={`input-room-draft-price-${idx}`}
                        />
                        <span>per night</span>
                      </div>
                    </div>

                    {roomDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRoom(draft.key)}
                        style={{ background: "none", border: "none", color: MUT, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: "2px 0" }}
                        data-testid={`button-remove-room-draft-${idx}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addRoom}
                style={btnGhostSm()}
                data-testid="button-add-room-draft"
              >
                + Add a room
              </button>

              {/* per-night note */}
              <div style={{ ...noteQuiet(), marginTop: 16 }}>
                Prices are <b style={{ color: INK }}>per night</b> — the unit the single-service form cannot express,
                which is why this is its own builder. Seasonal pricing is not set here: it belongs to a published
                date range on <b style={{ color: INK }}>Availability</b>.
              </div>
            </div>
          )}

          {/* ── Step 3: Review ── */}
          {step === "review" && (
            <div style={{ padding: "20px 22px" }}>
              <div style={{ ...noteQuiet(), marginBottom: 18 }}>
                Review is honest about the one thing that actually stops a room being sold: nothing has
                published dates until you say so, and this builder does not pretend otherwise.
              </div>

               <div style={{ border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden", marginBottom: 18 }} data-testid="location-privacy-preview">
                 <div style={{ padding: "10px 12px", background: GRD, fontSize: 12.5, fontWeight: 600 }}>Location privacy preview</div>
                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                   <div style={{ padding: 12, borderTop: `1px solid ${HAIR}`, borderRight: `1px solid ${HAIR}` }}>
                     <div style={{ fontSize: 11, color: MUT, textTransform: "uppercase", letterSpacing: ".05em" }}>Before booking · provider</div>
                     <b style={{ display: "block", marginTop: 5, fontSize: 13 }}>Exact confirmed pin</b>
                     <span style={{ display: "block", color: MUT, fontSize: 11.5, marginTop: 3 }}>{propPoint ? "Visible for your planning maps." : "No pin confirmed yet."}</span>
                   </div>
                   <div style={{ padding: 12, borderTop: `1px solid ${HAIR}` }}>
                     <div style={{ fontSize: 11, color: MUT, textTransform: "uppercase", letterSpacing: ".05em" }}>After booking · guest</div>
                     <b style={{ display: "block", marginTop: 5, fontSize: 13 }}>General area before confirmation</b>
                     <span style={{ display: "block", color: MUT, fontSize: 11.5, marginTop: 3 }}>Exact directions stay private until booking.</span>
                   </div>
                 </div>
                 <div style={{ padding: "8px 12px", fontSize: 11, color: WARN_INK, background: WARN_BG, borderTop: `1px solid ${WARN_LINE}` }}>
                   Preview only: the create API stores the pin and display line but has no separate privacy setting.
                 </div>
               </div>

              {/* summary rows */}
              <SumRow k="Property" v={propName.trim() || "—"} />
              <SumRow k="Rooms" v={`${roomDrafts.length} — each one bookable on its own`} />
              <SumRow k="Cancellation" v={propCancellation} />
              <SumRow k="Location" v={
                propPoint
                  ? (propLocation.trim() ? `Pin placed · ${propLocation.trim()}` : "Pin placed")
                  : (propLocation.trim() || <span style={{ color: WARN_INK }}>No pin placed — property will not appear on any map.</span>)
              } />
              {amenities.length > 0 && (
                <SumRow k="Amenities" v={amenities.join(" · ")} />
              )}
              {(propCheckIn || propCheckOut) && (
                <SumRow k="Check-in / out" v={`${propCheckIn || "—"} / ${propCheckOut || "—"}`} />
              )}
              {propMinStay && <SumRow k="Min stay" v={`${propMinStay} night${propMinStay === "1" ? "" : "s"}`} />}
              {propDescription.trim() && (
                <SumRow k="Description" v={propDescription.trim()} last />
              )}

              {/* Can a traveler book this? */}
              <h5 style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: MUT, fontWeight: 600, margin: "20px 0 10px" }}>
                Can a traveler book this?
              </h5>
              <div style={{ border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden" }}>
                <StopRow
                  ok={!!propPoint}
                  name={<><b>The property itself</b><span> · {roomDrafts.length} room{roomDrafts.length === 1 ? "" : "s"} inherit this</span></>}
                  flag="Not yet locatable — drop the pin on step 1"
                  okText="Located — rooms inherit this pin"
                />
                {roomDrafts.map((r, idx) => (
                  <StopRow
                    key={r.key}
                    ok={false}
                    name={<><b>{r.roomName.trim() || `Room ${idx + 1}`}</b><span> · {r.units ? `sleeps ${r.units} · ` : ""}${r.price} per night</span></>}
                    flag="Not yet bookable — no date ranges published"
                    last={idx === roomDrafts.length - 1}
                  />
                ))}
              </div>

              <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.55, marginTop: 10 }}>
                <b style={{ color: INK }}>All rooms take their location from the property pin</b> — one
                placement locates the whole house, so a room is never asked where it is and two rooms
                can never disagree about it.
              </div>

              {/* not yet bookable notice */}
              <div style={{ ...notice(), marginTop: 16 }}>
                <b style={{ fontWeight: 650 }}>Not yet bookable.</b> A room with no published date range
                is a listing nobody can buy. Nightly dates live on{" "}
                <b style={{ fontWeight: 650 }}>Catalog → Availability</b>, beside the listing — this
                builder deep-links there rather than growing a second calendar of its own.
              </div>

              {/* submit */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={!formValid || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                  style={{
                    border: `1px solid ${ACC}`, background: ACC, color: "#fff",
                    padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5,
                    fontWeight: 550, fontFamily: "inherit",
                    opacity: !formValid || createMutation.isPending ? 0.6 : 1,
                  }}
                  data-testid="button-property-submit"
                >
                  {createMutation.isPending ? "Saving…" : "Submit for review"}
                </button>
                <span style={{ fontSize: 12.5, color: MUT }}>
                  A property and its rooms are reviewed like any other listing.
                </span>
              </div>
            </div>
          )}

          {/* card footer — navigation */}
          <div
            style={{
              padding: "0 22px 20px", paddingTop: 0,
              borderTop: `1px solid ${HAIR}`, marginTop: step === "property" ? 0 : 0,
            }}
          >
            <div style={{ paddingTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {step !== "property" && (
                <button
                  type="button"
                  onClick={() => setStep(step === "review" ? "rooms" : "property")}
                  style={btnGhost()}
                  data-testid="button-property-back"
                >
                  ← Back
                </button>
              )}
              {step === "property" && (
                <button
                  type="button"
                  disabled={!step1Valid}
                  onClick={() => setStep("rooms")}
                  style={{ ...btn(), opacity: step1Valid ? 1 : 0.5 }}
                  data-testid="button-property-next"
                >
                  Next: Rooms →
                </button>
              )}
              {step === "rooms" && (
                <button
                  type="button"
                  disabled={!roomsValid}
                  onClick={() => setStep("review")}
                  style={{ ...btn(), opacity: roomsValid ? 1 : 0.5 }}
                  data-testid="button-property-next-review"
                >
                  Next: Review →
                </button>
              )}
              {step === "property" && (
                <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }} data-testid="text-property-draft-status">
                  {draftStatus === "saving" ? "Saving draft…" : draftStatus === "loading" ? "Restoring draft…" : "Draft saved in this browser"}
                </span>
              )}
              {step === "rooms" && (
                <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>
                  {roomDrafts.length} room{roomDrafts.length === 1 ? "" : "s"} — each one bookable on its own
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProviderLayout>
  );
}

/* ── sub-components ───────────────────────────────────────────────────── */

function SumRow({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex", gap: 14, padding: "9px 0",
        borderBottom: last ? "none" : `1px solid ${HAIR}`,
        fontSize: 13, flexWrap: "wrap",
      }}
    >
      <div style={{ width: 180, flex: "0 0 180px", color: MUT }}>{k}</div>
      <div style={{ flex: 1, minWidth: 200 }}>{v}</div>
    </div>
  );
}

function StopRow({
  ok, name, flag, okText, last,
}: {
  ok: boolean; name: React.ReactNode; flag?: string; okText?: string; last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 11, padding: "10px 12px",
        borderBottom: last ? "none" : `1px solid ${HAIR}`, fontSize: 13, flexWrap: "wrap",
      }}
    >
      <span
        style={{
          width: 20, height: 20, flex: "0 0 20px", borderRadius: 100,
          background: ok ? GRD : WARN_BG, color: ok ? MUT : WARN_INK,
          border: `1px solid ${ok ? HAIR : WARN_LINE}`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
        }}
      >
        {ok ? "✓" : "–"}
      </span>
      <span style={{ flex: 1, minWidth: 150 }}>{name}</span>
      {ok ? (
        <span style={{ fontSize: 11.5, color: ACC }}>{okText}</span>
      ) : (
        <span
          style={{
            fontSize: 11.5, color: "#8A6A22", background: WARN_BG,
            border: `1px solid ${WARN_LINE}`, borderRadius: 100, padding: "1px 8px",
          }}
        >
          {flag}
        </span>
      )}
    </div>
  );
}

/* ── style helpers ────────────────────────────────────────────────────── */
function lbl(): React.CSSProperties {
  return { display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5, color: INK };
}
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 11px", border: `1px solid ${HAIR}`, borderRadius: 6,
    background: PAPER, color: INK, font: "inherit", fontSize: 13.5, boxSizing: "border-box",
  };
}
function help(): React.CSSProperties {
  return { fontSize: 12, color: MUT, marginTop: 5, lineHeight: 1.5 };
}
function noteQuiet(): React.CSSProperties {
  return { background: GRD, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUT, lineHeight: 1.5 };
}
function notice(): React.CSSProperties {
  return { background: WARN_BG, border: `1px solid ${WARN_LINE}`, color: WARN_INK, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, lineHeight: 1.5 };
}
function grouplabel(): React.CSSProperties {
  return { fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: MUT, fontWeight: 600, marginBottom: 10, marginTop: 0 };
}
function photobox(): React.CSSProperties {
  return {
    height: 74, borderRadius: 6, background: "#EDEBE3", border: `1px solid ${HAIR}`,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#B8B6AC",
  };
}
function btn(): React.CSSProperties {
  return { border: `1px solid ${INK}`, background: INK, color: "#fff", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, fontFamily: "inherit" };
}
function btnGhost(): React.CSSProperties {
  return { border: `1px solid ${HAIR}`, background: "transparent", color: INK, padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, fontFamily: "inherit" };
}
function btnGhostSm(): React.CSSProperties {
  return { border: `1px solid ${HAIR}`, background: "transparent", color: INK, padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, whiteSpace: "nowrap", fontFamily: "inherit" };
}
