// Calendar (read-only) — replicated from docs/design/provider-console-mockup/mockup.html (~1301-1340 + JS ~4023-4086)
import React from "react";

const INK = "#1A1A18";
const MUTED = "#7A7A72";
const HAIR = "#E8E8E2";
const GROUND = "#FAFAF8";
const ACCENT = "#35605A";
const SOFT = "#EDF2F1";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";

function Shell({ crumbs, activeNav, children }: { crumbs: { label: string; link?: boolean }[]; activeNav: string; children: React.ReactNode }) {
  const navGroups: [string, { key: string; gl: string; label: string; proposed?: boolean }[]][] = [
    ["Work", [
      { key: "dashboard", gl: "◇", label: "Dashboard" },
      { key: "calendar", gl: "▤", label: "Calendar" },
      { key: "inbox", gl: "✉", label: "Inbox" },
      { key: "workstation", gl: "⚒", label: "Workstation" },
    ]],
    ["Business", [
      { key: "catalog", gl: "▦", label: "Catalog" },
      { key: "distribute", gl: "↗", label: "Distribute", proposed: true },
      { key: "customers", gl: "☺", label: "Customers" },
      { key: "performance", gl: "↑", label: "Performance" },
      { key: "money", gl: "$", label: "Money" },
    ]],
    ["Account", [
      { key: "settings", gl: "⚙", label: "Settings" },
      { key: "playbook", gl: "▣", label: "Playbook" },
    ]],
  ];
  return (
    <div className="min-h-screen w-full" style={{ background: GROUND, color: INK, fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", fontSize: 14, lineHeight: 1.5, display: "grid", gridTemplateColumns: "216px minmax(0,1fr)" }}>
      <aside style={{ background: "#fff", borderRight: `1px solid ${HAIR}`, padding: "16px 12px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 8px 18px", fontWeight: 650, letterSpacing: "-.01em", fontSize: 15 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke={ACCENT} strokeWidth="1.7" />
            <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" stroke={ACCENT} strokeWidth="1.5" />
          </svg>
          Traveloure
        </div>
        <nav>
          {navGroups.map(([g, items]) => (
            <div key={g}>
              <div style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: MUTED, padding: "14px 8px 5px", fontWeight: 600 }}>{g}</div>
              {items.map((it) => {
                const on = it.key === activeNav;
                return (
                  <button key={it.key} type="button" style={{
                    display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 5, fontSize: 13,
                    color: on ? ACCENT : INK, background: on ? SOFT : "none",
                    border: it.proposed ? "1px dashed #BFD5D0" : "1px solid transparent",
                    boxShadow: on ? "inset 0 0 0 1px #CBDAD7" : undefined,
                    fontWeight: on ? 600 : 400, width: "100%", textAlign: "left", cursor: "pointer", font: "inherit",
                  }}>
                    <span style={{ width: 15, textAlign: "center", color: on ? ACCENT : MUTED, fontSize: 12, flex: "0 0 15px" }}>{it.gl}</span>
                    {it.label}
                    {it.proposed && (
                      <span title="proposed new nav entry" style={{ marginLeft: "auto", width: 15, height: 15, borderRadius: 100, background: SOFT, border: "1px solid #CBDAD7", color: ACCENT, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>⑧</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: "14px 8px 4px", borderTop: `1px solid ${HAIR}`, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
          Provider console — proposed structure.<br />
          <b style={{ color: INK }}>Distribute</b> is the one new entry.
        </div>
      </aside>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#fff", borderBottom: `1px solid ${HAIR}`, padding: "11px 26px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ width: 29, height: 29, flex: "0 0 29px", borderRadius: 100, background: SOFT, border: "1px solid #CBDAD7", color: ACCENT, fontSize: 11, fontWeight: 650, display: "flex", alignItems: "center", justifyContent: "center" }}>AT</span>
          <span>
            <b style={{ display: "block", fontSize: 13.5, fontWeight: 650, lineHeight: 1.25 }}>Aiko Tanaka</b>
            <span style={{ display: "block", fontSize: 12, color: MUTED, lineHeight: 1.3 }}>Machiya Kikuya · Gion, Kyoto · Provider</span>
          </span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: MUTED, border: `1px solid ${HAIR}`, borderRadius: 100, padding: "3px 11px", background: GROUND }}>Mock — not connected to live data</span>
          <button type="button" style={{ background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, font: "inherit", whiteSpace: "nowrap" }}>Mock notes</button>
        </div>
        <div style={{ background: "#fff", borderBottom: `1px solid ${HAIR}`, padding: "9px 26px", fontSize: 12.5 }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", color: MUTED }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: "#C4C4BC" }}>›</span>}
                {i === crumbs.length - 1 ? (
                  <span style={{ color: INK, fontWeight: 600 }}>{c.label}</span>
                ) : (
                  <span>{c.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div style={{ padding: "22px 26px 76px", maxWidth: 1180, width: "100%" }}>{children}</div>
      </div>
    </div>
  );
}

interface DayCell {
  d?: number;
  pad?: boolean;
  today?: boolean;
  chip?: { text: string; blk?: boolean };
}

function buildAugust2026(): DayCell[] {
  const cells: DayCell[] = [];
  for (let i = 0; i < 6; i++) cells.push({ pad: true }); // Aug 1 2026 is a Saturday
  const chips: Record<number, { text: string; blk?: boolean }> = {
    13: { text: "Food walk · Closed for Obon", blk: true },
    14: { text: "Food walk · Closed for Obon", blk: true },
    15: { text: "Food walk · Closed for Obon", blk: true },
    16: { text: "Food walk · Closed for Obon", blk: true },
    18: { text: "18:00 · Food walk" },
    20: { text: "18:00 · Food walk · 4 of 8 seats booked" },
    22: { text: "11:00 · Food walk" },
    25: { text: "18:00 · Food walk" },
    27: { text: "18:00 · Food walk · 8 of 8 — full" },
  };
  for (let d = 1; d <= 31; d++) {
    cells.push({ d, today: d === 12, chip: chips[d] });
  }
  for (let i = 0; i < 5; i++) cells.push({ pad: true });
  return cells;
}

export function CalendarReadOnly() {
  const cells = buildAugust2026();
  const legendSwatch = (bg: string, border: string): React.CSSProperties => ({
    display: "inline-block", width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: -1, border: `1px solid ${border}`, background: bg,
  });
  return (
    <Shell activeNav="calendar" crumbs={[{ label: "Calendar" }]}>
      <h2 style={{ fontSize: 20, fontWeight: 650, letterSpacing: "-.01em", marginBottom: 4, marginTop: 0 }}>Calendar</h2>
      <p style={{ color: MUTED, fontSize: 13, marginBottom: 18, maxWidth: "74ch", marginTop: 0 }}>
        Everything published or booked across your listings, in one month. This surface <b style={{ color: INK }}>reads</b> — every chip opens the listing's own availability editor on Catalog.
      </p>

      <div style={{ background: GROUND, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUTED, lineHeight: 1.5, marginBottom: 18 }}>
        <b style={{ color: INK }}>G1 recommendation:</b> Calendar stays read-only and the editor lives on <b style={{ color: INK }}>Catalog</b>, beside the listing it belongs to (the §22b precedent that put slot editing there). <b style={{ color: INK }}>The amendment on offer:</b> make Calendar the editor's home instead, and have Catalog deep-link out to it. One of the two — not both, or a provider gets two calendars to keep in their head.
      </div>

      <div style={{ background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 7, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${HAIR}`, flexWrap: "wrap" }}>
          <b style={{ fontSize: 14, fontWeight: 650, flex: 1, minWidth: 130 }}>August 2026</b>
          <span style={{ fontSize: 12, color: MUTED }}>Read-only</span>
          <div style={{ display: "inline-flex", border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden", background: "#fff" }}>
            <button type="button" aria-label="Previous month" style={{ background: "#fff", border: "none", borderRight: `1px solid ${HAIR}`, padding: "7px 13px", fontSize: 12.5, cursor: "pointer", color: MUTED, font: "inherit" }}>‹</button>
            <button type="button" aria-label="Next month" style={{ background: "#fff", border: "none", padding: "7px 13px", fontSize: 12.5, cursor: "pointer", color: MUTED, font: "inherit" }}>›</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", borderBottom: `1px solid ${HAIR}` }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <span key={d} style={{ padding: "6px 8px", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>{d}</span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
          {cells.map((c, i) => (
            <div key={i} style={{
              minHeight: 78,
              borderRight: (i + 1) % 7 === 0 ? "none" : `1px solid ${HAIR}`,
              borderBottom: `1px solid ${HAIR}`,
              padding: "5px 6px",
              background: c.pad ? GROUND : undefined,
              boxShadow: c.today ? `inset 0 0 0 2px ${INK}` : undefined,
            }}>
              {!c.pad && <span style={{ fontSize: 11, color: MUTED }}>{c.d}</span>}
              {c.chip && (
                <button type="button" style={{
                  display: "block", width: "100%", textAlign: "left", marginTop: 3, borderRadius: 4, padding: "3px 5px",
                  fontSize: 10.5, lineHeight: 1.3, cursor: "pointer", font: "inherit",
                  border: c.chip.blk ? `1px solid ${WARN_LINE}` : "1px solid #CBDAD7",
                  background: c.chip.blk ? WARN_BG : SOFT,
                  color: c.chip.blk ? WARN_INK : ACCENT,
                  fontWeight: c.chip.blk ? 500 : 600,
                }}>
                  {c.chip.text}
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, padding: "9px 14px", fontSize: 11, color: MUTED, flexWrap: "wrap" }}>
          <span><i style={legendSwatch(SOFT, "#CBDAD7")} />Scheduled listing</span>
          <span><i style={legendSwatch("#fff", HAIR)} />Property room · nightly</span>
          <span><i style={legendSwatch(WARN_BG, WARN_LINE)} />Blackout</span>
          <span><i style={legendSwatch("#fff", INK)} />Today</span>
        </div>
      </div>

      <div style={{ background: GROUND, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUTED, lineHeight: 1.5, marginTop: 16 }}>
        Nothing on this page edits anything. A chip is a <b style={{ color: INK }}>deep link</b> — it opens Catalog → Availability with that listing already selected and the month already on screen.
      </div>
    </Shell>
  );
}

export default CalendarReadOnly;
