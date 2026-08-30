// Mock notes — the annotations drawer rendered as a full frame.
// Faithful to docs/design/provider-console-mockup/mockup.html lines ~1587-1852.

import { BaseMap, PinGlyph } from "./PropertyStep1";

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";

const MINI_STOPS = [
  { x: 20, y: 66 },
  { x: 47, y: 45 },
  { x: 72, y: 58 },
];

export function MockNotes() {
  return (
    <div
      className="min-h-screen bg-[#FAFAF8]"
      style={{
        color: INK,
        fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <style>{".legend-item b{color:#1A1A18;font-weight:600}"}</style>
      {/* nhd */}
      <div style={{ padding: "16px 26px", borderBottom: `1px solid ${HAIR}`, background: PAPER, display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 650, margin: 0 }}>Mock notes</h3>
        <span style={pill()}>Annotations · not console chrome</span>
        <button aria-label="Close" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: MUT, fontSize: 18, lineHeight: 1 }}>
          ×
        </button>
      </div>

      <div style={{ padding: "20px 26px 60px", maxWidth: 880 }}>
        {/* ── How to review this ── */}
        <h5 style={grouplabel()}>How to review this</h5>
        <div style={{ ...card(), padding: "20px 22px", marginBottom: 24 }}>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            Everything outside this panel is the <b>provider console as it would actually be</b> — walk it like a
            provider: Catalog is where your listings live, <b>+ Add New Service</b> sends you to Workstation (the one
            door), picking <i>Single service</i> opens the create flow, and <b>Save draft</b> lands you on that
            listing's home with the checklist. Clicking a checklist row takes you to the surface that owns the work —
            the row ticks only once the work is really done there. The small ringed numbers on each screen are the
            recommendation each element demonstrates; the legend below names them. Nothing here is connected to live
            data, and every number in it is seeded sample content.
          </div>
          <div style={{ ...noteQuiet(), marginTop: 14 }}>
            <b style={{ color: INK }}>What to decide:</b> each ringed number is approvable on its own. The amber
            “Proposed — gap #N” chips mark the places where the audit found <i>no design exists yet</i> — those need a
            ratify-or-amend, not just a yes.
          </div>
        </div>

        {/* ── Callout legend ── */}
        <h5 style={grouplabel()}>Callout legend</h5>
        <div style={{ ...card(), padding: "20px 22px", marginBottom: 24 }}>
          <div style={legendHd(ACC)}>Package B — the redesigned create flow</div>
          <div style={{ ...legendGrid(), marginBottom: 18 }}>
            <Legend n="①"><b>Delivery-method-first.</b> Pick a method on Basics — the step list and every later question change with it.</Legend>
            <Legend n="②"><b>Basics fast path.</b> Five fields, then a saved listing and a named list of what is left.</Legend>
            <Legend n="③"><b>One location card.</b> One address, one pin, one radius, stops edited inline — and it is step 4.</Legend>
            <Legend n="④"><b>Money in one place.</b> Creation asks one price; surcharges, deposit and cancellation are a tune-later drawer.</Legend>
            <Legend n="⑤"><b>Checklist, not a disabled button.</b> And the button says “Submit for review”, because that is what it does.</Legend>
            <Legend n="⑬"><b>Renamed steps.</b> Step 4 took the name Logistics, so the old Logistics step is <b>Scheduling</b> and the old Group step is <b>Capacity</b>.</Legend>
          </div>
          <div style={legendHd(ACC)}>Package C — surface restructure</div>
          <div style={{ ...legendGrid(), marginBottom: 18 }}>
            <Legend n="⑥"><b>The one door.</b> Every “Add New Service” lands on Workstation's “What are you building?”.</Legend>
            <Legend n="⑦"><b>Slim Catalog.</b> Storefront, share kit and promote feed leave; one “Promote this →” per card points at Distribute.</Legend>
            <Legend n="⑧"><b>Sidebar gains Distribute.</b> The page is built; it has no nav entry today.</Legend>
            <Legend n="⑨"><b>One map-authoring component.</b> Pin, radius, stops and zones on one canvas — now the create flow's step 4.</Legend>
            <Legend n="⑩"><b>Authoring has one home.</b> Catalog's map is a read-only traveler preview; the flow owns the authoring.</Legend>
            <Legend n="⑪"><b>Traveler-side honesty.</b> Only located things render; no coordinates means no map at all.</Legend>
            <Legend n="⑫"><b>Market overlays move to Performance.</b> Flagged — deliberately <i>not</i> part of this approval.</Legend>
            <Legend n="⑰"><b>Edit path.</b> Which edits go live at once and which re-enter review — proposed, gap #17.</Legend>
          </div>
          <div style={legendHd(WARN_INK)}>The gaps with no design yet</div>
          <div style={legendGrid()}>
            <Legend n="⑭" ghost><b>One availability editor</b>, whose semantics come from the delivery method — gap #2. Blackouts are first-class and subtractive; the grid opens where the availability is.</Legend>
            <Legend n="⑮" ghost><b>Property builder</b> — three steps, rooms as child rows — gap #1.</Legend>
            <Legend n="⑳" ghost><b>Where is it</b> — the property pin: the flow's own confirm-gated placement reused, never a second location rail, plus the optional directions line (display text, never a coordinate source) and the pre-booking privacy circle — gap #1.</Legend>
            <Legend n="⑯" ghost><b>Bundle builder</b> — component picker, derived method, no auto-sum — gap #9.</Legend>
            <Legend n="⑲" ghost><b>Session &amp; async branches</b> — timezone, venue and capacity for live-remote (gap #4); reply window, scope and completion for the async lane (gap #3).</Legend>
            <Legend n="⑱" ghost><b>Delete with bookings</b> — refusal plus an Archive path that says what survives — gap #18.</Legend>
            <Legend n="⑬" ghost><b>Render it, or stop collecting it.</b> Every authored answer gets a traveler-side home — gap #13.</Legend>
          </div>
        </div>

        {/* ── Map mounts ── */}
        <h5 style={grouplabel()}>Where the map component is mounted</h5>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
            <div style={mountbox()}>
              <div style={mhd()}>
                <b style={{ fontSize: 12.5, fontWeight: 600 }}>Authoring — create flow, step 4 “Logistics”</b>
                <span style={same()}>the component</span>
              </div>
              <div style={{ padding: 13 }}>
                <div style={chromebar()}>
                  <span>Create flow</span>
                  <Cseg>Basics</Cseg>
                  <Cseg>Scheduling</Cseg>
                  <Cseg>Capacity</Cseg>
                  <Cseg on>Logistics</Cseg>
                  <Cseg>Review</Cseg>
                </div>
                <MiniMap candidate pin={{ x: 36, y: 28 }} stops={MINI_STOPS} />
                {/* confirm bar */}
                <div
                  style={{
                    display: "flex", gap: 7, alignItems: "center", border: `1px solid ${ACC}`, borderRadius: 6,
                    padding: "7px 9px", marginTop: 8, background: "#EDF2F1", flexWrap: "wrap",
                  }}
                >
                  <span style={{ flex: 1, fontSize: 11, color: ACC, minWidth: 120 }}>
                    Pin placed but <b>not saved</b>.
                  </span>
                  <span style={{ ...btnAccentSm(), fontSize: 10.5, padding: "3px 8px" }}>Confirm this location</span>
                  <span style={{ ...btnGhostSm(), fontSize: 10.5, padding: "3px 8px", background: PAPER }}>Discard</span>
                </div>
                <div style={capline()}>
                  Shown <b style={{ color: INK }}>mid-gate</b>: an unconfirmed candidate pin with the Confirm / Discard
                  bar. Arming, confirming, radius, stops and zones all happen here — and only here. There is no instant
                  latch anywhere.
                </div>
              </div>
            </div>
            <div style={mountbox()}>
              <div style={mhd()}>
                <b style={{ fontSize: 12.5, fontWeight: 600 }}>Catalog map — traveler preview</b>
                <span style={same()}>read-only</span>
              </div>
              <div style={{ padding: 13 }}>
                <div style={chromebar()}>
                  <span>Catalog</span>
                  <Cseg>List</Cseg>
                  <Cseg on>Map</Cseg>
                </div>
                <MiniMap pin={{ x: 36, y: 28 }} ring={70} stops={MINI_STOPS} shift={6} />
                <div style={capline()}>
                  Pins for located listings, an honest flag for the ones without coordinates, and no way to place or
                  move anything. To fix a location you go back into the flow's Logistics step — the same door you
                  authored it in.
                </div>
              </div>
            </div>
          </div>
          <div style={{ ...noteQuiet(), marginTop: 14 }}>
            <b style={{ color: INK }}>Amendment — decision-maker ruling, Aug 12, 2026.</b> Map authoring moved{" "}
            <b style={{ color: INK }}>out of Catalog</b> and <b style={{ color: INK }}>into the create flow as step 4</b>,
            taking the name <b style={{ color: INK }}>Logistics</b>. There is no authoring rail on Catalog and no
            Authoring | Traveler sub-toggle, so List ↔ Map is purely presentational. The write rails are unchanged:
            one confirm-gated pin path, route stops as an ordered replace-list.
          </div>
        </div>

        {/* ── Catalog today wire ── */}
        <h5 style={grouplabel()}>Catalog today — what leaves the page</h5>
        <div style={{ ...card(), padding: 14, marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" as const, color: MUT, marginBottom: 10, fontWeight: 600 }}>
            Catalog today — miniature
          </div>
          <WBlock>Storefront manager bar — handle, bio, share storefront</WBlock>
          <WBlock>Share kit — 3 image formats, copy link, QR</WBlock>
          <WBlock>Promote feed — posting opportunities</WBlock>
          <WBlock keep>Search / filter · List / map</WBlock>
          <WBlock>Creation launcher — “Add New Service”</WBlock>
          <WBlock keep>Availability slots</WBlock>
          <WBlock>Per-card analytics strip</WBlock>
          <WBlock keep>Listing cards</WBlock>
          <div style={{ fontSize: 11.5, color: MUT, marginTop: 11, lineHeight: 1.55 }}>
            One page carrying four jobs: storefront manager, share tools, creation launcher and analytics — around
            1,500 lines. Red = leaves Catalog for the surface that owns it (Workstation or Distribute).
          </div>
        </div>

        {/* ── Package A fix pack ── */}
        <h5 style={grouplabel()}>Package A — small independent fixes</h5>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }}>
          {/* A1 */}
          <Fix title="The button tells the truth" code="A1">
            <Swatch before>
              <Slab>Today</Slab>
              <span style={fakebtnInk()}>Publish Service</span>
              <div style={{ fontSize: 12, color: MUT, marginTop: 9, lineHeight: 1.5 }}>
                The click submits for admin review — the server stores it as <i>submitted</i>, never published.
                Providers only learn this after clicking; experts are told up front.
              </div>
            </Swatch>
            <Arrow />
            <Swatch>
              <Slab>Proposed</Slab>
              <span style={fakebtnInk()}>Submit for review</span>
              <div style={{ ...toastgood(), marginTop: 10 }}>
                Listings are reviewed by our team before they go live — usually within 2 business days.
              </div>
              <div style={{ fontSize: 12, color: MUT, marginTop: 9 }}>Same notice shown up front, for providers and experts alike.</div>
            </Swatch>
          </Fix>

          {/* A2 */}
          <Fix title="The dead switch goes" code="A2">
            <Swatch before>
              <Slab>Today</Slab>
              <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: MUT }}>
                <span style={{ width: 34, height: 19, borderRadius: 100, background: HAIR, position: "relative", flex: "0 0 34px", display: "inline-block" }}>
                  <span style={{ position: "absolute", top: 2, left: 2, width: 15, height: 15, borderRadius: 100, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
                </span>
                <span>Published / Draft</span>
              </div>
              <div style={{ fontSize: 12, color: MUT, marginTop: 9, lineHeight: 1.5 }}>
                Toggling it changes nothing — the server decides status. It reads as a control that can put a
                listing live.
              </div>
            </Swatch>
            <Arrow />
            <Swatch>
              <Slab>Proposed</Slab>
              <span style={pillDraft()}>Draft</span>
              <div style={{ fontSize: 12, color: MUT, marginTop: 9, lineHeight: 1.5 }}>
                Status becomes a read-only pill that reflects the real record: Draft → In review → Live.
                No control that pretends to set it.
              </div>
            </Swatch>
          </Fix>

          {/* A3 */}
          <Fix title="Errors in human words" code="A3" hint="click either side">
            <Swatch before>
              <Slab>Today</Slab>
              <div style={toastbad()}>
                {'{"error":"ValidationError","issues":[{"path":["meetingPoint"],"code":"invalid_type","expected":"string","received":"undefined"}]}'}
              </div>
            </Swatch>
            <Arrow />
            <Swatch>
              <Slab>Proposed</Slab>
              <div style={toastgood()}>
                <b>This listing needs a meeting point before it can go live.</b>
                <br />
                <button style={{ ...linkBtn(), marginTop: 6 }}>Add one →</button>
              </div>
              <div style={{ fontSize: 12, color: MUT, marginTop: 9 }}>The link opens step 4 with the map ready.</div>
            </Swatch>
          </Fix>

          {/* A4 */}
          <Fix title="Delete asks first" code="A4" hint="click either Delete">
            <Swatch before>
              <Slab>Today</Slab>
              <button style={{ ...fakebtnDim(), border: "none", cursor: "pointer" }}>Delete</button>
              <div style={{ fontSize: 12, color: MUT, marginTop: 9, lineHeight: 1.5 }}>
                One click removes the listing. No confirmation, no undo — and no different answer when travelers
                have already booked it.
              </div>
            </Swatch>
            <Arrow />
            <Swatch>
              <Slab>Proposed</Slab>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={btnGhostSm()}>Delete (no bookings)</button>
                <button style={btnGhostSm()}>Delete (2 bookings)</button>
              </div>
              <div style={{ fontSize: 12, color: MUT, marginTop: 9, lineHeight: 1.5 }}>
                A confirm dialog that names the listing — and, when travelers are on it, a{" "}
                <b style={{ color: INK }}>refusal plus an Archive path</b> that says what survives (gap #18).
              </div>
            </Swatch>
          </Fix>

          {/* A5 */}
          <Fix title="Three radius fields become one" code="A5">
            <Swatch before>
              <Slab>Today</Slab>
              <div style={{ fontSize: 12.5, lineHeight: 2, color: MUT }}>
                <span style={strike()}>Service radius (km)</span>
                <br />
                <span style={strike()}>Travel radius (km)</span>
                <br />
                <span style={strike()}>Free travel radius (km)</span>
              </div>
              <div style={{ fontSize: 12, color: MUT, marginTop: 9 }}>Three number inputs, three vocabularies, no stated relationship between them.</div>
            </Swatch>
            <Arrow />
            <Swatch>
              <Slab>Proposed</Slab>
              <label style={{ fontSize: 13, fontWeight: 550, display: "block", marginBottom: 6 }}>How far will you travel?</label>
              <input type="range" min={0} max={30} defaultValue={8} aria-label="Travel radius" style={{ width: "100%", accentColor: ACC }} />
              <div style={{ fontSize: 12.5, color: MUT, marginTop: 5 }}>
                Included free up to <b style={{ color: INK }}>8 km</b> from the meeting point.
              </div>
            </Swatch>
          </Fix>

          {/* A6 */}
          <Fix title="Transport asked once" code="A6">
            <Swatch before>
              <Slab>Today</Slab>
              <div style={{ fontSize: 12.5, lineHeight: 1.7, color: MUT }}>
                Step 2 — <span style={strike()}>Transport provision:</span> Pickup included / Pickup available / Meet at point / N/A
                <br />
                Step 4 — <span style={strike()}>Do you provide transportation?</span> Yes / No
              </div>
              <div style={{ fontSize: 12, color: MUT, marginTop: 9 }}>Two questions, two vocabularies, two steps apart. Answers can contradict each other.</div>
            </Swatch>
            <Arrow />
            <Swatch>
              <Slab>Proposed</Slab>
              <label style={{ fontSize: 13, fontWeight: 550, display: "block", marginBottom: 6 }}>Getting there</label>
              <select aria-label="Getting there" style={inp()} defaultValue="Travelers make their own way to the meeting point">
                <option>I collect the traveler and drop them back</option>
                <option>Pickup can be arranged on request</option>
                <option>Travelers make their own way to the meeting point</option>
              </select>
              <div style={{ fontSize: 12, color: MUT, marginTop: 8 }}>One question, asked on the Logistics step where it belongs.</div>
            </Swatch>
          </Fix>
        </div>
      </div>
    </div>
  );
}

/* ── local pieces ─────────────────────────────────────────────────────── */

function Legend({ n, ghost, children }: { n: string; ghost?: boolean; children: React.ReactNode }) {
  return (
    <div className="legend-item" style={{ fontSize: 12.5, color: MUT, display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.5 }}>
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 17, height: 17, flex: "0 0 17px", borderRadius: 100,
          background: ghost ? "#EDF2F1" : ACC, color: ghost ? ACC : "#fff",
          border: ghost ? "1px solid #CBDAD7" : undefined, fontSize: 11, lineHeight: 1, fontWeight: 600,
        }}
      >
        {n}
      </span>
      <span>{children}</span>
    </div>
  );
}

function Cseg({ children, on }: { children: React.ReactNode; on?: boolean }) {
  return (
    <span
      style={{
        border: `1px solid ${on ? INK : HAIR}`, borderRadius: 4, padding: "1px 7px",
        background: on ? INK : PAPER, color: on ? "#fff" : undefined,
      }}
    >
      {children}
    </span>
  );
}

function MiniMap({ pin, ring, stops, shift = 0, candidate }: {
  pin?: { x: number; y: number };
  ring?: number;
  stops?: { x: number; y: number }[];
  shift?: number;
  candidate?: boolean;
}) {
  return (
    <div style={{ position: "relative", border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden", background: "#F1F0EA", height: 132 }}>
      <BaseMap shift={shift} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {ring && pin && (
          <div
            style={{
              position: "absolute", left: `${pin.x}%`, top: `${pin.y}%`, transform: "translate(-50%,-50%)",
              width: ring, height: ring, borderRadius: 100, border: `1px dashed ${ACC}`, background: "rgba(53,96,90,.08)",
            }}
          />
        )}
        {stops && stops.length > 1 && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {stops.slice(0, -1).map((s, i) => (
              <line
                key={i}
                x1={s.x} y1={s.y} x2={stops[i + 1].x} y2={stops[i + 1].y}
                stroke={ACC} strokeWidth={1.6} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" opacity={0.85}
              />
            ))}
          </svg>
        )}
        {stops?.map((s, i) => (
          <div key={i} style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%,-50%)" }}>
            <div
              style={{
                width: 18, height: 18, borderRadius: 100, background: ACC, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
                fontWeight: 650, border: "2px solid #FAFAF8", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
              }}
            >
              {i + 1}
            </div>
          </div>
        ))}
        {pin && (
          <div style={{ position: "absolute", left: `${pin.x}%`, top: `${pin.y}%`, transform: "translate(-50%,-100%)" }}>
            <PinGlyph confirmed={!candidate} w={19} h={25} />
            {candidate && (
              <span
                style={{
                  position: "absolute", left: "50%", top: "100%", transform: "translateX(-50%)", marginTop: 3,
                  whiteSpace: "nowrap", background: "rgba(255,255,255,.95)", border: `1px solid ${HAIR}`,
                  borderRadius: 100, padding: "0 6px", fontSize: 9, color: INK,
                }}
              >
                Unconfirmed
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ position: "absolute", bottom: 9, right: 9, background: "rgba(255,255,255,.94)", border: `1px solid ${HAIR}`, borderRadius: 100, padding: "2px 7px", fontSize: 9.5, color: MUT }}>
        Map preview — illustrative
      </div>
      <div style={{ position: "absolute", bottom: 6, left: 9, fontSize: 9, color: "#8A8A80" }}>© OpenStreetMap contributors</div>
    </div>
  );
}

function WBlock({ children, keep }: { children: React.ReactNode; keep?: boolean }) {
  return (
    <div
      style={{
        border: "1px dashed #D6D6CE", background: "#F4F3EE", borderRadius: 5, padding: "8px 10px",
        marginBottom: 7, fontSize: 12.5, display: "flex", alignItems: "center", gap: 10,
      }}
    >
      <span style={{ flex: 1 }}>{children}</span>
      <span
        style={{
          marginLeft: "auto", fontSize: 10, borderRadius: 100, padding: "0 7px",
          color: keep ? ACC : "#A33",
          border: `1px solid ${keep ? "#BFD5D0" : "#E3C4C4"}`,
          background: keep ? "#EDF2F1" : "#FBF1F1",
        }}
      >
        {keep ? "keeps" : "moves"}
      </span>
    </div>
  );
}

function Fix({ title, code, hint, children }: { title: string; code: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ ...card(), overflow: "hidden" }}>
      <div style={{ padding: "11px 14px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 13, fontWeight: 600 }}>{title}</b>
        <span
          style={{
            fontSize: 10.5, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", color: MUT,
            border: `1px solid ${HAIR}`, borderRadius: 4, padding: "0 6px", background: GRD,
          }}
        >
          {code}
        </span>
        {hint && <span style={{ marginLeft: "auto", fontSize: 11.5, color: MUT }}>{hint}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", alignItems: "stretch" }}>
        {children}
      </div>
    </div>
  );
}

function Swatch({ before, children }: { before?: boolean; children: React.ReactNode }) {
  return <div style={{ padding: "15px 16px", background: before ? "#FBF9F6" : undefined }}>{children}</div>;
}

function Slab({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase" as const, color: MUT, marginBottom: 9, fontWeight: 600 }}>
      {children}
    </div>
  );
}

function Arrow() {
  return <div style={{ display: "flex", alignItems: "center", color: MUT, fontSize: 14, padding: "0 4px" }}>→</div>;
}

/* ── style helpers ────────────────────────────────────────────────────── */
function card(): React.CSSProperties {
  return { background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 };
}
function grouplabel(): React.CSSProperties {
  return { fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase" as const, color: MUT, fontWeight: 600, marginBottom: 10 };
}
function pill(): React.CSSProperties {
  return { display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: `1px solid ${HAIR}`, color: MUT, background: GRD };
}
function pillDraft(): React.CSSProperties {
  return { display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: "1px solid #D9CDB2", background: "#FBF6EC", color: "#6B551F" };
}
function noteQuiet(): React.CSSProperties {
  return { background: GRD, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUT, lineHeight: 1.5 };
}
function legendHd(color: string): React.CSSProperties {
  return { fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase" as const, color, fontWeight: 650, marginBottom: 10 };
}
function legendGrid(): React.CSSProperties {
  return { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "8px 22px" };
}
function mountbox(): React.CSSProperties {
  return { background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7, overflow: "hidden" };
}
function mhd(): React.CSSProperties {
  return { padding: "10px 14px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
}
function same(): React.CSSProperties {
  return { marginLeft: "auto", fontSize: 10.5, color: ACC, background: "#EDF2F1", border: "1px solid #CBDAD7", borderRadius: 100, padding: "1px 8px" };
}
function chromebar(): React.CSSProperties {
  return {
    background: GRD, border: `1px solid ${HAIR}`, borderRadius: 5, padding: "6px 9px",
    fontSize: 11, color: MUT, marginBottom: 9, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap",
  };
}
function capline(): React.CSSProperties {
  return { fontSize: 11.5, color: MUT, lineHeight: 1.55, marginTop: 8 };
}
function fakebtnInk(): React.CSSProperties {
  return { display: "inline-block", padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 550, background: INK, color: "#fff" };
}
function fakebtnDim(): React.CSSProperties {
  return { display: "inline-block", padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 550, background: "#B9B9B0", color: "#fff", fontFamily: "inherit" };
}
function toastbad(): React.CSSProperties {
  return {
    background: "#2B2B28", color: "#F0EFE9", borderRadius: 6, padding: "10px 12px",
    fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 10.5, lineHeight: 1.6, wordBreak: "break-all" as const,
  };
}
function toastgood(): React.CSSProperties {
  return { border: `1px solid ${WARN_LINE}`, background: WARN_BG, color: WARN_INK, borderRadius: 6, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.55 };
}
function strike(): React.CSSProperties {
  return { textDecoration: "line-through", color: "#A9A9A0" };
}
function linkBtn(): React.CSSProperties {
  return { background: "none", border: "none", color: ACC, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit" };
}
function btnGhostSm(): React.CSSProperties {
  return { border: `1px solid ${HAIR}`, background: "transparent", color: INK, padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, whiteSpace: "nowrap" as const, flex: "0 0 auto", fontFamily: "inherit" };
}
function btnAccentSm(): React.CSSProperties {
  return { border: `1px solid ${ACC}`, background: ACC, color: "#fff", padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, whiteSpace: "nowrap" as const, fontFamily: "inherit" };
}
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 11px", border: `1px solid ${HAIR}`, borderRadius: 6,
    background: PAPER, color: INK, font: "inherit", fontSize: 13.5, boxSizing: "border-box" as const,
  };
}
