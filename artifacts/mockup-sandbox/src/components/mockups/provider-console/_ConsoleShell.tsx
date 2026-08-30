// Shared provider-console shell — sidebar, topbar, breadcrumb bar.
// Mirrors docs/design/provider-console-mockup/mockup.html exactly.

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";

const NAV: { group: string; items: { key: string; gl: string; label: string; proposed?: boolean }[] }[] = [
  {
    group: "Work",
    items: [
      { key: "dashboard", gl: "◇", label: "Dashboard" },
      { key: "calendar", gl: "▤", label: "Calendar" },
      { key: "inbox", gl: "✉", label: "Inbox" },
      { key: "workstation", gl: "⚒", label: "Workstation" },
    ],
  },
  {
    group: "Business",
    items: [
      { key: "catalog", gl: "▦", label: "Catalog" },
      { key: "distribute", gl: "↗", label: "Distribute", proposed: true },
      { key: "customers", gl: "☺", label: "Customers" },
      { key: "performance", gl: "↑", label: "Performance" },
      { key: "money", gl: "$", label: "Money" },
    ],
  },
  {
    group: "Account",
    items: [
      { key: "settings", gl: "⚙", label: "Settings" },
      { key: "playbook", gl: "▣", label: "Playbook" },
    ],
  },
];

export function ConsoleShell({
  active,
  crumbs,
  children,
}: {
  active: string;
  crumbs: { label: string; current?: boolean }[];
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        display: "grid",
        gridTemplateColumns: "216px minmax(0,1fr)",
        background: GRD,
        color: INK,
        fontFamily:
          'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {/* ── Sidebar ── */}
      <aside style={{ background: PAPER, borderRight: `1px solid ${HAIR}`, padding: "16px 12px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 8px 18px", fontWeight: 650, letterSpacing: "-.01em", fontSize: 15 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke={ACC} strokeWidth="1.7" />
            <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" stroke={ACC} strokeWidth="1.5" />
          </svg>
          Traveloure
        </div>
        <nav>
          {NAV.map((g) => (
            <div key={g.group}>
              <div style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: MUT, padding: "14px 8px 5px", fontWeight: 600 }}>
                {g.group}
              </div>
              {g.items.map((it) => {
                const on = it.key === active;
                return (
                  <button
                    key={it.key}
                    style={{
                      display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 5,
                      fontSize: 13, color: on ? ACC : INK, background: on ? "#EDF2F1" : "none",
                      border: it.proposed ? "1px dashed #BFD5D0" : "1px solid transparent",
                      boxShadow: on ? "inset 0 0 0 1px #CBDAD7" : undefined,
                      fontWeight: on ? 600 : 400, width: "100%", textAlign: "left", cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ width: 15, textAlign: "center", color: on ? ACC : MUT, fontSize: 12, flex: "0 0 15px" }}>{it.gl}</span>
                    {it.label}
                    {it.proposed && (
                      <span
                        title="proposed new nav entry"
                        style={{
                          marginLeft: "auto", width: 15, height: 15, borderRadius: 100, background: "#EDF2F1",
                          border: "1px solid #CBDAD7", color: ACC, fontSize: 9, display: "flex",
                          alignItems: "center", justifyContent: "center",
                        }}
                      >
                        ⑧
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: "14px 8px 4px", borderTop: `1px solid ${HAIR}`, fontSize: 11, color: MUT, lineHeight: 1.5 }}>
          Provider console — proposed structure.
          <br />
          <b style={{ color: INK }}>Distribute</b> is the one new entry.
        </div>
      </aside>

      {/* ── Main column ── */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ background: PAPER, borderBottom: `1px solid ${HAIR}`, padding: "11px 26px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span
            aria-hidden="true"
            style={{
              width: 29, height: 29, flex: "0 0 29px", borderRadius: 100, background: "#EDF2F1",
              border: "1px solid #CBDAD7", color: ACC, fontSize: 11, fontWeight: 650,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            AT
          </span>
          <span>
            <b style={{ display: "block", fontSize: 13.5, fontWeight: 650, lineHeight: 1.25 }}>Aiko Tanaka</b>
            <span style={{ display: "block", fontSize: 12, color: MUT, lineHeight: 1.3 }}>Machiya Kikuya · Gion, Kyoto · Provider</span>
          </span>
          <span
            style={{
              marginLeft: "auto", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase",
              color: MUT, border: `1px solid ${HAIR}`, borderRadius: 100, padding: "3px 11px", background: GRD,
            }}
          >
            Mock — not connected to live data
          </span>
          <button
            style={{
              border: `1px solid ${HAIR}`, background: "transparent", color: INK, padding: "6px 11px",
              borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            Mock notes
          </button>
        </div>

        <div style={{ background: PAPER, borderBottom: `1px solid ${HAIR}`, padding: "9px 26px", fontSize: 12.5 }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", color: MUT }}>
            {crumbs.map((c, i) => (
              <span key={c.label} style={{ display: "flex", gap: 7, alignItems: "center" }}>
                {i > 0 && <span style={{ color: "#C4C4BC" }}>›</span>}
                {c.current ? (
                  <span style={{ color: INK, fontWeight: 600 }}>{c.label}</span>
                ) : (
                  <button
                    style={{
                      background: "none", border: "none", padding: 0, color: ACC, cursor: "pointer",
                      fontSize: 12.5, textDecoration: "underline", textUnderlineOffset: 2, fontFamily: "inherit",
                    }}
                  >
                    {c.label}
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        <div style={{ padding: "22px 26px 76px", maxWidth: 1180, width: "100%" }}>{children}</div>
      </div>
    </div>
  );
}
