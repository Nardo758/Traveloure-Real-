// Catalog — list mode. Faithful replica of docs/design/provider-console-mockup/mockup.html
// (lines ~648-680 + the LISTINGS render JS).

import { ConsoleShell, DotGhost, T } from "./_consoleShared";

const LISTINGS = [
  { n: "Gion Evening Food Walk", m: "In person · Gion, Kyoto · $52 per person", s: "live", st: "Live", h: 96, warn: false, hn: "Complete", av: true },
  { n: "Morning Tea Ceremony in a Machiya Townhouse", m: "In person · Gion, Kyoto · $68 per person", s: "draft", st: "Draft", h: 62, warn: true, hn: "Needs a cover photo", av: false },
  { n: "Tokyo Like a Local — 3-Day Neighbourhood Guide", m: "PDF guide · instant delivery · $24", s: "live", st: "Live", h: 94, warn: false, hn: "Complete", av: true },
  { n: "Kyoto Trip Planning Call — 45 minutes", m: "Video call · 45 min · $40", s: "", st: "In review", h: 88, warn: false, hn: "Complete", av: false },
  { n: "Machiya Kikuya — the Tatami Room", m: "Property room · nightly · $180 per night", s: "draft", st: "Draft", h: 44, warn: true, hn: "No dates published", av: true },
  { n: "Kimono Dressing & Gion Photo Walk", m: "In person · Higashiyama · $120 per group", s: "live", st: "Live", h: 71, warn: true, hn: "2 route stops unlocated", av: false },
];

function Pill({ s, st }: { s: string; st: string }) {
  const styles =
    s === "live"
      ? { borderColor: "#BFD5D0", background: T.accentSoft, color: T.accent }
      : s === "draft"
      ? { borderColor: "#D9CDB2", background: "#FBF6EC", color: "#6B551F" }
      : { borderColor: T.hair, background: T.ground, color: T.muted };
  return (
    <span style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: "1px solid", ...styles }}>
      {st}
    </span>
  );
}

function Seg({ items, active }: { items: string[]; active: string }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${T.hair}`, borderRadius: 6, overflow: "hidden", background: T.paper }}>
      {items.map((it, i) => (
        <button
          key={it}
          type="button"
          aria-pressed={it === active}
          style={{
            background: it === active ? T.ink : T.paper,
            color: it === active ? "#fff" : T.muted,
            border: "none", borderRight: i < items.length - 1 ? `1px solid ${T.hair}` : "none",
            padding: "7px 13px", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", font: "inherit",
          }}
        >
          {it}
        </button>
      ))}
    </div>
  );
}

export function CatalogList() {
  return (
    <ConsoleShell crumbs={[{ label: "Catalog", current: true }]}>
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
        <button
          type="button"
          style={{ border: `1px solid ${T.ink}`, background: T.ink, color: "#fff", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, font: "inherit" }}
        >
          + Add New Service
        </button>
      </div>

      {/* toolbar */}
      <div style={{ background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 7, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "14px 18px" }}>
          <input
            aria-label="Search listings"
            placeholder="Search your listings"
            readOnly
            style={{
              maxWidth: 230, flex: "0 1 230px", padding: "9px 11px", border: `1px solid ${T.hair}`, borderRadius: 6,
              background: T.paper, color: T.ink, font: "inherit", fontSize: 13.5,
            }}
          />
          <Seg items={["All", "Live", "In review", "Draft"]} active="All" />
          <div style={{ marginLeft: "auto" }}>
            <Seg items={["List", "Map"]} active="List" />
          </div>
        </div>
      </div>

      {/* listings */}
      <div style={{ background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 7 }}>
        {LISTINGS.map((l, i) => (
          <div
            key={l.n}
            style={{ display: "flex", gap: 14, padding: "15px 18px", borderBottom: i < LISTINGS.length - 1 ? `1px solid ${T.hair}` : "none", alignItems: "flex-start", flexWrap: "wrap" }}
          >
            <div style={{ width: 74, height: 56, flex: "0 0 74px", borderRadius: 5, background: "#EDEBE3", border: `1px solid ${T.hair}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="#B8B6AC" strokeWidth="1.6" />
                <path d="M5 16l4.5-5 3.2 3.6L15.5 12 19 16" stroke="#B8B6AC" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{l.n}</div>
              <div style={{ fontSize: 12.5, color: T.muted }}>{l.m}</div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 9, flexWrap: "wrap" }}>
                <Pill s={l.s} st={l.st} />
                <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12.5, color: T.muted, cursor: "pointer" }}>
                  <span style={{ width: 32, height: 18, borderRadius: 100, background: l.s === "live" ? T.accent : T.hair, position: "relative", display: "inline-block" }}>
                    <span style={{ position: "absolute", top: 2, left: l.s === "live" ? 16 : 2, width: 14, height: 14, borderRadius: 100, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
                  </span>
                  Show on my storefront
                </label>
                {l.av && (
                  <button type="button" style={{ background: "none", border: "none", color: T.accent, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 12.5, fontWeight: 500, font: "inherit" }}>
                    Availability →
                  </button>
                )}
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right", display: "flex", flexDirection: "column", gap: 7, alignItems: "flex-end" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted }}>
                <span style={{ width: 56, height: 5, borderRadius: 100, background: T.hair, overflow: "hidden", flex: "0 0 56px" }}>
                  <span style={{ display: "block", height: "100%", width: `${l.h}%`, background: l.warn ? "#C79A3C" : T.accent }} />
                </span>
                {l.hn}
              </div>
              <button type="button" style={{ background: "transparent", color: T.ink, border: `1px solid ${T.hair}`, borderRadius: 6, padding: "6px 11px", fontSize: 12.5, fontWeight: 550, cursor: "pointer", whiteSpace: "nowrap", font: "inherit" }}>
                Edit
              </button>
              <button type="button" style={{ background: "none", border: "none", color: T.accent, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 12.5, fontWeight: 500, font: "inherit" }}>
                Promote this →
              </button>
            </div>
          </div>
        ))}
      </div>
    </ConsoleShell>
  );
}
