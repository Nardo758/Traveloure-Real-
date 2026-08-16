// Honest stub pages — replicated from docs/design/provider-console-mockup/mockup.html (~1428-1435 + STUB_EXTRA JS ~4088-4101)
import React from "react";

const INK = "#1A1A18";
const MUTED = "#7A7A72";
const HAIR = "#E8E8E2";
const GROUND = "#FAFAF8";
const ACCENT = "#35605A";
const SOFT = "#EDF2F1";

function Shell({ crumbs, activeNav, children }: { crumbs: { label: string }[]; activeNav: string; children: React.ReactNode }) {
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
                <span style={{ color: i === crumbs.length - 1 ? INK : MUTED, fontWeight: i === crumbs.length - 1 ? 600 : 400 }}>{c.label}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
        <div style={{ padding: "22px 26px 76px", maxWidth: 1180, width: "100%" }}>{children}</div>
      </div>
    </div>
  );
}

function StubBox({ title, extra }: { title: string; extra?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 7, padding: "44px 26px", textAlign: "center" }}>
      <h3 style={{ fontSize: 17, fontWeight: 650, marginBottom: 7, marginTop: 0 }}>{title}</h3>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: "56ch", margin: "0 auto" }}>Not part of this mock — unchanged by the redesign.</p>
      {extra && <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: "56ch", margin: "12px auto 0" }}>{extra}</p>}
    </div>
  );
}

export function StubPages() {
  return (
    <Shell activeNav="dashboard" crumbs={[{ label: "Dashboard" }]}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <StubBox
          title="Dashboard"
          extra="One change proposed here: its “Add New Service” quick action routes to Workstation, like every other create link."
        />
        <StubBox
          title="Playbook"
          extra="One change proposed here: its “list your first service” link routes to Workstation, like every other create link."
        />
        <StubBox
          title="Performance"
          extra="The market-insight map overlays are proposed to move here — flagged separately, and not part of this approval."
        />
      </div>
    </Shell>
  );
}

export default StubPages;
