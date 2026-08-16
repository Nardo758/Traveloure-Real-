// Catalog — Map mode (traveler preview, read-only).
// Per the Aug 12 2026 ruling: no arm bar, no pin/stop placement, no radius control,
// no Authoring | Traveler sub-toggle. Authoring lives in the create flow's step 4, Logistics.

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";

const card = { background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8 };

function FauxMap({ h, children }: { h: number; children?: React.ReactNode }) {
  return (
    <div style={{ position: "relative", height: h, borderRadius: 6, overflow: "hidden", border: `1px solid ${HAIR}`, background: "#F1F0EA" }}>
      {/* street grid */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        {[18, 42, 66, 88].map(y => <line key={y} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="#E2E0D6" strokeWidth="3" />)}
        {[12, 30, 52, 74, 90].map(x => <line key={x} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" stroke="#E2E0D6" strokeWidth="3" />)}
        <path d="M 0 70 Q 40 55 100 62 T 200 60" stroke="#C9D6D2" strokeWidth="8" fill="none" transform="scale(3.2,2.2)" />
      </svg>
      {children}
      <span style={{ position: "absolute", bottom: 6, left: 9, fontSize: 10.5, color: "#8A8A80" }}>© OpenStreetMap contributors</span>
    </div>
  );
}

function Pin({ left, top, dim }: { left: string; top: string; dim?: boolean }) {
  return (
    <span style={{ position: "absolute", left, top, transform: "translate(-50%,-100%)", fontSize: 18, opacity: dim ? 0.45 : 1 }}>📍</span>
  );
}

function Radius({ left, top, size }: { left: string; top: string; size: number }) {
  return (
    <span style={{ position: "absolute", left, top, width: size, height: size, transform: "translate(-50%,-50%)", borderRadius: 999, border: `1.5px dashed ${ACC}`, background: "#35605A14" }} />
  );
}

export function CatalogMap() {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif", color: INK }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: `1px solid ${HAIR}`, background: PAPER }}>
        <div style={{ width: 30, height: 30, borderRadius: 999, background: "#1F3B38", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>AT</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>Aiko Tanaka</p>
          <p style={{ fontSize: 11, color: MUT, margin: 0 }}>Machiya Kikuya · Gion, Kyoto · Provider</p>
        </div>
        {/* List | Map toggle */}
        <div style={{ display: "flex", border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden" }}>
          <button style={{ fontSize: 12, padding: "6px 16px", border: "none", background: PAPER, color: MUT, cursor: "pointer", fontFamily: "inherit" }}>List</button>
          <button style={{ fontSize: 12, fontWeight: 700, padding: "6px 16px", border: "none", background: "#EDF2F1", color: ACC, cursor: "pointer", fontFamily: "inherit" }}>Map</button>
        </div>
      </div>

      <div style={{ padding: "10px 24px", fontSize: 11.5, borderBottom: `1px solid ${HAIR}`, background: PAPER }}>
        <span style={{ color: ACC, textDecoration: "underline", cursor: "pointer" }}>Catalog</span>
        <span style={{ color: MUT }}> · </span>
        <span style={{ color: INK, fontWeight: 600 }}>Map</span>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "18px 24px 32px" }}>

        {/* ── Read-only notice ── */}
        <div style={{ background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 7, padding: "12px 16px", marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: WARN_INK, margin: 0, lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700 }}>Traveler preview — read-only.</span> This is what a traveler sees. Pins, radius, zones and route stops are authored in the create flow's <span style={{ fontWeight: 700 }}>step 4, “Logistics”</span> — <span style={{ color: ACC, textDecoration: "underline", cursor: "pointer" }}>open it →</span>
            <span style={{ display: "block", marginTop: 6 }}>This placement <span style={{ fontWeight: 700 }}>amends</span> the earlier “Catalog is the map's authoring home” posture: Catalog keeps the preview, the flow owns the authoring.</span>
          </p>
        </div>

        {/* ── Big traveler map ── */}
        <div style={{ ...card, padding: "16px 18px", marginBottom: 22 }}>
          <FauxMap h={300}>
            <span style={{ position: "absolute", top: 8, left: 9, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: MUT, background: "#FFFFFFD9", border: `1px solid ${HAIR}`, borderRadius: 4, padding: "3px 8px" }}>Map preview — illustrative</span>
            <Radius left="38%" top="52%" size={150} />
            <Pin left="38%" top="52%" />
            <Pin left="58%" top="34%" />
            <Pin left="70%" top="62%" />
            <Pin left="49%" top="70%" />
          </FauxMap>
          <p style={{ fontSize: 11.5, color: MUT, margin: "10px 0 14px" }}>
            4 of 6 listings located · Gion Evening Food Walk drawn with its 8 km travel radius.
          </p>

          <p style={{ fontSize: 10.5, fontWeight: 700, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.08em", margin: "0 0 8px" }}>Not located</p>
          {[
            ["Kyoto Trip Planning Call — 45 minutes", "video call — no place to draw"],
            ["Machiya Kikuya — the Tatami Room", "no property pin yet"],
          ].map(([name, why]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "8px 12px", marginBottom: 6 }}>
              <span style={{ width: 16, height: 16, borderRadius: 999, border: `1px solid ${HAIR}`, color: MUT, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>–</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{name}</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: MUT, background: GRD, border: `1px solid ${HAIR}`, borderRadius: 999, padding: "2px 9px", flexShrink: 0 }}>{why}</span>
            </div>
          ))}
          <p style={{ fontSize: 11.5, color: MUT, margin: "8px 0 0", lineHeight: 1.55 }}>
            A listing with no coordinates is named here and left off the canvas. Never a city-center fallback, never another listing's shapes standing in for this one.
          </p>
        </div>

        {/* ── What the traveler sees ── */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>What the traveler sees</h2>
          <span style={{ fontSize: 11, color: MUT }}>⑪</span>
        </div>
        <p style={{ fontSize: 12, color: MUT, margin: "0 0 12px" }}>The traveler map renders what is actually known and nothing else. Never a city-center fallback.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22, alignItems: "start" }}>

          {/* Card 1 — confirmed pin + radius */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${HAIR}`, fontSize: 12.5, fontWeight: 700 }}>Confirmed pin + radius</div>
            <div style={{ padding: "12px 14px" }}>
              <FauxMap h={132}>
                <Radius left="50%" top="50%" size={90} />
                <Pin left="50%" top="50%" />
              </FauxMap>
            </div>
            <div style={{ padding: "0 14px 12px", fontSize: 11.5, color: MUT, lineHeight: 1.55 }}>
              Meeting point in Gion · host travels free up to 8 km.
              <span style={{ display: "block", marginTop: 6, color: WARN_INK }}>
                Whether the traveler sees the exact pin or a fuzzed neighbourhood point is a <b>spec decision, not a shipped behaviour</b> (spec gap #13). This canvas draws the authored point as-is — no precision rule is implied.
              </span>
            </div>
          </div>

          {/* Card 2 — route partly located */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${HAIR}`, fontSize: 12.5, fontWeight: 700 }}>Route service — partly located</div>
            <div style={{ padding: "12px 14px" }}>
              <FauxMap h={132}>
                <Pin left="30%" top="40%" /><Pin left="55%" top="60%" /><Pin left="75%" top="35%" />
              </FauxMap>
              {[ "Nishiki market — west end", "Pontocho alley, north entrance" ].map(s => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "6px 10px", marginTop: 8 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 999, border: `1px solid ${HAIR}`, color: MUT, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>–</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600 }}>{s}</span>
                  <span style={{ marginLeft: "auto", fontSize: 9.5, color: MUT, background: GRD, border: `1px solid ${HAIR}`, borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>not located</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "0 14px 12px", fontSize: 11.5, color: MUT, lineHeight: 1.55 }}>
              <b style={{ color: INK }}>3 of 5 stops located.</b> Only the three with coordinates are drawn. The other two are named above — not dropped, and not guessed onto the map.
            </div>
          </div>

          {/* Card 3 — no coordinates */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${HAIR}`, fontSize: 12.5, fontWeight: 700 }}>No coordinates — no map</div>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 6, background: GRD, height: 132, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center" as const, padding: "0 16px", boxSizing: "border-box" as const }}>
                <b style={{ fontSize: 12.5 }}>Location shared after booking</b>
                <span style={{ fontSize: 11, color: MUT, lineHeight: 1.5 }}>This host has not pinned a location yet.<br />We would rather show nothing than guess one.</span>
              </div>
            </div>
            <div style={{ padding: "0 14px 12px", fontSize: 11.5, color: MUT, lineHeight: 1.55 }}>
              No map renders at all. Never a city-center fallback, never another listing's shapes standing in for this one.
            </div>
          </div>
        </div>

        {/* ── ⑫ overlays note ── */}
        <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 8, background: PAPER, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 11, color: MUT, marginTop: 2 }}>⑫</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Separate decision — the market-insight overlays</p>
            <p style={{ fontSize: 12, color: MUT, margin: 0, lineHeight: 1.6 }}>
              Demand heat and coverage-gap overlays are <b style={{ color: INK }}>analytics, not authoring</b> — they tell you where to sell, not where your listing is. They are proposed to move to Performance, where the rest of the measurement lives. <b style={{ color: INK }}>That move is not part of this approval</b> — flagged here so it is not decided by accident.
            </p>
          </div>
        </div>

        {/* ── Deliberately provider-only ── */}
        <div style={{ ...card, padding: "14px 16px" }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 6px" }}>Deliberately provider-only</p>
          <p style={{ fontSize: 12, color: MUT, margin: "0 0 10px", lineHeight: 1.6 }}>
            Not everything should surface. These are proposed as <b style={{ color: INK }}>private by decision</b>, not by accident:
          </p>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" as const }}>
            {["Build notes", "Exact street address until booked", "Blackout reasons", "Cost / margin working"].map(p => (
              <span key={p} style={{ fontSize: 11, color: INK, background: GRD, border: `1px solid ${HAIR}`, borderRadius: 999, padding: "4px 12px" }}>{p}</span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
