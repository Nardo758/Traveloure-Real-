/**
 * Create Service Wizard — graduated from provider-console mockups.
 * Route: /provider/services/new?step=1
 *        /provider/services/new?step=2&id=:draftId
 *
 * Steps by delivery method:
 *   in_person / hybrid   → Basics → Scheduling → Capacity → Logistics → Review (5)
 *   video_call / phone   → Basics → Session    → Review (3)
 *   async / voice_notes  → Basics → Async      → Review (3)
 *   pdf_guide            → Basics → Artifact   → Review (3)
 */
import { useState, useEffect, useCallback, useContext, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { APIProvider, Map, useMapsLibrary, GoogleMapsContext } from "@vis.gl/react-google-maps";
import { MapMarker, GOOGLE_MAPS_MAP_ID } from "@/components/ui/map-marker";
import { Polyline } from "@/components/ui/map-polyline";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const MAPS_KEY: string = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || "";

// ─── design tokens ────────────────────────────────────────────────────────────
const INK  = "#1A1A18";
const MUT  = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD  = "#FAFAF8";
const PAP  = "#FFFFFF";
const ACC  = "#35605A";
const ACCS = "#EDF2F1";
const WBG  = "#FBF6EC";
const WLN  = "#D9C79A";
const WINK = "#6B551F";

// ─── types ────────────────────────────────────────────────────────────────────
type DeliveryMethod =
  | "in_person" | "video_call" | "phone_call"
  | "async_messaging" | "voice_notes" | "pdf_guide" | "hybrid";

interface ServiceCategory { id: string; name: string; slug?: string; }

interface DraftState {
  // Step 1 — Basics
  categoryId: string;
  categoryName: string;
  serviceName: string;
  deliveryMethod: DeliveryMethod;
  price: string;
  priceBasedOn: string;
  shortDescription: string;
  // Step 2A — Scheduling
  durationValue: string;
  durationUnit: string;
  leadTimeValue: string;
  leadTimeUnit: string;
  changeCutoffValue: string;
  changeCutoffUnit: string;
  earliestStartTime: string;
  latestStartTime: string;
  bookingMode: string;
  bringNotes: string;
  accessNotes: string;
  attestInsurance: boolean;
  attestConduct: boolean;
  // Step 2B — Session
  sessionPlatform: string;
  joinLink: string;
  providerTimezone: string;
  sessionLanguages: string;
  sessionCapacity: string;
  groupSize: string;
  deliverable: string;
  // Step 2C — Async
  asyncDeliveryMedium: string;
  engagementWindow: string;
  engagementUnit: string;
  responseWindowHours: string;
  scopeStatement: string;
  // Step 2D — Artifact
  artifactDescription: string;
  fulfillmentSpeed: string;
  samplePages: string;
  fileUploaded: boolean;
  // Step 3 — Capacity
  partySizeMin: string;
  partySizeMax: string;
  seatingType: string;
  // Step 4 — Logistics
  meetingPoint: string;
  meetingLat: number | null;
  meetingLng: number | null;
  collectsAndDrops: boolean;
  serviceRadius: string;
  stopNames: string[];
  stopPositions: Array<{ lat: number; lng: number } | null>;
}

const BLANK: DraftState = {
  categoryId: "", categoryName: "", serviceName: "",
  deliveryMethod: "in_person", price: "", priceBasedOn: "per person",
  shortDescription: "",
  durationValue: "90", durationUnit: "minutes",
  leadTimeValue: "24", leadTimeUnit: "hours",
  changeCutoffValue: "24", changeCutoffUnit: "hours before",
  earliestStartTime: "10:00", latestStartTime: "16:00",
  bookingMode: "request", bringNotes: "", accessNotes: "",
  attestInsurance: false, attestConduct: false,
  sessionPlatform: "traveloure", joinLink: "",
  providerTimezone: "Japan (GMT+9)", sessionLanguages: "",
  sessionCapacity: "1on1", groupSize: "6", deliverable: "",
  asyncDeliveryMedium: "Messages in Traveloure chat",
  engagementWindow: "5", engagementUnit: "days from first message",
  responseWindowHours: "24", scopeStatement: "",
  artifactDescription: "", fulfillmentSpeed: "Instantly — it is already written",
  samplePages: "First 3 pages, free", fileUploaded: false,
  partySizeMin: "1", partySizeMax: "4", seatingType: "private",
  meetingPoint: "", meetingLat: null, meetingLng: null,
  collectsAndDrops: false,
  serviceRadius: "8", stopNames: ["", "", ""],
  stopPositions: [null, null, null],
};

// ─── step config ──────────────────────────────────────────────────────────────
function getStepList(m: DeliveryMethod): string[] {
  if (m === "in_person" || m === "hybrid")
    return ["Basics", "Scheduling", "Capacity", "Logistics", "Review & submit"];
  if (m === "video_call" || m === "phone_call")
    return ["Basics", "Session details", "Review & submit"];
  if (m === "async_messaging" || m === "voice_notes")
    return ["Basics", "Async details", "Review & submit"];
  if (m === "pdf_guide")
    return ["Basics", "What they get", "Review & submit"];
  return ["Basics", "Scheduling", "Capacity", "Logistics", "Review & submit"];
}

// which step index is the "review" screen?
function reviewIndex(m: DeliveryMethod): number {
  return getStepList(m).length - 1;
}

// ─── shared field components ──────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: `1px solid ${HAIR}`,
  borderRadius: 6, background: PAP, color: INK, font: "inherit", fontSize: 13.5,
  outline: "none", boxSizing: "border-box",
};
const fieldLabel: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5, color: INK,
};
const helpTxt: React.CSSProperties = {
  fontSize: 12, color: MUT, marginTop: 5, lineHeight: 1.5,
};

function Label({ children }: { children: React.ReactNode }) {
  return <label style={fieldLabel}>{children}</label>;
}
function Help({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...helpTxt, ...style }}>{children}</div>;
}
function Row({ children, cols }: { children: React.ReactNode; cols?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols ?? "1fr 1fr", gap: 16, marginBottom: 16 }}>
      {children}
    </div>
  );
}
function Field({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 0 }}>{children}</div>;
}
function Divider() {
  return <div style={{ height: 1, background: HAIR, margin: "4px 0 18px" }} />;
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase",
      color: MUT, fontWeight: 600, marginBottom: 10 }}>
      {children}
    </div>
  );
}
function InfoNote({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: GRD, border: `1px dashed ${HAIR}`, borderRadius: 6,
      padding: "11px 14px", fontSize: 12.5, color: MUT, lineHeight: 1.5, marginBottom: 16, ...style }}>
      {children}
    </div>
  );
}
function WarnNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: WBG, border: `1px solid ${WLN}`, borderRadius: 6,
      padding: "11px 14px", fontSize: 12.5, color: WINK, lineHeight: 1.5, marginBottom: 16 }}>
      {children}
    </div>
  );
}
function DotGhost({ ch }: { ch: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 17, height: 17, borderRadius: 100, background: ACCS, color: ACC,
      border: "1px solid #CBDAD7", fontSize: 11, lineHeight: 1, fontWeight: 600,
      verticalAlign: "middle", marginLeft: 6 }}>
      {ch}
    </span>
  );
}

// ─── method tile ──────────────────────────────────────────────────────────────
function MethodTile({ id, label, sub, selected, onSelect }: {
  id: DeliveryMethod; label: string; sub: string;
  selected: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        border: `1px solid ${selected ? ACC : HAIR}`,
        borderRadius: 7, background: selected ? ACCS : PAP,
        padding: "11px 12px", cursor: "pointer", textAlign: "left",
        font: "inherit", boxShadow: selected ? `inset 0 0 0 1px ${ACC}` : "none",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, display: "block",
        marginBottom: 2, color: INK }}>{label}</span>
      <span style={{ fontSize: 11.5, color: selected ? ACC : MUT,
        display: "block", lineHeight: 1.35 }}>{sub}</span>
    </button>
  );
}

// ─── step sidebar panel ───────────────────────────────────────────────────────
function StepPanel({ steps, cur, method }: {
  steps: string[]; cur: number; method: DeliveryMethod;
}) {
  const isLong = steps.length === 5;
  const methodNote: Record<DeliveryMethod, string> = {
    in_person: `${steps.length} steps for "In person". Scheduling, Capacity and the new Logistics step (4th) are here because this method happens somewhere.`,
    hybrid: `${steps.length} steps for "Hybrid". Everything spatial and temporal applies.`,
    video_call: `${steps.length} steps for "Video call". No location, transport or travel-surcharge questions anywhere in this flow.`,
    phone_call: `${steps.length} steps for "Phone call". No location or transport questions in this flow.`,
    async_messaging: `${steps.length} steps for "Async messaging". No location, transport or travel-surcharge questions anywhere in this flow.`,
    voice_notes: `${steps.length} steps for "Voice notes". No location, transport or travel-surcharge questions anywhere in this flow.`,
    pdf_guide: `${steps.length} steps for "PDF guide". No location, transport or travel-surcharge questions anywhere in this flow — a guide is not delivered somewhere.`,
  };

  return (
    <aside style={{ background: PAP, border: `1px solid ${HAIR}`, borderRadius: 7,
      padding: "16px 14px", alignSelf: "start", position: "sticky", top: 24 }}>
      <div style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase",
        color: MUT, fontWeight: 600, marginBottom: 12 }}>Steps</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {steps.map((s, i) => {
          const done = i < cur;
          const active = i === cur;
          return (
            <li key={s} style={{ display: "flex", alignItems: "center", gap: 10,
              padding: "7px 8px", borderRadius: 5,
              background: active ? ACCS : "transparent",
              boxShadow: active ? `inset 0 0 0 1px #CBDAD7` : "none" }}>
              <span style={{
                width: 20, height: 20, borderRadius: 100, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, lineHeight: 1,
                background: done ? ACC : active ? ACC : "transparent",
                color: (done || active) ? "#fff" : MUT,
                border: (done || active) ? "none" : `1.5px solid ${HAIR}`,
              }}>
                {done ? "✓" : i + 1}
              </span>
              <span style={{ fontSize: 13, color: active ? ACC : done ? INK : MUT,
                fontWeight: active ? 600 : 400 }}>{s}</span>
            </li>
          );
        })}
      </ol>
      <div style={{ marginTop: 14, fontSize: 12, color: MUT, lineHeight: 1.55,
        paddingTop: 14, borderTop: `1px solid ${HAIR}` }}>
        {methodNote[method]}
      </div>
      {isLong && (
        <div style={{ marginTop: 10, fontSize: 12, color: MUT, lineHeight: 1.55,
          background: GRD, borderRadius: 5, padding: "9px 10px" }}>
          The step list is generated from the delivery method. Nothing here is a fixed 4-step wizard.
        </div>
      )}
    </aside>
  );
}

// ─── step 1: basics ───────────────────────────────────────────────────────────
function StepBasics({ draft, set, categories, onNext, saving }: {
  draft: DraftState;
  set: (patch: Partial<DraftState>) => void;
  categories: ServiceCategory[];
  onNext: () => void;
  saving: boolean;
}) {
  const methods: { id: DeliveryMethod; label: string; sub: string }[] = [
    { id: "in_person",        label: "In person",       sub: "Place-anchored" },
    { id: "video_call",       label: "Video call",      sub: "Live, remote" },
    { id: "phone_call",       label: "Phone call",      sub: "Live, remote" },
    { id: "pdf_guide",        label: "PDF guide",       sub: "Artifact" },
    { id: "voice_notes",      label: "Voice notes",     sub: "Async lane" },
    { id: "async_messaging",  label: "Async messaging", sub: "Async lane" },
    { id: "hybrid",           label: "Hybrid",          sub: "In person + video" },
  ];

  const selectedCat = categories.find(c => c.id === draft.categoryId);

  return (
    <div style={{ padding: "20px 22px" }}>
      <InfoNote>
        <b style={{ color: INK }}>Screen 1 is the whole fast path.</b>{" "}
        Five fields, then a saved listing. Everything else can wait — and what waits is named for you afterwards.{" "}
        <DotGhost ch="✓" />
      </InfoNote>

      <Row>
        <Field>
          <Label>What are you offering?</Label>
          <select
            style={inp}
            value={draft.categoryId}
            onChange={e => {
              const cat = categories.find(c => c.id === e.target.value);
              set({ categoryId: e.target.value, categoryName: cat?.name ?? "" });
            }}
          >
            <option value="">Select a category</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedCat && (
            <Help>Category: {selectedCat.name}</Help>
          )}
        </Field>
        <Field>
          <Label>Name it</Label>
          <input
            style={inp}
            value={draft.serviceName}
            onChange={e => set({ serviceName: e.target.value })}
            placeholder="Morning Tea Ceremony in a Machiya Townhouse"
          />
          <Help>Travelers see this first.</Help>
        </Field>
      </Row>

      <div style={{ marginBottom: 16 }}>
        <Label>
          How do you deliver this?<DotGhost ch="●" />
        </Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 8 }}>
          {methods.slice(0, 4).map(m => (
            <MethodTile
              key={m.id} id={m.id} label={m.label} sub={m.sub}
              selected={draft.deliveryMethod === m.id}
              onSelect={() => set({ deliveryMethod: m.id })}
            />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {methods.slice(4).map(m => (
            <MethodTile
              key={m.id} id={m.id} label={m.label} sub={m.sub}
              selected={draft.deliveryMethod === m.id}
              onSelect={() => set({ deliveryMethod: m.id })}
            />
          ))}
        </div>
        <Help>This is asked second, not buried mid-form — because the rest of the form is built from the answer.</Help>
      </div>

      <Row>
        <Field>
          <Label>Price<DotGhost ch="④" /></Label>
          <div style={{ display: "flex", gap: 9 }}>
            <input
              style={{ ...inp, maxWidth: 120 }}
              value={draft.price}
              onChange={e => set({ price: e.target.value })}
              placeholder="$68"
            />
            <select
              style={{ ...inp, flex: 1 }}
              value={draft.priceBasedOn}
              onChange={e => set({ priceBasedOn: e.target.value })}
            >
              <option>per person</option>
              <option>per group</option>
              <option>per hour</option>
              <option>flat</option>
            </select>
          </div>
          <Help>
            One price. Surcharges, deposits and cancellation live in <b>Pricing &amp; fees</b> after you save — none of them are required to go live.
          </Help>
        </Field>
        <Field>
          <Label>One line about it</Label>
          <textarea
            style={{ ...inp, resize: "vertical", minHeight: 72 }}
            value={draft.shortDescription}
            onChange={e => set({ shortDescription: e.target.value })}
            placeholder="A 90-minute seated tea ceremony in my family machiya in Gion, with matcha and seasonal wagashi."
          />
          <Help>
            You can write the long version later.{" "}
            {draft.shortDescription.length > 0 && (
              <span>{draft.shortDescription.length} characters</span>
            )}{" "}
            — the draft checklist asks for 140+ before review, and reads it from this field.
          </Help>
        </Field>
      </Row>

      <div style={{ background: WBG, border: `1px solid ${WLN}`, color: WINK,
        borderRadius: 6, padding: "11px 14px", fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>
        <b style={{ fontWeight: 650 }}>Before you start:</b> listings are reviewed by our team before they go live — usually within 2 business days. Saving a draft costs you nothing and does not start the review.
      </div>
    </div>
  );
}

// ─── step 2A: scheduling (in_person / hybrid) ─────────────────────────────────
function StepScheduling({ draft, set }: { draft: DraftState; set: (p: Partial<DraftState>) => void }) {
  return (
    <div style={{ padding: "20px 22px" }}>

      {/* Renamed-step banner — matches the amber callout in the mockup */}
      <div style={{
        display: "grid", gridTemplateColumns: "auto 1fr", gap: 0,
        border: `1px solid ${WLN}`, borderRadius: 6, marginBottom: 20, overflow: "hidden",
      }}>
        <div style={{
          background: WBG, borderRight: `1px solid ${WLN}`,
          padding: "10px 12px", display: "flex", alignItems: "center",
        }}>
          <span style={{
            fontSize: 11.5, fontWeight: 550, color: WINK,
            background: PAP, border: `1px solid ${WLN}`, borderRadius: 100,
            padding: "2px 9px", whiteSpace: "nowrap",
          }}>
            renamed — amend if you prefer
          </span>
        </div>
        <div style={{ background: WBG, padding: "10px 14px", fontSize: 12.5, color: WINK, lineHeight: 1.5 }}>
          Previously called <b style={{ fontWeight: 650 }}>Logistics</b>. The name{" "}
          <b style={{ fontWeight: 650 }}>Logistics</b> now belongs to the new 4th step, which is
          where everything spatial went. Say the word and we will call this something else.
        </div>
      </div>

      {/* Row 1: duration · lead time · change cutoff */}
      <Row cols="1fr 1fr 1fr">
        <Field>
          <Label>How long does it take?</Label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inp, maxWidth: 72 }} value={draft.durationValue}
              onChange={e => set({ durationValue: e.target.value })} />
            <select style={inp} value={draft.durationUnit}
              onChange={e => set({ durationUnit: e.target.value })}>
              <option>minutes</option>
              <option>hours</option>
              <option>days</option>
            </select>
          </div>
          <Help>Asked once. Today the same answer is collected twice, in two different units.</Help>
        </Field>
        <Field>
          <Label>Notice you need before a booking</Label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inp, maxWidth: 72 }} value={draft.leadTimeValue}
              onChange={e => set({ leadTimeValue: e.target.value })} />
            <select style={inp} value={draft.leadTimeUnit}
              onChange={e => set({ leadTimeUnit: e.target.value })}>
              <option>hours</option>
              <option>days</option>
            </select>
          </div>
          <Help>Below this, the slot stops being bookable — enforced at checkout, not just displayed.</Help>
        </Field>
        <Field>
          <Label>Guests can change up to</Label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inp, maxWidth: 72 }} value={draft.changeCutoffValue}
              onChange={e => set({ changeCutoffValue: e.target.value })} />
            <select style={inp} value={draft.changeCutoffUnit}
              onChange={e => set({ changeCutoffUnit: e.target.value })}>
              <option>hours before</option>
              <option>days before</option>
            </select>
          </div>
          <Help>Your change cutoff. The only one of these fields the server already reads today.</Help>
        </Field>
      </Row>

      {/* Row 2: booking rule · start window */}
      <Row>
        <Field>
          <Label>Booking rule</Label>
          <select style={inp} value={draft.bookingMode}
            onChange={e => set({ bookingMode: e.target.value })}>
            <option value="request">Request first — I approve each booking</option>
            <option value="instant">Instant book</option>
          </select>
          <Help>Per listing, not per account.</Help>
        </Field>
        <Field>
          <Label>Start window</Label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input style={inp} value={draft.earliestStartTime} placeholder="10:00"
              onChange={e => set({ earliestStartTime: e.target.value })} />
            <span style={{ color: MUT, flexShrink: 0 }}>to</span>
            <input style={inp} value={draft.latestStartTime} placeholder="16:00"
              onChange={e => set({ latestStartTime: e.target.value })} />
          </div>
          <Help>Earliest and latest start you will take on a day you are open.</Help>
        </Field>
      </Row>

      {/* Row 3: bring/wear · access */}
      <Row>
        <Field>
          <Label>What should they bring or wear?</Label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 72 }}
            value={draft.bringNotes}
            onChange={e => set({ bringNotes: e.target.value })}
            placeholder="Socks without holes — you will be on tatami. Nothing else; kimono is provided if you want one." />
        </Field>
        <Field>
          <Label>Anything travelers should know about access?</Label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 72 }}
            value={draft.accessNotes}
            onChange={e => set({ accessNotes: e.target.value })}
            placeholder="One step up at the entrance and low seating. I can provide a low stool — tell me when you book." />
          <Help>Written in your words. We do not claim an accessibility standard on your behalf.</Help>
        </Field>
      </Row>

      <Divider />
      <SectionLabel>Safety basics</SectionLabel>
      <div style={{ background: GRD, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
        {([
          ["attestInsurance", "I hold public liability cover for this activity",
            "Required for in-person listings. Not asked at all for remote ones."],
          ["attestConduct", "I have read the in-person conduct standards",
            "Two minutes. Opens in a panel — you will not lose this draft."],
        ] as const).map(([field, title, desc]) => (
          <button
            key={field}
            type="button"
            onClick={() => set({ [field]: !draft[field] } as Partial<DraftState>)}
            style={{ width: "100%", background: "none", border: "none",
              borderBottom: field === "attestInsurance" ? `1px solid ${HAIR}` : "none",
              textAlign: "left", display: "flex", gap: 13, alignItems: "flex-start",
              padding: "14px 18px", cursor: "pointer", font: "inherit" }}
          >
            <span style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 5,
              border: draft[field] ? "none" : `1.5px solid ${HAIR}`,
              background: draft[field] ? ACC : PAP,
              display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
              {draft[field] && (
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10.5l4 4 8-9" stroke="#fff" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 550,
                color: INK }}>{title}</span>
              <span style={{ display: "block", fontSize: 12.5, color: MUT,
                marginTop: 2, lineHeight: 1.45 }}>{desc}</span>
            </span>
          </button>
        ))}
      </div>
      <Help>Both of these are what the draft checklist's "safety basics" row watches. It ticks when they are ticked here.</Help>
    </div>
  );
}

// ─── step 3: capacity (in_person / hybrid) ────────────────────────────────────
function StepCapacity({ draft, set }: { draft: DraftState; set: (p: Partial<DraftState>) => void }) {
  return (
    <div style={{ padding: "20px 22px" }}>

      {/* Renamed-step banner — previously called "Group" */}
      <div style={{
        display: "grid", gridTemplateColumns: "auto 1fr", gap: 0,
        border: `1px solid ${WLN}`, borderRadius: 6, marginBottom: 20, overflow: "hidden",
      }}>
        <div style={{
          background: WBG, borderRight: `1px solid ${WLN}`,
          padding: "10px 12px", display: "flex", alignItems: "center",
        }}>
          <span style={{
            fontSize: 11.5, fontWeight: 550, color: WINK,
            background: PAP, border: `1px solid ${WLN}`, borderRadius: 100,
            padding: "2px 9px", whiteSpace: "nowrap",
          }}>
            renamed — amend if you prefer
          </span>
        </div>
        <div style={{ background: WBG, padding: "10px 14px", fontSize: 12.5, color: WINK, lineHeight: 1.5 }}>
          Previously called <b style={{ fontWeight: 650 }}>Group</b>. The name{" "}
          <b style={{ fontWeight: 650 }}>Logistics</b> now belongs to the new 4th step, which is
          where everything spatial went. Say the word and we will call this something else.
        </div>
      </div>

      <Row>
        <Field>
          <Label>Party size</Label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={inp} value={draft.partySizeMin}
              onChange={e => set({ partySizeMin: e.target.value })}
              placeholder="1" aria-label="Minimum party size" />
            <span style={{ color: MUT, flexShrink: 0 }}>to</span>
            <input style={inp} value={draft.partySizeMax}
              onChange={e => set({ partySizeMax: e.target.value })}
              placeholder="4" aria-label="Maximum party size" />
          </div>
          <Help>
            One pair of numbers. Today capacity is asked three times, in three vocabularies. These are the numbers checkout refuses a booking against, so a traveler can never book a party you cannot take.
          </Help>
        </Field>
        <Field>
          <Label>Seating</Label>
          <select style={inp} value={draft.seatingType}
            onChange={e => set({ seatingType: e.target.value })}>
            <option value="private">Private — one party at a time</option>
            <option value="shared">Shared — I will seat several parties together</option>
          </select>
          <Help>Asked once, here, and rendered on the traveler's page in these words.</Help>
        </Field>
      </Row>

      <InfoNote>
        Capacity is its own step because it is the answer most often got wrong when it was buried in a 44-control screen — and because the new <b style={{ color: INK }}>Logistics</b> step needed the name this step used to share.
      </InfoNote>
    </div>
  );
}

// ─── logistics map helpers ─────────────────────────────────────────────────────

/** Draws a coverage circle on the Google Map using the Maps JS API directly. */
function CoverageCircle({ center, radiusKm }: {
  center: google.maps.LatLngLiteral;
  radiusKm: number;
}) {
  const mapsLib = useMapsLibrary("maps");
  const ctx = useContext(GoogleMapsContext);
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!mapsLib || !ctx?.map) return;
    if (!circleRef.current) {
      circleRef.current = new mapsLib.Circle({
        map: ctx.map,
        center,
        radius: radiusKm * 1000,
        strokeColor: ACC,
        strokeOpacity: 0.55,
        strokeWeight: 1.5,
        fillColor: ACC,
        fillOpacity: 0.05,
        zIndex: 1,
      });
    } else {
      circleRef.current.setOptions({ center, radius: radiusKm * 1000 });
    }
    return () => {
      circleRef.current?.setMap(null);
      circleRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsLib, ctx?.map, center.lat, center.lng, radiusKm]);

  return null;
}

/** Dashed straight connector between a stop and the meeting pin. */
function StopConnector({ from, to }: {
  from: google.maps.LatLngLiteral;
  to: google.maps.LatLngLiteral;
}) {
  return (
    <Polyline
      path={[from, to]}
      strokeOpacity={0}
      icons={[{
        icon: {
          path: "M 0,-1 0,1",
          strokeOpacity: 0.7,
          strokeColor: ACC,
          scale: 2.5,
        },
        offset: "0",
        repeat: "12px",
      }]}
      zIndex={2}
    />
  );
}

// ─── step 4: logistics / map authoring (in_person / hybrid) ───────────────────
function StepLogistics({ draft, set }: { draft: DraftState; set: (p: Partial<DraftState>) => void }) {
  type MapMode = "none" | "meeting" | "stop";
  const [mode, setMode] = useState<MapMode>("none");

  const stops     = draft.stopNames.length > 0 ? draft.stopNames : [""];
  const stopPos   = draft.stopPositions.length === stops.length
    ? draft.stopPositions
    : stops.map((_, i) => draft.stopPositions[i] ?? null);
  const radiusKm  = Math.max(1, parseInt(draft.serviceRadius, 10) || 8);
  const hasMeeting = draft.meetingLat !== null && draft.meetingLng !== null;
  const meetingPt: google.maps.LatLngLiteral | null = hasMeeting
    ? { lat: draft.meetingLat!, lng: draft.meetingLng! }
    : null;

  // Default map center: if pin set use it, else Kyoto city centre
  const mapCenter = meetingPt ?? { lat: 35.0116, lng: 135.7681 };

  const handleMapClick = useCallback((e: { detail?: { latLng?: { lat: number; lng: number } | null } }) => {
    const ll = e.detail?.latLng;
    if (!ll) return;
    if (mode === "meeting") {
      set({ meetingLat: ll.lat, meetingLng: ll.lng });
      setMode("none");
    } else if (mode === "stop") {
      const nextPos = [...stopPos];
      // Place on the first unpositioned stop, or add a new one
      const emptyIdx = nextPos.findIndex(p => p === null);
      if (emptyIdx >= 0) {
        nextPos[emptyIdx] = { lat: ll.lat, lng: ll.lng };
        set({ stopPositions: nextPos });
      } else {
        const nextNames = [...stops, ""];
        set({ stopNames: nextNames, stopPositions: [...nextPos, { lat: ll.lat, lng: ll.lng }] });
      }
      setMode("none");
    }
  }, [mode, stopPos, stops, set]);

  const setStopName = (i: number, v: string) => {
    const next = [...stops]; next[i] = v; set({ stopNames: next });
  };
  const addStop = () => {
    set({ stopNames: [...stops, ""], stopPositions: [...stopPos, null] });
  };
  const removeStop = (i: number) => {
    set({
      stopNames: stops.filter((_, idx) => idx !== i),
      stopPositions: stopPos.filter((_, idx) => idx !== i),
    });
  };

  const modeBtn = (m: MapMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(prev => prev === m ? "none" : m)}
      style={{
        background: mode === m ? INK : PAP,
        color: mode === m ? "#fff" : INK,
        border: `1px solid ${mode === m ? INK : HAIR}`,
        borderRadius: 5, padding: "6px 13px",
        fontSize: 12.5, fontWeight: 550, cursor: "pointer", font: "inherit",
        transition: "background 0.12s",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: "20px 22px" }}>

      {/* Info banner */}
      <InfoNote>
        <b style={{ color: INK }}>One card, one vocabulary.</b>{" "}
        Today this is six questions spread across two steps and a separate page: Meeting Point, map pin, Service Area, Pickup, Drop-off, and route stops.
        Here it is one canvas with one rail.{" "}
        <DotGhost ch="●" /> <DotGhost ch="●" />
      </InfoNote>

      {/* Aug 12 ruling banner */}
      <div style={{
        background: WBG, border: `1px solid ${WLN}`, borderRadius: 6,
        padding: "11px 14px", marginBottom: 18, fontSize: 12.5, color: WINK, lineHeight: 1.55,
      }}>
        <b style={{ fontWeight: 650 }}>Moved here by the Aug 12 ruling.</b>{" "}
        Map authoring is a creation job, not a catalog job. Catalog keeps a read-only traveler preview — this amends the
        earlier "Catalog is the map's authoring home" posture. Nothing about the write rails changed: one confirm-gated pin,
        stops as an ordered replace-list.
      </div>

      {/* Pickup toggle */}
      <div style={{ marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => set({ collectsAndDrops: !draft.collectsAndDrops })}
          style={{ display: "flex", alignItems: "center", gap: 11, background: "none",
            border: "none", cursor: "pointer", font: "inherit", padding: 0 }}
        >
          {/* Pill toggle */}
          <span style={{
            width: 38, height: 22, borderRadius: 100, flexShrink: 0, position: "relative",
            background: draft.collectsAndDrops ? ACC : HAIR,
            transition: "background 0.15s",
          }}>
            <span style={{
              position: "absolute", top: 3, left: draft.collectsAndDrops ? 19 : 3,
              width: 16, height: 16, borderRadius: "50%", background: PAP,
              transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 550, color: INK }}>
            I collect travelers and drop them back
          </span>
        </button>
        <Help style={{ marginLeft: 49 }}>
          Off by default. Pickup is a <b style={{ color: INK }}>spatial</b> question, so it lives on this step.
          How long the transfer takes is temporal — that stays in Scheduling.
          One transport question, one vocabulary, one step.
        </Help>
      </div>

      {/* Map canvas */}
      {MAPS_KEY ? (
        <APIProvider apiKey={MAPS_KEY}>
          <div style={{ border: `1px solid ${HAIR}`, borderRadius: 8, overflow: "hidden", marginBottom: 18 }}>
            {/* Toolbar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
              borderBottom: `1px solid ${HAIR}`, background: GRD,
            }}>
              <span style={{ flex: 1, fontSize: 12.5, color: MUT }}>
                {mode === "none"
                  ? "Nothing armed. Pick a mode, then click the map."
                  : mode === "meeting"
                    ? "Armed: click the map to set the meeting point."
                    : "Armed: click the map to place a stop."}
              </span>
              {modeBtn("meeting", "Move the meeting pin")}
              {modeBtn("stop", "Place a stop")}
            </div>

            {/* Map — cursor style applied to wrapper so armed modes show crosshair */}
            <div style={{ height: 340, cursor: mode !== "none" ? "crosshair" : undefined }}>
              <Map
                mapId={GOOGLE_MAPS_MAP_ID}
                defaultCenter={mapCenter}
                defaultZoom={hasMeeting ? 14 : 12}
                gestureHandling="greedy"
                disableDefaultUI={false}
                style={{ width: "100%", height: "100%" }}
                onClick={handleMapClick as any}
              >
                {/* Coverage circle */}
                {meetingPt && (
                  <CoverageCircle center={meetingPt} radiusKm={radiusKm} />
                )}

                {/* Meeting pin */}
                {meetingPt && (
                  <MapMarker
                    position={meetingPt}
                    draggable
                    onDragEnd={(e: any) => {
                      const ll = e?.latLng;
                      const lat = typeof ll?.lat === "function" ? ll.lat() : ll?.lat;
                      const lng = typeof ll?.lng === "function" ? ll.lng() : ll?.lng;
                      if (lat != null && lng != null) set({ meetingLat: lat, meetingLng: lng });
                    }}
                    title="Meeting point — drag to adjust"
                  >
                    <div style={{
                      background: ACC, color: PAP, borderRadius: 20,
                      padding: "4px 10px 4px 8px", fontSize: 11.5, fontWeight: 650,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.28)", display: "flex",
                      alignItems: "center", gap: 5, whiteSpace: "nowrap",
                    }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: "50%",
                        background: PAP, color: ACC,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 800,
                      }}>✦</span>
                      Meeting point
                    </div>
                  </MapMarker>
                )}

                {/* Stop pins + connectors */}
                {stopPos.map((pos, i) => pos && (
                  <div key={i}>
                    {meetingPt && (
                      <StopConnector from={pos} to={meetingPt} />
                    )}
                    <MapMarker
                      position={pos}
                      draggable
                      onDragEnd={(e: any) => {
                        const ll = e?.latLng;
                        const lat = typeof ll?.lat === "function" ? ll.lat() : ll?.lat;
                        const lng = typeof ll?.lng === "function" ? ll.lng() : ll?.lng;
                        if (lat != null && lng != null) {
                          const next = [...stopPos];
                          next[i] = { lat, lng };
                          set({ stopPositions: next });
                        }
                      }}
                      title={`Stop ${i + 1}${stops[i] ? ` — ${stops[i]}` : ""}`}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%",
                        background: INK, color: PAP,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 800,
                        boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
                      }}>
                        {i + 1}
                      </div>
                    </MapMarker>
                  </div>
                ))}
              </Map>
            </div>
          </div>
        </APIProvider>
      ) : (
        /* Fallback when no API key */
        <div style={{
          height: 120, background: GRD, border: `1px solid ${HAIR}`,
          borderRadius: 8, marginBottom: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, color: MUT,
        }}>
          Map unavailable — enter meeting point text below and continue.
        </div>
      )}

      {/* Meeting point text + service radius (below map for screenreaders / fallback) */}
      <Row>
        <Field>
          <Label>Meeting point address</Label>
          <input style={inp} value={draft.meetingPoint}
            onChange={e => set({ meetingPoint: e.target.value })}
            placeholder="e.g. Front gate of Kennin-ji Temple, Gion" />
          <Help>
            Shown on the booking card. Pin it on the map above for an exact location — the text here is your fallback label.
          </Help>
        </Field>
        <Field>
          <Label>Service radius (km)</Label>
          <input style={{ ...inp, maxWidth: 120 }} value={draft.serviceRadius}
            onChange={e => set({ serviceRadius: e.target.value })}
            placeholder="8" />
          <Help>Travelers outside this radius see "contact for travel surcharge". Shown as the circle on the map.</Help>
        </Field>
      </Row>

      {/* Stop names */}
      <div style={{ marginBottom: 16 }}>
        <Label>Route stops <span style={{ fontSize: 12, color: MUT, fontWeight: 400 }}>— optional</span></Label>
        <Help style={{ marginBottom: 10, marginTop: 0 }}>
          Name each stop after placing it on the map. Connectors are{" "}
          <b style={{ color: INK }}>sequence, not travel routing</b> — no distance is invented between them.
        </Help>
        <div style={{ background: GRD, border: `1px solid ${HAIR}`, borderRadius: 7, overflow: "hidden" }}>
          {stops.map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              borderBottom: i < stops.length - 1 ? `1px solid ${HAIR}` : "none",
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 100, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: stopPos[i] ? ACC : WBG,
                color: stopPos[i] ? PAP : WINK,
                border: stopPos[i] ? "none" : `1px solid ${WLN}`,
              }}>
                {stopPos[i] ? i + 1 : "–"}
              </span>
              <input
                style={{ ...inp, flex: 1, border: "1px solid transparent", background: "none",
                  padding: "3px 5px", fontSize: 12.5 }}
                value={s}
                onChange={e => setStopName(i, e.target.value)}
                placeholder={stopPos[i] ? `Stop ${i + 1} label` : `Place stop ${i + 1} on the map first`}
                aria-label={`Stop ${i + 1}`}
              />
              <button type="button" onClick={() => removeStop(i)}
                style={{ background: "none", border: "none", color: MUT, cursor: "pointer",
                  fontSize: 11.5, padding: 0, textDecoration: "underline", textUnderlineOffset: 2 }}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addStop}
          style={{ marginTop: 9, background: "none", border: `1px solid ${HAIR}`, color: INK,
            padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontSize: 12.5,
            fontWeight: 550, font: "inherit" }}>
          + Add a stop
        </button>
      </div>
    </div>
  );
}

// ─── step 2B: session (video_call / phone_call) ───────────────────────────────
// Common timezone options — named the way a person would say it, not IANA identifiers
const TIMEZONES = [
  "Hawaii (GMT-10)", "Alaska (GMT-9)", "Pacific (GMT-8)", "Mountain (GMT-7)",
  "Central (GMT-6)", "Eastern (GMT-5)", "Atlantic (GMT-4)",
  "London (GMT+0)", "Paris / Berlin (GMT+1)", "Athens / Helsinki (GMT+2)",
  "Moscow (GMT+3)", "Dubai (GMT+4)", "Karachi (GMT+5)",
  "India (GMT+5:30)", "Bangladesh (GMT+6)", "Bangkok (GMT+7)",
  "China / Singapore (GMT+8)", "Japan (GMT+9)", "Sydney (GMT+10)",
  "New Zealand (GMT+12)",
];

function StepSession({ draft, set }: { draft: DraftState; set: (p: Partial<DraftState>) => void }) {
  return (
    <div style={{ padding: "20px 22px" }}>

      {/* Info banner — replaces the "Proposed — gap #4" chip */}
      <InfoNote>
        <b style={{ color: INK }}>No location card, no transport question, no travel surcharge.</b>{" "}
        This method does not happen anywhere, so those questions are not asked — not disabled, not skipped over.
        Absent. What it does need is the three things a remote session actually turns on:{" "}
        <b style={{ color: INK }}>when you are reachable, where the call happens, and whether it is one person or a group.</b>{" "}
        <DotGhost ch="●" /> <DotGhost ch="●" />
      </InfoNote>

      {/* Row 1: duration · timezone */}
      <Row>
        <Field>
          <Label>How long is the call?</Label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inp, maxWidth: 72 }} value={draft.durationValue}
              onChange={e => set({ durationValue: e.target.value })} />
            <select style={inp} value={draft.durationUnit}
              onChange={e => set({ durationUnit: e.target.value })}>
              <option>minutes</option>
              <option>hours</option>
            </select>
          </div>
        </Field>
        <Field>
          <Label>Your timezone</Label>
          <select style={inp} value={draft.providerTimezone}
            onChange={e => set({ providerTimezone: e.target.value })}>
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <Help>
            Named the way a person would say it, not "Asia/Tokyo". Travelers see start times converted
            to their own clock — you never do that arithmetic.
          </Help>
        </Field>
      </Row>

      {/* Row 2: where it happens · languages */}
      <Row>
        <Field>
          <Label>Where does it happen?</Label>
          <select style={inp} value={draft.sessionPlatform}
            onChange={e => set({ sessionPlatform: e.target.value })}>
            <option value="traveloure">Traveloure video room</option>
            <option value="own">My own link</option>
          </select>
          {draft.sessionPlatform === "traveloure" ? (
            <Help>The default room needs nothing from you and cannot go stale.</Help>
          ) : (
            <>
              <input style={{ ...inp, marginTop: 8 }} value={draft.joinLink}
                onChange={e => set({ joinLink: e.target.value })}
                placeholder="https://meet.google.com/…" />
              <Help>Shared with the traveler only after booking is confirmed.</Help>
            </>
          )}
          <InfoNote style={{ marginTop: 8 }}>
            Choosing <b style={{ color: INK }}>my own link</b> reveals one field for it, and states plainly
            that the link is shared with the traveler only after booking.
          </InfoNote>
        </Field>
        <Field>
          <Label>Languages you can run it in</Label>
          <input style={inp} value={draft.sessionLanguages}
            onChange={e => set({ sessionLanguages: e.target.value })}
            placeholder="English, Japanese" />
        </Field>
      </Row>

      {/* Is this one-on-one, or a group? */}
      <div style={{ marginBottom: 16 }}>
        <Label>Is this one-on-one, or a group?</Label>
        <div style={{ display: "inline-flex", border: `1px solid ${HAIR}`, borderRadius: 6,
          overflow: "hidden", marginBottom: 8 }}>
          {([["1on1", "One-on-one"], ["group", "A group can join"]] as const).map(([k, label], i) => (
            <button key={k} type="button" onClick={() => set({ sessionCapacity: k })}
              style={{ background: draft.sessionCapacity === k ? INK : PAP,
                color: draft.sessionCapacity === k ? "#fff" : MUT,
                border: "none", borderRight: i === 0 ? `1px solid ${HAIR}` : "none",
                padding: "9px 16px", fontSize: 13, fontWeight: draft.sessionCapacity === k ? 600 : 400,
                cursor: "pointer", font: "inherit" }}>
              {label}
            </button>
          ))}
        </div>
        {draft.sessionCapacity === "group" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: MUT }}>Up to</span>
            <input style={{ ...inp, maxWidth: 80 }} value={draft.groupSize}
              onChange={e => set({ groupSize: e.target.value })} aria-label="Group size" />
            <span style={{ fontSize: 12.5, color: MUT }}>people on the call</span>
          </div>
        ) : (
          <Help>One traveler per booking. There is no seat count to keep, and none is asked for.</Help>
        )}
      </div>

      {/* What do they walk away with? */}
      <div style={{ marginBottom: 16 }}>
        <Label>What do they walk away with?</Label>
        <textarea style={{ ...inp, resize: "vertical", minHeight: 72 }}
          value={draft.deliverable}
          onChange={e => set({ deliverable: e.target.value })}
          placeholder="A written summary of what we decided, sent within a day of the call." />
      </div>
    </div>
  );
}

// ─── step 2C: async (async_messaging / voice_notes) ──────────────────────────
function StepAsync({ draft, set }: { draft: DraftState; set: (p: Partial<DraftState>) => void }) {
  const REPLY_OPTIONS = [
    { v: "4",   label: "I reply within 4 hours" },
    { v: "24",  label: "I reply within 24 hours" },
    { v: "48",  label: "I reply within 2 days" },
  ];

  return (
    <div style={{ padding: "20px 22px" }}>

      {/* Info banner — replaces "Proposed — gap #3 · ratify or amend" chip */}
      <InfoNote>
        Voice notes and async messaging are the platform's{" "}
        <b style={{ color: INK }}>provider-declared async lane</b> — there is no slot to book and
        no session to attend, so this branch asks three things the scheduled branches never do.
        It is deliberately <em>not</em> the PDF upload step.{" "}
        <DotGhost ch="●" />
      </InfoNote>

      {/* "How fast do you reply?" — horizontal 3-button segmented toggle */}
      <div style={{ marginBottom: 18 }}>
        <Label>How fast do you reply?</Label>
        <div style={{ display: "inline-flex", border: `1px solid ${HAIR}`, borderRadius: 6,
          overflow: "hidden", marginBottom: 9 }}>
          {REPLY_OPTIONS.map((opt, i) => (
            <button key={opt.v} type="button"
              onClick={() => set({ responseWindowHours: opt.v })}
              style={{
                background: draft.responseWindowHours === opt.v ? INK : PAP,
                color: draft.responseWindowHours === opt.v ? "#fff" : MUT,
                border: "none",
                borderRight: i < REPLY_OPTIONS.length - 1 ? `1px solid ${HAIR}` : "none",
                padding: "9px 16px", fontSize: 13,
                fontWeight: draft.responseWindowHours === opt.v ? 600 : 400,
                cursor: "pointer", font: "inherit",
              }}>
              {opt.label}
            </button>
          ))}
        </div>
        <Help>
          Travelers see this on the listing as{" "}
          <b style={{ color: INK }}>"Replies within 24 hours"</b>.
          It is your own declaration — the platform does not police it, and does not claim to.
        </Help>
      </div>

      {/* 2-col row: scope (left) · delivery medium + runs-for (right) */}
      <Row>
        <Field>
          <Label>What is included in one exchange?</Label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 100 }}
            value={draft.scopeStatement}
            onChange={e => set({ scopeStatement: e.target.value })}
            placeholder={`Five days of messages while you are in Kyoto — restaurant calls, "is this queue worth it", last-minute swans when it rains.`}
          />
          <Help>
            The scope statement stands in for a duration. It is what a traveler is buying, in your words.{" "}
            {draft.scopeStatement.length > 0 && (
              <span>{draft.scopeStatement.length} characters.</span>
            )}
          </Help>
        </Field>
        <Field>
          <div style={{ marginBottom: 14 }}>
            <Label>How is it delivered?</Label>
            <select style={inp} value={draft.asyncDeliveryMedium}
              onChange={e => set({ asyncDeliveryMedium: e.target.value })}>
              <option>Messages in Traveloure chat</option>
              <option>Voice notes in Traveloure chat</option>
            </select>
          </div>
          <div>
            <Label>Runs for</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inp, maxWidth: 72 }} value={draft.engagementWindow}
                onChange={e => set({ engagementWindow: e.target.value })} aria-label="Window length" />
              <select style={inp} value={draft.engagementUnit}
                onChange={e => set({ engagementUnit: e.target.value })}>
                <option>days from first message</option>
                <option>days from purchase</option>
              </select>
            </div>
            <Help>The engagement window — when the clock starts, and when it stops.</Help>
          </div>
        </Field>
      </Row>

      {/* Completion banner */}
      <WarnNote>
        <b style={{ fontWeight: 650 }}>Completion, honestly.</b>{" "}
        There is no slot that ends, so nothing marks this delivered on its own:{" "}
        <b style={{ fontWeight: 650 }}>you mark it complete, and the traveler has a dispute window before the payout settles.</b>{" "}
        That is the existing provider-declared completion rule, not a new one — this branch is wired to it
        rather than inventing a second definition of "done".
      </WarnNote>

      {/* Bottom context note */}
      <InfoNote style={{ marginTop: 14, marginBottom: 0 }}>
        Basics are untouched —{" "}
        "{draft.serviceName || "your listing name"}", ${draft.price || "—"} per traveler.
        No location, transport, surcharge or slot question appears anywhere in this flow.
      </InfoNote>
    </div>
  );
}

// ─── step 2D: artifact / pdf guide ────────────────────────────────────────────
function StepArtifact({ draft, set }: { draft: DraftState; set: (p: Partial<DraftState>) => void }) {
  return (
    <div style={{ padding: "20px 22px" }}>
      <InfoNote>
        <b style={{ color: INK }}>No location, transport or surcharge anywhere in this flow.</b>{" "}
        A guide is not delivered somewhere, so the form never asks where.
      </InfoNote>

      <Row>
        <Field>
          <Label>What exactly do they receive?</Label>
          <input style={inp} value={draft.artifactDescription}
            onChange={e => set({ artifactDescription: e.target.value })}
            placeholder="A 28-page PDF plus a printable one-page map" />
        </Field>
        <Field>
          <Label>How soon after buying?</Label>
          <select style={inp} value={draft.fulfillmentSpeed}
            onChange={e => set({ fulfillmentSpeed: e.target.value })}>
            <option>Instantly — it is already written</option>
            <option>Within 2 days — I personalise it</option>
            <option>Within a week</option>
          </select>
        </Field>
      </Row>

      <div style={{ marginBottom: 16 }}>
        <Label>Upload the file</Label>
        {draft.fileUploaded ? (
          <div style={{ border: `1px solid ${HAIR}`, borderRadius: 6, padding: 18,
            textAlign: "center", background: PAP }}>
            <div style={{ fontSize: 13, fontWeight: 550 }}>guide-v1.pdf</div>
            <div style={{ fontSize: 12, color: ACC, marginTop: 3 }}>
              Uploaded ·{" "}
              <button type="button" onClick={() => set({ fileUploaded: false })}
                style={{ background: "none", border: "none", color: ACC, padding: 0,
                  textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer",
                  fontSize: 12, font: "inherit" }}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 6, padding: 22,
            textAlign: "center", background: GRD }}>
            <div style={{ fontSize: 13, color: MUT, marginBottom: 9 }}>
              No file yet — travelers cannot receive anything until there is one.
            </div>
            <button type="button" onClick={() => set({ fileUploaded: true })}
              style={{ background: PAP, color: INK, border: `1px solid ${HAIR}`,
                padding: "6px 11px", borderRadius: 6, cursor: "pointer",
                fontSize: 12.5, fontWeight: 550, font: "inherit" }}>
              Upload the guide
            </button>
          </div>
        )}
        <Help>
          Travelers get the current file at the moment they buy. Updating it later does not re-send.
          This is the item the draft checklist watches — it ticks when a file is here, not when you tick it.
        </Help>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Label>Show a sample?</Label>
        <select style={inp} value={draft.samplePages}
          onChange={e => set({ samplePages: e.target.value })}>
          <option>First 3 pages, free</option>
          <option>No sample</option>
        </select>
        <Help>Optional.</Help>
      </div>
    </div>
  );
}

// ─── step 5: review ───────────────────────────────────────────────────────────
function StepReview({ draft, serviceId, onSubmit, submitting, onBack }: {
  draft: DraftState; serviceId: string;
  onSubmit: () => void; submitting: boolean;
  onBack: () => void;
}) {
  const steps = getStepList(draft.deliveryMethod);
  const isLong = steps.length === 5;

  const methodLabels: Record<DeliveryMethod, string> = {
    in_person: "In person · Place-anchored",
    video_call: "Video call · Remote",
    phone_call: "Phone call · Remote",
    async_messaging: "Async messaging · Async lane",
    voice_notes: "Voice notes · Async lane",
    pdf_guide: "PDF guide · Artifact",
    hybrid: "Hybrid · In person + video",
  };

  // SumRow: label (left, muted, fixed-width) | value (right, dark)
  function SumRow({ label, subLabel, value, last }: {
    label: string;
    subLabel?: string;
    value: React.ReactNode;
    last?: boolean;
  }) {
    return (
      <div style={{
        display: "flex", gap: 18, padding: "10px 0",
        borderBottom: last ? "none" : `1px solid ${HAIR}`, alignItems: "flex-start",
      }}>
        <span style={{ minWidth: 160, flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, color: MUT, display: "block" }}>{label}</span>
          {subLabel && (
            <span style={{ fontSize: 11.5, color: WLN, display: "block", marginTop: 1 }}>{subLabel}</span>
          )}
        </span>
        <span style={{ fontSize: 12.5, color: INK, flex: 1, lineHeight: 1.5 }}>
          {value ?? <span style={{ color: MUT }}>—</span>}
        </span>
      </div>
    );
  }

  // "Offering" value: category name + chip for category slug
  const offeringValue = draft.categoryName ? (
    <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
      {draft.categoryName}
      {draft.categoryName && (
        <span style={{
          fontSize: 11.5, fontWeight: 500, color: MUT,
          background: GRD, border: `1px solid ${HAIR}`,
          borderRadius: 100, padding: "1px 8px",
        }}>
          {draft.categoryName}
        </span>
      )}
    </span>
  ) : null;

  // "Price" value with surcharges note
  const priceValue = draft.price
    ? <>{`$${draft.price} ${draft.priceBasedOn}`}<span style={{ color: MUT }}>{" · surcharges and deposit not set (optional)"}</span></>
    : null;

  // "Where" value: meeting point + pin status + radius
  const locatedStops = draft.stopPositions.filter(p => p !== null).length;
  const totalStops   = draft.stopNames.filter(s => s.trim()).length;
  const hasPinCoords = draft.meetingLat !== null && draft.meetingLng !== null;

  const whereValue = isLong ? (
    <>
      {draft.meetingPoint || <span style={{ color: MUT }}>Not set</span>}
      {hasPinCoords && <span style={{ color: MUT }}>{" · pin confirmed"}</span>}
      {draft.serviceRadius && <span style={{ color: MUT }}>{` · free travel to ${draft.serviceRadius} km`}</span>}
    </>
  ) : null;

  // "Route stops" value
  const stopsValue = isLong && totalStops > 0 ? (
    <>
      {`${totalStops} stop${totalStops !== 1 ? "s" : ""} · ${locatedStops} of ${totalStops} located`}
      {locatedStops < totalStops && (
        <span style={{ color: WINK }}>{" · unlocated stops will not appear on the map"}</span>
      )}
    </>
  ) : null;

  return (
    <div style={{ padding: "20px 22px" }}>
      {/* Summary table */}
      <div style={{
        background: PAP, border: `1px solid ${HAIR}`, borderRadius: 7,
        padding: "0 16px", marginBottom: 18,
      }}>
        <SumRow label="Offering" value={offeringValue} />
        <SumRow label="Name" value={draft.serviceName} />
        <SumRow label="Delivery" value={methodLabels[draft.deliveryMethod]} />
        <SumRow label="Price" value={priceValue} />
        {isLong && <>
          <SumRow
            label="Where"
            subLabel="step 4, Logistics"
            value={whereValue}
          />
          {totalStops > 0 && (
            <SumRow label="Route stops" value={stopsValue} />
          )}
        </>}
        <SumRow label="Cover photo" value={<span style={{ color: "#B07400" }}>Not added yet</span>} last />
      </div>

      {/* What happens banner */}
      <WarnNote>
        <b style={{ fontWeight: 650 }}>What happens when you submit.</b>{" "}
        Our team reviews the listing before it goes live — usually within 2 business days.
        Until then it stays a draft on your Catalog and no traveler can see or book it.
        You can keep editing while it waits.
      </WarnNote>

      {/* Actions */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 18 }}>
        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          style={{
            background: ACC, border: `1px solid ${ACC}`,
            color: "#fff", padding: "12px 24px", borderRadius: 6,
            cursor: submitting ? "not-allowed" : "pointer",
            fontSize: 14.5, fontWeight: 600, font: "inherit",
            display: "flex", alignItems: "center", gap: 9,
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Submitting…" : (
            <>
              Submit for review
              <span style={{
                width: 22, height: 22, borderRadius: "50%",
                background: "rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13,
              }}>✦</span>
            </>
          )}
        </button>
        <button
          type="button"
          style={{
            background: "transparent", color: INK,
            border: `1px solid ${HAIR}`, padding: "10px 18px", borderRadius: 6,
            cursor: "pointer", fontSize: 13.5, fontWeight: 550, font: "inherit",
          }}
        >
          Save and finish later
        </button>
      </div>

      <p style={{ fontSize: 12.5, color: MUT, marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
        Nothing here says "Publish" — because clicking it does not publish anything.
      </p>

      {/* Bottom info note */}
      <InfoNote style={{ marginTop: 18, marginBottom: 0 }}>
        There is no disabled button and no red asterisk on this screen. If something is missing, it is listed by
        name on the listing home checklist, and you can still submit — review will tell you if it is not enough.
      </InfoNote>

      {/* Back button */}
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${HAIR}` }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "none", border: "none", color: INK,
            fontSize: 13, cursor: "pointer", font: "inherit",
            padding: 0, display: "flex", alignItems: "center", gap: 5,
          }}
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

// ─── main wizard ──────────────────────────────────────────────────────────────
export default function CreateServiceWizard() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // parse URL params
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const stepParam = parseInt(params.get("step") ?? "1", 10);
  const serviceId = params.get("id") ?? "";

  const [draft, setDraftFull] = useState<DraftState>(BLANK);
  const set = useCallback((patch: Partial<DraftState>) =>
    setDraftFull(prev => ({ ...prev, ...patch })), []);

  // fetch categories
  const { data: categories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  // fetch existing draft if we have an id (e.g. page reload)
  const { data: existingService } = useQuery({
    queryKey: ["/api/provider/services", serviceId],
    queryFn: async () => {
      if (!serviceId) return null;
      const res = await apiRequest("GET", `/api/provider/services/${serviceId}`);
      return res.json();
    },
    enabled: !!serviceId,
  });

  // hydrate draft from existing service on first load
  useEffect(() => {
    if (!existingService) return;
    const svc = existingService as any;
    setDraftFull(prev => ({
      ...prev,
      serviceName: svc.serviceName ?? prev.serviceName,
      deliveryMethod: (svc.deliveryMethod ?? prev.deliveryMethod) as DeliveryMethod,
      price: svc.price ?? prev.price,
      priceBasedOn: svc.priceBasedOn ?? prev.priceBasedOn,
      shortDescription: svc.shortDescription ?? prev.shortDescription,
      categoryId: svc.categoryId ?? prev.categoryId,
      categoryName: svc.categoryName ?? prev.categoryName,
      durationValue: svc.durationMinutes ? String(svc.durationMinutes) : prev.durationValue,
      meetingPoint: svc.meetingPoint ?? prev.meetingPoint,
      serviceRadius: svc.serviceRadius ? String(svc.serviceRadius) : prev.serviceRadius,
      partySizeMin: svc.partySizeMin ? String(svc.partySizeMin) : prev.partySizeMin,
      partySizeMax: svc.partySizeMax ? String(svc.partySizeMax) : prev.partySizeMax,
      joinLink: svc.joinLink ?? prev.joinLink,
      responseWindowHours: svc.responseWindowHours ? String(svc.responseWindowHours) : prev.responseWindowHours,
      scopeStatement: svc.scopeStatement ?? prev.scopeStatement,
    }));
  }, [existingService]);

  const steps = getStepList(draft.deliveryMethod);
  const stepIndex = Math.max(0, Math.min(stepParam - 1, steps.length - 1));
  const totalSteps = steps.length;

  function goTo(step: number, id?: string) {
    const newId = id ?? serviceId;
    navigate(`/provider/services/new?step=${step}${newId ? `&id=${newId}` : ""}`, { replace: false });
  }

  // POST — creates the draft service
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/services", {
        serviceName: draft.serviceName || "Untitled service",
        deliveryMethod: draft.deliveryMethod,
        price: draft.price || "0",
        priceBasedOn: draft.priceBasedOn,
        shortDescription: draft.shortDescription,
        categoryId: draft.categoryId || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      goTo(2, data.id);
    },
    onError: (err: any) => {
      toast({ title: "Could not save", description: err.message ?? "Please try again.", variant: "destructive" });
    },
  });

  // PATCH — updates the draft service on step advance
  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/provider/services/${serviceId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
    },
    onError: (err: any) => {
      toast({ title: "Could not save", description: err.message ?? "Please try again.", variant: "destructive" });
    },
  });

  // PATCH — submit for review
  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/provider/services/${serviceId}`, {
        formStatus: "submitted",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Submitted for review", description: "We'll let you know within 2 business days." });
      navigate("/provider/workstation");
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message ?? "Please try again.", variant: "destructive" });
    },
  });

  function buildPatch(): Record<string, unknown> {
    const stepName = steps[stepIndex];
    if (stepName === "Scheduling") {
      // Convert lead time to hours
      const leadTimeRaw = parseInt(draft.leadTimeValue, 10) || 24;
      const leadTimeHours = draft.leadTimeUnit === "days" ? leadTimeRaw * 24 : leadTimeRaw;
      // Convert change cutoff to hours
      const cutoffRaw = parseInt(draft.changeCutoffValue, 10) || 24;
      const changeCutoffHours = draft.changeCutoffUnit.startsWith("days") ? cutoffRaw * 24 : cutoffRaw;
      // Convert duration to minutes
      const durRaw = parseInt(draft.durationValue, 10) || 0;
      const durationMinutes = draft.durationUnit === "hours" ? durRaw * 60
        : draft.durationUnit === "days" ? durRaw * 1440 : durRaw;
      return {
        durationMinutes: durationMinutes || undefined,
        leadTimeHours,
        changeCutoffHours,
        earliestStartTime: draft.earliestStartTime || undefined,
        latestStartTime: draft.latestStartTime || undefined,
        bookingMode: draft.bookingMode,
      };
    }
    if (stepName === "Capacity") {
      return {
        partySizeMin: parseInt(draft.partySizeMin, 10) || undefined,
        partySizeMax: parseInt(draft.partySizeMax, 10) || undefined,
      };
    }
    if (stepName === "Logistics") {
      return {
        meetingPoint: draft.meetingPoint || undefined,
        latitude: draft.meetingLat ?? undefined,
        longitude: draft.meetingLng ?? undefined,
        serviceRadius: parseInt(draft.serviceRadius, 10) || undefined,
        collectsAndDrops: draft.collectsAndDrops,
      };
    }
    if (stepName === "Session details") {
      const durRaw = parseInt(draft.durationValue, 10) || 0;
      const durationMinutes = draft.durationUnit === "hours" ? durRaw * 60 : durRaw;
      return {
        durationMinutes: durationMinutes || undefined,
        joinLink: draft.sessionPlatform === "own" ? draft.joinLink : undefined,
        providerTimezone: draft.providerTimezone || undefined,
        sessionLanguages: draft.sessionLanguages || undefined,
        partySizeMax: draft.sessionCapacity === "group" ? parseInt(draft.groupSize, 10) : 1,
      };
    }
    if (stepName === "Async details") {
      return {
        responseWindowHours: parseInt(draft.responseWindowHours, 10) || undefined,
        scopeStatement: draft.scopeStatement || undefined,
        asyncDeliveryMedium: draft.asyncDeliveryMedium || undefined,
        engagementWindowDays: parseInt(draft.engagementWindow, 10) || undefined,
      };
    }
    if (stepName === "What they get") {
      return {
        shortDescription: draft.artifactDescription || draft.shortDescription || undefined,
      };
    }
    return {};
  }

  async function handleNext() {
    if (stepIndex === 0) {
      // Step 1 — create draft
      if (!serviceId) {
        createMutation.mutate();
      } else {
        // update basics then advance
        await updateMutation.mutateAsync({
          serviceName: draft.serviceName,
          deliveryMethod: draft.deliveryMethod,
          price: draft.price,
          priceBasedOn: draft.priceBasedOn,
          shortDescription: draft.shortDescription,
          categoryId: draft.categoryId || undefined,
        });
        goTo(stepParam + 1);
      }
    } else if (stepIndex < totalSteps - 1) {
      const patch = buildPatch();
      if (Object.keys(patch).length > 0) {
        await updateMutation.mutateAsync(patch);
      }
      goTo(stepParam + 1);
    }
  }

  function handleBack() {
    if (stepParam > 1) goTo(stepParam - 1);
    else navigate("/provider/workstation");
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const isReview = stepIndex === totalSteps - 1;
  const stepName = steps[stepIndex];

  function renderBody() {
    if (stepIndex === 0)
      return <StepBasics draft={draft} set={set} categories={categories} onNext={handleNext} saving={saving} />;
    if (stepName === "Scheduling")
      return <StepScheduling draft={draft} set={set} />;
    if (stepName === "Capacity")
      return <StepCapacity draft={draft} set={set} />;
    if (stepName === "Logistics")
      return <StepLogistics draft={draft} set={set} />;
    if (stepName === "Session details")
      return <StepSession draft={draft} set={set} />;
    if (stepName === "Async details")
      return <StepAsync draft={draft} set={set} />;
    if (stepName === "What they get")
      return <StepArtifact draft={draft} set={set} />;
    if (isReview)
      return (
        <StepReview
          draft={draft}
          serviceId={serviceId}
          onSubmit={() => submitMutation.mutate()}
          submitting={submitMutation.isPending}
          onBack={() => goTo(stepIndex - 1, serviceId)}
        />
      );
    return null;
  }

  return (
    <ProviderLayout title="New service">
      {/* breadcrumb */}
      <nav style={{ fontSize: 12.5, color: MUT, marginBottom: 14,
        display: "flex", alignItems: "center", gap: 6 }}>
        <Link href="/provider/workstation">
          <a style={{ color: ACC, textDecoration: "underline", textUnderlineOffset: 2 }}>Workstation</a>
        </Link>
        <span>›</span>
        <span>New service</span>
        <span>›</span>
        <span style={{ color: INK }}>Step {stepParam} · {stepName}</span>
      </nav>

      {/* back link */}
      <button type="button" onClick={handleBack}
        style={{ background: "none", border: "none", color: ACC, cursor: "pointer",
          fontSize: 13, textDecoration: "underline", textUnderlineOffset: 2,
          marginBottom: 18, display: "inline-block", font: "inherit", padding: 0 }}>
        ← Back to "What are you building?"
      </button>

      {/* two-column: step panel + main card */}
      <div style={{ display: "grid", gridTemplateColumns: "236px minmax(0,1fr)", gap: 22, alignItems: "start" }}>
        <StepPanel steps={steps} cur={stepIndex} method={draft.deliveryMethod} />

        <div style={{ background: PAP, border: `1px solid ${HAIR}`, borderRadius: 7, overflow: "hidden" }}>
          {/* card header */}
          <div style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}`,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: INK }}>{stepName}</h3>
            <span style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px",
              borderRadius: 100, border: `1px solid ${WLN}`, background: WBG, color: WINK }}>
              Draft · autosaved
            </span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>
              Step {stepParam} of {totalSteps}
            </span>
          </div>

          {/* card body */}
          {renderBody()}

          {/* card footer */}
          {!isReview && (
            <div style={{ padding: "0 22px 20px" }}>
              <div style={{ marginTop: 0, paddingTop: 16, borderTop: `1px solid ${HAIR}`,
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {stepIndex > 0 && (
                  <button type="button" onClick={handleBack}
                    style={{ background: "transparent", color: INK, border: `1px solid ${HAIR}`,
                      padding: "9px 16px", borderRadius: 6, cursor: "pointer",
                      fontSize: 13.5, fontWeight: 550, font: "inherit" }}>
                    ← Back
                  </button>
                )}
                <button type="button" onClick={handleNext} disabled={saving}
                  style={{ background: INK, color: PAP, border: `1px solid ${INK}`,
                    padding: "9px 16px", borderRadius: 6,
                    cursor: saving ? "not-allowed" : "pointer",
                    fontSize: 13.5, fontWeight: 550, font: "inherit" }}>
                  {saving ? "Saving…" : stepIndex === 0 && !serviceId
                    ? "Save draft & continue →"
                    : `Next: ${steps[stepIndex + 1] ?? "Review"} →`}
                </button>
                <span style={{ marginLeft: "auto" }} />
                <span style={{ fontSize: 12, color: MUT }}>Autosaved. Closing this tab keeps everything.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProviderLayout>
  );
}
