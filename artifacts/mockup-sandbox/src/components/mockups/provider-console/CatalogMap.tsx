// Catalog — Map mode, RATIFIED / LIVE generation (gap #13 rendered, T-REP, ledger 101).
// Patterns from attached_assets/aftermapm3live_*.png applied to our Kyoto listings and
// the Aiko Tanaka persona. Distribute is live in this frame's sidebar (no dashed treatment).

import type { CSSProperties, ReactNode } from "react";
import { ConsoleShell, DotGhost, T } from "./_consoleShared";

const card: CSSProperties = { background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 7 };

function RatChip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 550,
        color: T.accent, background: T.accentSoft, border: "1px solid #CBDAD7",
        borderRadius: 100, padding: "2px 10px", whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 100, background: T.accent, flex: "0 0 6px" }} />
      {children}
    </span>
  );
}

function BaseMap({ h, children }: { h: number; children?: ReactNode }) {
  return (
    <div style={{ position: "relative", height: h, borderRadius: 7, overflow: "hidden", border: `1px solid ${T.hair}`, background: "#F1F0EA" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        {[18, 42, 66, 88].map((y) => (
          <line key={y} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="#E2E0D6" strokeWidth="3" />
        ))}
        {[12, 30, 52, 74, 90].map((x) => (
          <line key={x} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" stroke="#E2E0D6" strokeWidth="3" />
        ))}
        <path d="M0 70 Q 120 45 260 60 T 600 55" stroke="#C9D6D2" strokeWidth="10" fill="none" />
      </svg>
      {children}
      <span style={{ position: "absolute", bottom: 6, left: 9, fontSize: 10.5, color: "#8A8A80" }}>© OpenStreetMap contributors</span>
    </div>
  );
}

function Pin({ left, top, cap }: { left: string; top: string; cap?: string }) {
  return (
    <div style={{ position: "absolute", left, top, transform: "translate(-50%,-100%)", pointerEvents: "none" }}>
      <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden="true">
        <path d="M11 27C11 27 21 16.5 21 10.6 21 5 16.5 1 11 1S1 5 1 10.6C1 16.5 11 27 11 27Z" fill={T.accent} stroke="#FAFAF8" strokeWidth="1.6" />
        <circle cx="11" cy="10.5" r="3.4" fill="#fff" />
      </svg>
      {cap && (
        <span style={{ position: "absolute", left: "50%", top: "100%", transform: "translateX(-50%)", marginTop: 3, whiteSpace: "nowrap", background: "rgba(255,255,255,.95)", border: `1px solid ${T.hair}`, borderRadius: 100, padding: "1px 8px", fontSize: 10.5, color: T.ink }}>
          {cap}
        </span>
      )}
    </div>
  );
}

function StopRow({ name, right, last }: { name: string; right: ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderBottom: last ? "none" : `1px solid ${T.hair}`, fontSize: 13, flexWrap: "wrap" }}>
      <span style={{ width: 20, height: 20, flex: "0 0 20px", borderRadius: 100, background: T.warnBg, color: T.warnInk, border: `1px solid ${T.warnLine}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>–</span>
      <span style={{ flex: 1, minWidth: 150 }}>{name}</span>
      {right}
    </div>
  );
}

function SumRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "9px 0", borderBottom: `1px solid ${T.hair}`, fontSize: 13, flexWrap: "wrap" }}>
      <div style={{ width: 180, flex: "0 0 180px", color: T.muted }}>{k}</div>
      <div style={{ flex: 1, minWidth: 200 }}>{v}</div>
    </div>
  );
}

const tcardHd: CSSProperties = { padding: "10px 14px", borderBottom: `1px solid ${T.hair}`, fontSize: 12.5, fontWeight: 600 };
const tcardFoot: CSSProperties = { padding: "0 14px 13px", fontSize: 11.5, color: T.muted, lineHeight: 1.55 };

const UNANSWERED = [
  "Party size", "Runs on", "Start window", "Changes until", "Duration", "Buffer",
  "Free cancellation until", "Languages", "Getting there", "Getting back",
  "Transport", "Deposit", "Response time", "What's covered",
];

export function CatalogMap() {
  return (
    <ConsoleShell distributeLive crumbs={[{ label: "Catalog" }, { label: "Map · Traveler preview", current: true }]}>
      {/* catalog header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 20, fontWeight: 650, letterSpacing: "-0.01em", marginBottom: 4, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            Catalog<DotGhost>⑦</DotGhost>
          </h2>
          <p style={{ color: T.muted, fontSize: 13, marginBottom: 0, maxWidth: "74ch" }}>
            What you sell — 6 listings. Storefront, share kit and the promote feed now live on{" "}
            <b style={{ color: T.ink }}>Distribute</b>; new listings are born on{" "}
            <b style={{ color: T.ink }}>Workstation</b>.
          </p>
        </div>
        <button type="button" style={{ border: `1px solid ${T.ink}`, background: T.ink, color: "#fff", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, font: "inherit" }}>
          + Add New Service
        </button>
      </div>

      {/* toolbar — Map active */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "14px 18px" }}>
          <input aria-label="Search listings" placeholder="Search your listings" readOnly style={{ maxWidth: 230, flex: "0 1 230px", padding: "9px 11px", border: `1px solid ${T.hair}`, borderRadius: 6, background: T.paper, color: T.ink, font: "inherit", fontSize: 13.5 }} />
          <div style={{ display: "inline-flex", border: `1px solid ${T.hair}`, borderRadius: 6, overflow: "hidden", background: T.paper }}>
            {["All", "Live", "In review", "Draft"].map((s, i) => (
              <button key={s} type="button" aria-pressed={s === "All"} style={{ background: s === "All" ? T.ink : T.paper, color: s === "All" ? "#fff" : T.muted, border: "none", borderRight: i < 3 ? `1px solid ${T.hair}` : "none", padding: "7px 13px", fontSize: 12.5, cursor: "pointer", font: "inherit" }}>{s}</button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "inline-flex", border: `1px solid ${T.hair}`, borderRadius: 6, overflow: "hidden", background: T.paper }}>
            {["List", "Map"].map((s, i) => (
              <button key={s} type="button" aria-pressed={s === "Map"} style={{ background: s === "Map" ? T.ink : T.paper, color: s === "Map" ? "#fff" : T.muted, border: "none", borderRight: i < 1 ? `1px solid ${T.hair}` : "none", padding: "7px 13px", fontSize: 12.5, cursor: "pointer", font: "inherit" }}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      {/* amber notice — amended posture */}
      <div style={{ background: T.warnBg, border: `1px solid ${T.warnLine}`, color: T.warnInk, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, lineHeight: 1.5, marginBottom: 14 }}>
        <b style={{ fontWeight: 650 }}>Traveler preview — read-only.</b> This is what a traveler sees. Pins, radius, zones and route
        stops are authored in the create flow's <b style={{ fontWeight: 650 }}>step 4, “Logistics”</b> —{" "}
        <button type="button" style={{ background: "none", border: "none", color: T.accent, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 12.5, font: "inherit" }}>open it →</button>.
        <span style={{ display: "block", marginTop: 6 }}>
          This placement <b style={{ fontWeight: 650 }}>amends</b> the earlier “Catalog is the map's authoring home” posture:
          Catalog keeps the preview, the flow owns the authoring.
        </span>
      </div>

      {/* big traveler map */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ padding: "20px 22px" }}>
          <BaseMap h={300}>
            <Pin left="36%" top="38%" cap="Food walk" />
            <Pin left="58%" top="62%" cap="Kimono & photo walk" />
            <span style={{ position: "absolute", bottom: 9, right: 9, background: "rgba(255,255,255,.94)", border: `1px solid ${T.hair}`, borderRadius: 100, padding: "3px 10px", fontSize: 11, color: T.muted }}>
              Map preview — illustrative
            </span>
          </BaseMap>
          <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, marginTop: 8 }}>
            <b style={{ color: T.ink }}>2 of 3 place-anchored listings located.</b> Remote and artifact listings are not counted
            as missing — they happen nowhere, and that is a real answer. Nothing here can be dragged, armed or placed; to change
            a location you go back to the flow's Logistics step.
          </div>
        </div>
        <div style={{ padding: "0 22px 20px" }}>
          <h5 style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: T.muted, fontWeight: 600, marginBottom: 10 }}>Not located</h5>
          <div style={{ border: `1px solid ${T.hair}`, borderRadius: 6, overflow: "hidden" }}>
            <StopRow
              name="Morning Tea Ceremony in a Machiya Townhouse"
              right={
                <>
                  <span style={{ fontSize: 11.5, color: "#8A6A22", background: T.warnBg, border: `1px solid ${T.warnLine}`, borderRadius: 100, padding: "1px 8px" }}>no confirmed pin — not drawn</span>
                  <button type="button" style={{ background: "none", border: "none", color: T.accent, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 12, font: "inherit" }}>Fix it in step 4 →</button>
                </>
              }
            />
            <StopRow name="Tokyo Like a Local — 3-Day Neighbourhood Guide" right={<span style={{ fontSize: 11.5, color: T.muted }}>PDF guide — it happens nowhere</span>} />
            <StopRow last name="Kyoto Trip Planning Call — 45 minutes" right={<span style={{ fontSize: 11.5, color: T.muted }}>Video call — it happens nowhere</span>} />
          </div>
          <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, marginTop: 8 }}>
            A listing with no coordinates is named here and left off the canvas. Never a city-center
            fallback, never another listing's shapes standing in for this one.
          </div>
        </div>
      </div>

      {/* PREVIEWING chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
        <span style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: T.muted, fontWeight: 600 }}>Previewing</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, border: "1px solid #CBDAD7", background: T.accentSoft, borderRadius: 100, padding: "3px 12px" }}>
          <b style={{ fontWeight: 600, color: T.ink }}>Gion Evening Food Walk</b>
          <span style={{ color: T.accent, fontWeight: 600, fontSize: 11.5 }}>exact pin</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, border: `1px solid ${T.hair}`, background: T.paper, borderRadius: 100, padding: "3px 12px" }}>
          <b style={{ fontWeight: 600, color: T.ink }}>Kimono Dressing &amp; Gion Photo Walk</b>
          <span style={{ color: T.muted, fontSize: 11.5 }}>approximate</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, border: `1px dashed ${T.warnLine}`, background: T.warnBg, borderRadius: 100, padding: "3px 12px" }}>
          <b style={{ fontWeight: 600, color: T.warnInk }}>Morning Tea Ceremony</b>
          <span style={{ color: T.warnInk, fontSize: 11.5 }}>unlocated — not drawn</span>
        </span>
      </div>

      {/* ⑪ what the traveler sees */}
      <h2 style={{ fontSize: 18, fontWeight: 650, letterSpacing: "-0.01em", marginBottom: 4, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        What the traveler sees<DotGhost>⑪</DotGhost>
      </h2>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 18, maxWidth: "74ch" }}>
        The traveler map renders what is actually known and nothing else. Never a city-center fallback.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16, marginBottom: 26, alignItems: "start" }}>
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={tcardHd}>Confirmed pin + radius</div>
          <div style={{ padding: 13 }}>
            <BaseMap h={132}>
              <span style={{ position: "absolute", left: "50%", top: "52%", width: 92, height: 92, transform: "translate(-50%,-50%)", borderRadius: 100, border: `1px dashed ${T.accent}`, background: "rgba(53,96,90,.08)", pointerEvents: "none" }} />
              <Pin left="50%" top="52%" />
            </BaseMap>
          </div>
          <div style={tcardFoot}>
            Meeting point in Gion · host travels free up to 8 km.
            <span style={{ display: "block", marginTop: 6 }}>
              Whether the traveler sees the exact pin or a fuzzed neighbourhood point is{" "}
              <b style={{ color: T.ink }}>a spec decision, not a shipped behaviour</b> — the canvas draws the
              authored point as-is. No precision rule is implied.
            </span>
          </div>
        </div>
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={tcardHd}>Route service — partly located</div>
          <div style={{ padding: 13 }}>
            <div style={{ border: `1px dashed ${T.hair}`, borderRadius: 6, background: T.ground, padding: "20px 16px", height: 132, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 5 }}>
              <b style={{ fontSize: 13 }}>No stops saved</b>
              <span style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                A route is authored on the listing's Logistics step.
              </span>
            </div>
          </div>
          <div style={tcardFoot}>
            Kimono Dressing &amp; Gion Photo Walk names two route stops without coordinates. An unlocated stop is
            named on its Logistics step and left off the canvas — never guessed onto the map.
          </div>
        </div>
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={tcardHd}>No coordinates — no map</div>
          <div style={{ padding: 13 }}>
            <div style={{ border: `1px dashed ${T.hair}`, borderRadius: 6, background: T.ground, padding: "20px 16px", height: 132, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 5 }}>
              <b style={{ fontSize: 13 }}>Location shared after booking</b>
              <span style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                This host has not pinned a location yet.<br />We would rather show nothing than guess one.
              </span>
            </div>
          </div>
          <div style={tcardFoot}>
            No map renders at all. Never a city-center fallback, never another listing's shapes standing in for
            this one.
          </div>
        </div>
      </div>

      {/* separate-decision band (formerly the ⑫ dashed card) */}
      <div style={{ ...card, padding: "16px 22px", marginBottom: 26, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <DotGhost style={{ marginTop: 2 }}>⑫</DotGhost>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>Separate decision — the market-insight overlays</div>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
            Demand heat and coverage-gap overlays are <b style={{ color: T.ink }}>analytics, not authoring</b> —
            they tell you where to sell, not where your listing is. They are proposed to move to Performance,
            where the rest of the measurement lives. <b style={{ color: T.ink }}>That move is not part of this
            approval</b> — flagged here so it is not decided by accident.
          </div>
        </div>
      </div>

      {/* ⑬ render it, or stop collecting it — ratified */}
      <section>
        <h2 style={{ fontSize: 20, fontWeight: 650, letterSpacing: "-0.01em", marginBottom: 4, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          Render it, or stop collecting it<DotGhost>⑬</DotGhost>
          <RatChip>Ratified — gap #13 · rendered, T-REP (ledger 101)</RatChip>
        </h2>
        <p style={{ color: T.muted, fontSize: 13, marginBottom: 18, maxWidth: "74ch" }}>
          The rule: every answer the create flow collects either has a traveler-side representation, or an
          explicit decision that it is provider-only. These are this listing's real answers, resolved with the
          same formatters the traveler's own page uses — not a paraphrase of them.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          <div style={card}>
            <div style={{ padding: "14px 22px", borderBottom: `1px solid ${T.hair}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>What the traveler sees</h3>
              <span style={{ marginLeft: "auto", fontSize: 12, color: T.muted }}>Gion Evening Food Walk</span>
            </div>
            <div style={{ padding: "6px 22px 20px" }}>
              <SumRow k="Book by" v="24 hours before the start — the host's lead time" />
              <SumRow k="Travel fee" v="None within 8 km of the meeting point. Beyond that, a fee may apply — the host will confirm." />
              <div style={{ padding: "11px 0", borderBottom: `1px solid ${T.hair}`, fontSize: 12.5, lineHeight: 1.6 }}>
                <b style={{ fontWeight: 650 }}>14 questions unanswered</b>
                <span style={{ color: T.muted }}> — {UNANSWERED.join(", ")}</span>
              </div>
              <div style={{ padding: "11px 0 2px", fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                <b style={{ color: T.ink, fontWeight: 600 }}>Bring</b> and <b style={{ color: T.ink, fontWeight: 600 }}>Access</b>{" "}
                appear in the ratified mock but have no field behind them yet — named here as the open half of
                gap #13, not faked.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ ...card, padding: "20px 22px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>The rule this demonstrates</div>
              <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
                Every question the flow asks is something a traveler can read before paying. Where a field has no
                traveler-side home, the rule is to <b style={{ color: T.ink }}>stop asking for it</b> rather than
                store an answer nobody will ever see. T-REP chose <b style={{ color: T.ink }}>render</b> for every
                field it audited — nothing was dropped.
              </div>
            </div>
            <div style={{ ...card, padding: "20px 22px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Deliberately provider-only</div>
              <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6, marginBottom: 10 }}>
                Not everything should surface. These stay <b style={{ color: T.ink }}>private by decision</b>,
                not by accident:
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {["Build notes", "Exact street address until booked", "Blackout reasons", "Cost / margin working"].map((p) => (
                  <span key={p} style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: `1px solid ${T.hair}`, color: T.muted, background: T.ground }}>{p}</span>
                ))}
              </div>
            </div>
            <div style={{ ...card, padding: "20px 22px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Meeting pin</div>
              <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>Exact pin confirmed.</div>
              <button
                type="button"
                style={{
                  width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: "transparent", color: T.ink, border: `1px solid ${T.hair}`, borderRadius: 6,
                  padding: "9px 14px", fontSize: 13, fontWeight: 550, cursor: "pointer", font: "inherit",
                }}
              >
                ✎ Edit location &amp; route
              </button>
              <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, marginTop: 9 }}>
                Opens this listing's <b style={{ color: T.ink }}>Logistics</b> step — the one place the pin, the
                radius and the stops are authored.
              </div>
            </div>
          </div>
        </div>
      </section>
    </ConsoleShell>
  );
}
