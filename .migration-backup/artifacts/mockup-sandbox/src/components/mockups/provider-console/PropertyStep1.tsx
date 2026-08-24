// Property builder (gap #1) — Step 1 "The property"
// Faithful to docs/design/provider-console-mockup/mockup.html propBody0().

import { ConsoleShell } from "./_ConsoleShell";

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";

export function PropertyStep1() {
  return (
    <ConsoleShell
      active="workstation"
      crumbs={[{ label: "Workstation" }, { label: "New property" }, { label: "1. The property", current: true }]}
    >
      <BackLink />
      <div style={card()}>
        <CardHeader activeStep={0} />
        <div style={{ padding: "20px 22px" }}>
          {/* intro */}
          <div style={{ ...noteQuiet(), marginBottom: 18 }}>
            A property is <b style={{ color: INK }}>the place</b>. What guests actually book are its rooms — that is
            the next step. Three steps total; nothing here is asked twice.
            <Dot ghost inline>⑮</Dot>
          </div>

          {/* name + cancellation */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
            <div style={field()}>
              <label style={lbl()}>Property name</label>
              <input style={inp()} defaultValue="Machiya Kikuya — Gion" />
            </div>
            <div style={field()}>
              <label style={lbl()}>Cancellation policy</label>
              <select style={inp()} defaultValue="Moderate — full refund up to 14 days before check-in">
                <option>Moderate — full refund up to 14 days before check-in</option>
                <option>Flexible — full refund up to 5 days before check-in</option>
                <option>Strict — 50% refund up to 30 days before check-in</option>
              </select>
              <div style={help()}>Stay-shaped windows, not the session policy — a night is not a slot.</div>
            </div>
          </div>

          {/* description */}
          <div style={field()}>
            <label style={lbl()}>Description</label>
            <textarea
              style={{ ...inp(), resize: "vertical" as const, minHeight: 64 }}
              defaultValue="A restored 1920s machiya five minutes from Kenninji, with a small moss garden and a cedar bath. Two guest rooms, both on the ground floor."
            />
          </div>

          {/* photos */}
          <div style={field()}>
            <label style={lbl()}>Photos</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={photobox()}>▤</div>
              ))}
              <button style={{ ...photobox(), borderStyle: "dashed", cursor: "pointer", color: MUT, background: GRD, fontFamily: "inherit" }}>
                + Add
              </button>
            </div>
            <div style={help()}>
              Property photos are the building and the shared spaces. Each room carries its own photo on the next step.
            </div>
          </div>

          {/* ── Where is it ── */}
          <div style={{ height: 1, background: HAIR, margin: "22px 0 16px" }} />
          <h5 style={{ ...grouplabel(), display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0 }}>
            Where is it
            <Dot ghost inline>⑳</Dot>
            <span style={{ ...propchip(), marginLeft: 6 }}>Proposed — gap #1 · ratify or amend</span>
          </h5>
          <div style={{ ...noteQuiet(), marginBottom: 14 }}>
            This is the <b style={{ color: INK }}>same confirm-gated pin</b> the create flow uses on its Logistics step —
            arm, click, confirm — mounted here rather than invented again. One sanctioned location write, reused: there is
            no second way to place a coordinate on this platform.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16, alignItems: "start" }}>
            <div style={{ minWidth: 0 }}>
              {/* bigmap small */}
              <div style={{ position: "relative", border: `1px solid ${HAIR}`, borderRadius: 7, overflow: "hidden", background: "#F1F0EA", height: 290 }}>
                <BaseMap shift={12} />
                <div style={{ position: "absolute", bottom: 9, right: 9, background: "rgba(255,255,255,.94)", border: `1px solid ${HAIR}`, borderRadius: 100, padding: "3px 10px", fontSize: 11, color: MUT }}>
                  Map preview — illustrative
                </div>
                <div style={{ position: "absolute", bottom: 6, left: 9, fontSize: 10.5, color: "#8A8A80" }}>© OpenStreetMap contributors</div>
                {/* armbar */}
                <div
                  style={{
                    position: "absolute", left: 12, right: 12, top: 12, background: "rgba(255,255,255,.97)",
                    border: `1px solid ${HAIR}`, borderRadius: 6, padding: "9px 12px", display: "flex",
                    alignItems: "center", gap: 10, fontSize: 12.5, boxShadow: "0 1px 4px rgba(26,26,24,.08)", flexWrap: "wrap",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 170 }}>Nothing armed. Arm the pin, then click the map.</span>
                  <button style={btnGhostSm()}>Place the property pin</button>
                </div>
              </div>
              <div style={capline()}>
                A <b style={{ color: INK }}>bare map click does nothing</b> — the same gate as the flow's Logistics step.
                Nothing is stored until you confirm, and no coordinate is ever derived from the address line.
              </div>
            </div>

            {/* rail — two cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, alignItems: "start" }}>
              {/* Property pin */}
              <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
                <div style={railHd()}>
                  <b style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Property pin</b>
                  <span style={pill()}>Not placed</span>
                </div>
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ marginBottom: 0 }}>
                    <label style={lbl()}>
                      Address / directions line <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input style={{ ...inp(), fontSize: 12.5 }} placeholder="e.g. Shimbashi-dori, Gion" defaultValue="" />
                    <div style={help()}>
                      Display text — <b style={{ color: INK }}>shown to guests</b>. The pin is what places you on the
                      map; we never guess coordinates from text. Japanese addresses geocode poorly (<i>chōme–banchi–gō</i>,
                      not street-and-number), so the pin is authoritative and this line is prose beside it.
                    </div>
                  </div>
                  <div style={{ ...notice(), marginTop: 10 }}>
                    <b style={{ fontWeight: 650 }}>Not yet locatable.</b> A property with no pin is on no map — and
                    neither are its rooms, which inherit it.
                  </div>
                </div>
              </div>

              {/* What guests see before booking */}
              <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
                <div style={railHd()}>
                  <b style={{ fontSize: 13, fontWeight: 600 }}>What guests see before booking</b>
                  <span style={{ ...propchip(), marginLeft: "auto" }}>Proposed — gap #1 · ratify or amend</span>
                </div>
                <div style={{ padding: "12px 14px" }}>
                  {/* privseg */}
                  <div style={{ display: "inline-flex", border: `1px solid ${HAIR}`, borderRadius: 100, overflow: "hidden", background: PAPER }}>
                    <button style={{ border: "none", background: ACC, color: "#fff", padding: "5px 13px", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
                      Before booking
                    </button>
                    <button style={{ border: "none", background: "none", color: MUT, padding: "5px 13px", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
                      After booking
                    </button>
                  </div>

                  {/* privgrid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginTop: 11 }}>
                    <div style={{ ...privcard(), borderColor: ACC, boxShadow: `0 0 0 1px ${ACC}` }}>
                      <h6 style={privH6()}>Before booking</h6>
                      <PrivMini kind="before" />
                      <p style={privP()}>
                        <b style={{ color: INK }}>Approximate area — exact location after booking.</b> A neighbourhood
                        circle, not the pin. The traveler can tell it is Gion; they cannot tell which machiya.
                      </p>
                    </div>
                    <div style={privcard()}>
                      <h6 style={privH6()}>After booking is confirmed</h6>
                      <PrivMini kind="after" />
                      <p style={privP()}>
                        The exact pin, plus your directions line if you wrote one. Released by the confirmed booking —
                        not by an enquiry, and not by a page view.
                      </p>
                    </div>
                  </div>
                  <div style={capline()}>
                    Inspecting the <b style={{ color: INK }}>pre-booking</b> view. Both states are drawn above so the
                    trade is visible, not just described. Circle size is illustrative — it is not a measured radius.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: HAIR, margin: "22px 0 16px" }} />

          {/* check-in / check-out / min stay */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
            <div style={field()}>
              <label style={lbl()}>Check-in from</label>
              <input style={inp()} defaultValue="15:00" />
            </div>
            <div style={field()}>
              <label style={lbl()}>Check-out by</label>
              <input style={inp()} defaultValue="11:00" />
            </div>
            <div style={field()}>
              <label style={lbl()}>Minimum stay</label>
              <select style={inp()} defaultValue="2 nights">
                <option>1 night</option>
                <option>2 nights</option>
                <option>3 nights</option>
              </select>
            </div>
          </div>

          {/* house rules */}
          <div style={field()}>
            <label style={lbl()}>House rules</label>
            <textarea
              style={{ ...inp(), resize: "vertical" as const, minHeight: 64 }}
              defaultValue="Shoes off at the genkan. No smoking anywhere inside. Quiet after 22:00 — the walls are paper, literally."
            />
          </div>

          {/* amenities — exactly six rows */}
          <div style={field()}>
            <label style={lbl()}>Amenities</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "9px 16px" }}>
              <AmenRow on label="Wi-Fi" />
              <AmenRow on label="Kitchen" />
              <AmenRow on label="Air conditioning" />
              <AmenRow label="Washer" />
              <AmenRow on label="Japanese bath (ofuro)" />
              <AmenRow label="Parking" />
            </div>
          </div>
        </div>

        {/* flowfoot */}
        <div style={{ padding: "0 22px 20px" }}>
          <div style={{ paddingTop: 16, borderTop: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button style={btn()}>Next: Rooms →</button>
            <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>Autosaved as a draft property.</span>
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}

/* ── local pieces ─────────────────────────────────────────────────────── */

function BackLink() {
  return (
    <button
      style={{
        background: "none", border: "none", color: ACC, cursor: "pointer", fontSize: 13,
        textDecoration: "underline", textUnderlineOffset: 2, marginBottom: 14, display: "inline-block",
        padding: 0, fontFamily: "inherit",
      }}
    >
      ← Back to “What are you building?”
    </button>
  );
}

function CardHeader({ activeStep }: { activeStep: number }) {
  const steps = ["1. The property", "2. Rooms", "3. Review"];
  return (
    <div style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>New property</h3>
      <span style={propchip()}>Proposed — gap #1 · ratify or amend</span>
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
        {steps.map((s, i) => (
          <button
            key={s}
            style={{
              border: `1px solid ${i === activeStep ? INK : HAIR}`,
              background: i === activeStep ? INK : PAPER,
              color: i === activeStep ? "#fff" : MUT,
              borderRadius: 100, padding: "5px 13px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {s}
          </button>
        ))}
      </span>
    </div>
  );
}

function Dot({ children, ghost, inline }: { children: React.ReactNode; ghost?: boolean; inline?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 17, height: 17, flex: "0 0 17px", borderRadius: 100,
        background: ghost ? "#EDF2F1" : ACC, color: ghost ? ACC : "#fff",
        border: ghost ? "1px solid #CBDAD7" : undefined,
        fontSize: 11, lineHeight: 1, fontWeight: 600, verticalAlign: "middle",
        marginLeft: inline ? 6 : 0,
      }}
    >
      {children}
    </span>
  );
}

function AmenRow({ on, label }: { on?: boolean; label: string }) {
  return (
    <button
      aria-checked={!!on}
      style={{
        display: "flex", alignItems: "center", gap: 9, fontSize: 13, cursor: "pointer",
        background: "none", border: "none", textAlign: "left", padding: "3px 0", color: INK, fontFamily: "inherit",
      }}
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
}

export function BaseMap({ shift = 0 }: { shift?: number }) {
  const vlines: React.ReactNode[] = [];
  for (let x = 30 + shift; x < 700; x += 58) {
    vlines.push(<line key={`v${x}`} x1={x} y1={0} x2={x - 30} y2={300} stroke="#E2E0D6" strokeWidth={8} />);
  }
  for (let y = 28; y < 300; y += 44) {
    vlines.push(<line key={`h${y}`} x1={0} y1={y} x2={700} y2={y + 12} stroke="#E6E4DA" strokeWidth={5} />);
  }
  return (
    <svg viewBox="0 0 700 300" preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", width: "100%", height: "100%" }}>
      <rect width={700} height={300} fill="#F2F1EB" />
      {vlines}
      <path d="M0 224 C 150 196, 280 262, 440 212 S 650 168, 700 190 L700 300 L0 300 Z" fill="#E3E9E8" />
      <rect x={470} y={36} width={140} height={86} rx={7} fill="#E4E9DF" />
      <rect x={62} y={44} width={96} height={62} rx={6} fill="#EBE8DE" />
      <rect x={228} y={140} width={88} height={54} rx={6} fill="#EBE8DE" />
    </svg>
  );
}

export function PinGlyph({ confirmed, w = 26, h = 34 }: { confirmed: boolean; w?: number; h?: number }) {
  return confirmed ? (
    <svg width={w} height={h} viewBox="0 0 26 34" fill="none" aria-hidden="true">
      <path d="M13 33s11-12.4 11-20A11 11 0 102 13c0 7.6 11 20 11 20z" fill={ACC} />
      <circle cx="13" cy="13" r="4.1" fill="#FAFAF8" />
    </svg>
  ) : (
    <svg width={w} height={h} viewBox="0 0 26 34" fill="none" aria-hidden="true">
      <path d="M13 33s11-12.4 11-20A11 11 0 102 13c0 7.6 11 20 11 20z" fill="#FAFAF8" stroke={ACC} strokeWidth="2" strokeDasharray="4 3" />
      <circle cx="13" cy="13" r="3.6" fill={ACC} opacity=".45" />
    </svg>
  );
}

function PrivMini({ kind }: { kind: "before" | "after" }) {
  return (
    <div style={{ position: "relative", height: 112, border: `1px solid ${HAIR}`, borderRadius: 5, overflow: "hidden", background: "#F1F0EA" }}>
      <BaseMap shift={kind === "after" ? 26 : 12} />
      {kind === "before" ? (
        <>
          <div
            style={{
              position: "absolute", left: "50%", top: "46%", transform: "translate(-50%,-50%)",
              width: 82, height: 82, borderRadius: 100, border: `1.5px dashed ${ACC}`, background: "rgba(53,96,90,.10)",
            }}
          />
          <span
            style={{
              position: "absolute", left: "50%", top: "46%", transform: "translate(-50%,-50%)",
              background: "rgba(255,255,255,.95)", border: `1px solid ${HAIR}`, borderRadius: 100,
              padding: "1px 8px", fontSize: 10.5, color: MUT, whiteSpace: "nowrap",
            }}
          >
            approximate area
          </span>
        </>
      ) : (
        <div style={{ position: "absolute", left: "50%", top: "64%", transform: "translate(-50%,-100%)" }}>
          <PinGlyph confirmed />
          <span
            style={{
              position: "absolute", left: "50%", top: "100%", transform: "translateX(-50%)", marginTop: 3,
              whiteSpace: "nowrap", background: "rgba(255,255,255,.95)", border: `1px solid ${HAIR}`,
              borderRadius: 100, padding: "1px 8px", fontSize: 10.5, color: INK,
            }}
          >
            exact address
          </span>
        </div>
      )}
      <div style={{ position: "absolute", bottom: 6, left: 9, fontSize: 10.5, color: "#8A8A80" }}>© OpenStreetMap contributors</div>
    </div>
  );
}

/* ── style helpers ────────────────────────────────────────────────────── */
function card(): React.CSSProperties {
  return { background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 };
}
function field(): React.CSSProperties {
  return { marginBottom: 16 };
}
function lbl(): React.CSSProperties {
  return { display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5 };
}
function help(): React.CSSProperties {
  return { fontSize: 12, color: MUT, marginTop: 5, lineHeight: 1.5 };
}
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 11px", border: `1px solid ${HAIR}`, borderRadius: 6,
    background: PAPER, color: INK, font: "inherit", fontSize: 13.5, boxSizing: "border-box" as const,
  };
}
function noteQuiet(): React.CSSProperties {
  return { background: GRD, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUT, lineHeight: 1.5 };
}
function notice(): React.CSSProperties {
  return { background: WARN_BG, border: `1px solid ${WARN_LINE}`, color: WARN_INK, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, lineHeight: 1.5 };
}
function propchip(): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 550,
    color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`,
    borderRadius: 100, padding: "2px 10px", whiteSpace: "nowrap" as const,
  };
}
function grouplabel(): React.CSSProperties {
  return { fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase" as const, color: MUT, fontWeight: 600, marginBottom: 10, marginTop: 0 };
}
function capline(): React.CSSProperties {
  return { fontSize: 11.5, color: MUT, lineHeight: 1.55, marginTop: 8 };
}
function photobox(): React.CSSProperties {
  return {
    height: 74, borderRadius: 6, background: "#EDEBE3", border: `1px solid ${HAIR}`,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#B8B6AC",
  };
}
function pill(): React.CSSProperties {
  return { display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: `1px solid ${HAIR}`, color: MUT, background: GRD };
}
function railHd(): React.CSSProperties {
  return { padding: "11px 14px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
}
function privcard(): React.CSSProperties {
  return { border: `1px solid ${HAIR}`, borderRadius: 7, background: PAPER, padding: "10px 12px" };
}
function privH6(): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 7 };
}
function privP(): React.CSSProperties {
  return { fontSize: 11.5, color: MUT, lineHeight: 1.45, margin: "7px 0 0" };
}
function btn(): React.CSSProperties {
  return { border: `1px solid ${INK}`, background: INK, color: "#fff", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, fontFamily: "inherit" };
}
function btnGhostSm(): React.CSSProperties {
  return { border: `1px solid ${HAIR}`, background: "transparent", color: INK, padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, whiteSpace: "nowrap" as const, flex: "0 0 auto", fontFamily: "inherit" };
}
