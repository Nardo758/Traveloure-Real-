// Distribute — where your listings meet an audience
// Faithful to docs/design/provider-console-mockup/mockup.html view-distribute.

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

export function Distribute() {
  return (
    <ConsoleShell active="distribute" crumbs={[{ label: "Distribute", current: true }]}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 20, fontWeight: 650, letterSpacing: "-.01em", marginBottom: 4, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            Distribute
            <span
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", width: 17, height: 17,
                flex: "0 0 17px", borderRadius: 100, background: "#EDF2F1", color: ACC,
                border: "1px solid #CBDAD7", fontSize: 11, lineHeight: 1, fontWeight: 600,
              }}
            >
              ⑧
            </span>
          </h2>
          <p style={{ color: MUT, fontSize: 13, marginBottom: 0, maxWidth: "74ch" }}>
            Where your listings meet an audience. This page already exists in the product — it has{" "}
            <b style={{ color: INK }}>no way to reach it from the nav</b>, which is why the sidebar gains an entry
            for it.
          </p>
        </div>
        <span style={propchip()}>Proposed — nav entry · ratify or amend</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Storefront */}
        <div style={card()}>
          <div style={cardHd()}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Your storefront</h3>
            <span style={pill()}>moves here from Catalog</span>
          </div>
          <div style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  width: 29, height: 29, flex: "0 0 29px", borderRadius: 100, background: "#EDF2F1",
                  border: "1px solid #CBDAD7", color: ACC, fontSize: 11, fontWeight: 650,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                AT
              </span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 13.5, fontWeight: 650 }}>Machiya Kikuya</div>
                <div style={{ fontSize: 12.5, color: MUT }}>traveloure.com/s/machiya-kikuya · 3 of 6 listings shown (the live ones)</div>
              </div>
              <button style={btnGhostSm()}>Edit handle &amp; bio</button>
              <button style={btnGhostSm()}>Share storefront</button>
            </div>
            <div style={{ ...noteQuiet(), marginTop: 14 }}>
              The storefront manager bar sat across the top of Catalog, above the listings it had nothing to do with.
              Catalog is <b style={{ color: INK }}>what you sell</b>; this is <b style={{ color: INK }}>how you sell it</b>.
            </div>
          </div>
        </div>

        {/* Share kit */}
        <div style={card()}>
          <div style={cardHd()}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Share kit</h3>
            <span style={pill()}>moves here from Catalog</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>
              Server-rendered from the listing row — the same three formats that exist today
            </span>
          </div>
          <div style={{ padding: "20px 22px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
              <ShareFrame glyph="▤" name="Feed" desc="Square card for a post" />
              <ShareFrame glyph="▯" name="Story" desc="Tall frame for stories" />
              <ShareFrame glyph="⟿" name="Route" desc="Your stops, in sequence" />
            </div>
            <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
              <button style={btnGhostSm()}>Copy listing link</button>
              <button style={btnGhostSm()}>Download QR</button>
            </div>
            <div style={{ ...noteQuiet(), marginTop: 14 }}>
              The Route frame draws the same stops you authored on the map — straight dashed connectors,{" "}
              <b style={{ color: INK }}>sequence, not travel routing</b>. No distance or duration is invented for a
              share image either.
            </div>
          </div>
        </div>

        {/* Promote */}
        <div style={card()}>
          <div style={cardHd()}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Promote</h3>
            <span style={pill()}>moves here from Catalog</span>
          </div>
          <div style={{ padding: "6px 22px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderBottom: `1px solid ${HAIR}`, fontSize: 13, flexWrap: "wrap" }}>
              <span style={pos()}>1</span>
              <span style={{ flex: 1, minWidth: 150 }}>
                <b>Gion Evening Food Walk has 4 seats on Thu 20 Aug</b>
                <br />
                <span style={{ color: MUT, fontSize: 12 }}>
                  Two days out and half empty. A story frame with the date on it is the cheapest thing you can do about it.
                </span>
              </span>
              <button style={btnGhostSm()}>Make a story</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", fontSize: 13, flexWrap: "wrap" }}>
              <span style={pos()}>2</span>
              <span style={{ flex: 1, minWidth: 150 }}>
                <b>Tokyo Like a Local has no sample pages set</b>
                <br />
                <span style={{ color: MUT, fontSize: 12 }}>
                  Guides with a free sample are opened more often. Three pages is enough.
                </span>
              </span>
              <button style={btnGhostSm()}>Set a sample</button>
            </div>
            <div style={{ ...noteQuiet(), marginTop: 14 }}>
              <b style={{ color: INK }}>Measurement stays on Performance.</b> This page makes the asset and hands
              you the link; how it did is a question the analytics module answers. The share rail never grows its own
              analytics.
            </div>
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}

/* ── local pieces ─────────────────────────────────────────────────────── */

function ShareFrame({ glyph, name, desc }: { glyph: string; name: string; desc: string }) {
  return (
    <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7, overflow: "hidden" }}>
      <div style={{ padding: 13 }}>
        <div
          style={{
            height: 96, borderRadius: 6, background: "#EDEBE3", border: `1px solid ${HAIR}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#B8B6AC",
          }}
        >
          {glyph}
        </div>
      </div>
      <div style={{ padding: "0 14px 13px", fontSize: 11.5, color: MUT, lineHeight: 1.55 }}>
        <b style={{ color: INK }}>{name}</b>
        <br />
        {desc}
      </div>
    </div>
  );
}

function pos(): React.CSSProperties {
  return {
    width: 20, height: 20, flex: "0 0 20px", borderRadius: 100, background: GRD,
    border: `1px solid ${HAIR}`, display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, color: MUT,
  };
}

/* ── style helpers ────────────────────────────────────────────────────── */
function card(): React.CSSProperties {
  return { background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 };
}
function cardHd(): React.CSSProperties {
  return { padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
}
function pill(): React.CSSProperties {
  return { display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: `1px solid ${HAIR}`, color: MUT, background: GRD };
}
function propchip(): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 550,
    color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`,
    borderRadius: 100, padding: "2px 10px", whiteSpace: "nowrap" as const,
  };
}
function noteQuiet(): React.CSSProperties {
  return { background: GRD, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUT, lineHeight: 1.5 };
}
function btnGhostSm(): React.CSSProperties {
  return { border: `1px solid ${HAIR}`, background: "transparent", color: INK, padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, whiteSpace: "nowrap" as const, flex: "0 0 auto", fontFamily: "inherit" };
}
