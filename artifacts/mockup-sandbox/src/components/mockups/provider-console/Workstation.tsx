// Workstation — the one door ("What are you building?")
// Faithful to docs/design/provider-console-mockup/mockup.html view-workstation
// (default state: Bundle tile LOCKED, 1 of 2 approved).

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

const CATS: [string, string][] = [
  ["Tours & Experiences", "Walks, museum tours, cultural sessions"],
  ["Food & Culinary", "Private chefs, cooking lessons, food tours"],
  ["Photography & Videography", "Portrait, event, travel video"],
  ["Transportation & Logistics", "Transfers, day trips, specialty transport"],
  ["Arts & Crafts Instruction", "Pottery, calligraphy, ikebana, dance"],
  ["Personal Assistance", "Trip planning, errands, concierge"],
  ["Events & Celebrations", "Proposals, birthdays, small weddings"],
  ["Beauty & Styling", "Hair, make-up, kimono dressing"],
  ["Restaurants & Dining", "Private dining, tastings, venue seats"],
  ["Lodging & Accommodation", "Rooms, homestays, glamping"],
  ["Entertainment", "Musicians, performers, hosts"],
  ["Rental Services", "Bikes, gear, cameras, kimono"],
];

export function Workstation() {
  return (
    <ConsoleShell active="workstation" crumbs={[{ label: "Workstation", current: true }]}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 20, fontWeight: 650, letterSpacing: "-.01em", marginBottom: 4, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            What are you building?
            <Dot ghost>⑥</Dot>
          </h2>
          <p style={{ color: MUT, fontSize: 13, marginBottom: 0, maxWidth: "74ch" }}>
            Workstation · the single entry point for anything you sell. Pick a shape to start; you can change most of
            it later.
          </p>
        </div>
        <button style={btnGhost()}>Preview as unlocked</button>
      </div>

      {/* door tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 }}>
        {/* Single service */}
        <button style={doortile()}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3" stroke={ACC} strokeWidth="1.7" />
            <path d="M7 9h10M7 13h6" stroke={ACC} strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <h4 style={tileH4()}>Single service</h4>
          <p style={tileP()}>One thing you offer — a session, a walk, a guide, a transfer. Five fields to a saved draft.</p>
          <span style={cta()}>Start a service →</span>
        </button>

        {/* Bundle — locked */}
        <div style={{ ...doortile(), background: GRD, borderStyle: "dashed", cursor: "not-allowed", opacity: 0.94 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2.5" stroke={MUT} strokeWidth="1.7" />
            <path d="M8.5 10V7.5a3.5 3.5 0 017 0V10" stroke={MUT} strokeWidth="1.7" />
          </svg>
          <h4 style={{ ...tileH4(), color: MUT }}>Bundle</h4>
          <p style={tileP()}>Two or more of your approved services sold together at one price.</p>
          <p style={{ ...tileP(), marginTop: 8, color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 5, padding: "7px 9px" }}>
            Locked. Unlocks when you have 2 approved services — you have 1 approved, 1 in review.
          </p>
          <div style={{ height: 5, borderRadius: 100, background: HAIR, overflow: "hidden", marginTop: 10 }}>
            <i style={{ display: "block", height: "100%", width: "50%", background: MUT }} />
          </div>
          <span style={{ ...cta(), color: MUT }}>1 of 2 approved</span>
        </div>

        {/* Property */}
        <button style={doortile()}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1z" stroke={ACC} strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M10 21v-6h4v6" stroke={ACC} strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
          <h4 style={tileH4()}>
            Property <span style={propchip()}>gap #1</span>
          </h4>
          <p style={tileP()}>A room, apartment or house with per-night pricing and room availability.</p>
          <span style={cta()}>Start a property →</span>
        </button>
      </div>

      <Divider />

      <h5 style={grouplabel()}>Or start from what you do</h5>
      <p style={{ color: MUT, fontSize: 13, marginBottom: 14, maxWidth: "74ch" }}>
        These are the live service categories. Picking one pre-selects the category and jumps straight into the
        Basics screen.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 9 }}>
        {CATS.map(([name, desc]) => (
          <button
            key={name}
            style={{
              border: `1px solid ${HAIR}`, borderRadius: 6, background: PAPER, padding: "12px 13px",
              textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: INK,
            }}
          >
            <b style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{name}</b>
            <span style={{ fontSize: 11.5, color: MUT, lineHeight: 1.35, display: "block" }}>{desc}</span>
          </button>
        ))}
      </div>

      <Divider />

      {/* five links card */}
      <div style={{ ...card(), padding: "20px 22px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>The five links this screen replaces</div>
        <div style={{ fontSize: 12.5, color: MUT, lineHeight: 1.7 }}>
          Today, five different “Add New Service” affordances jump straight into the 4-step form and skip Workstation
          entirely, so the ladder (single → bundle → property) is invisible to a first-time provider. In this proposal
          every one of them routes here first. This screen is the only place a new listing is born.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span style={pill()}>Catalog · empty state</span>
          <span style={pill()}>Catalog · header button</span>
          <span style={pill()}>Dashboard · quick action</span>
          <span style={pill()}>Onboarding · finish setup</span>
          <span style={pill()}>Playbook · “list your first service”</span>
        </div>
      </div>

      <Divider />

      {/* Your bundles / Your properties */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div style={card()}>
          <div style={cardHd()}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Your bundles</h3>
            <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>1 draft</span>
          </div>
          <div style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Two Days in Kyoto — Walk + Tea</div>
                <div style={{ fontSize: 12, color: MUT }}>2 components · In person · $84</div>
              </div>
              <span style={pillDraft()}>Draft</span>
            </div>
            <div style={capline()}>
              Bundles and properties are <b style={{ color: INK }}>built</b> here and <b style={{ color: INK }}>sold</b>{" "}
              from Catalog, like everything else. This list is here for orientation, not as a second Catalog.
            </div>
          </div>
        </div>
        <div style={card()}>
          <div style={cardHd()}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Your properties</h3>
            <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>1 · 2 rooms</span>
          </div>
          <div style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Machiya Kikuya — Gion</div>
                <div style={{ fontSize: 12, color: MUT }}>The Tatami Room · The Garden Room</div>
              </div>
              <span style={pillDraft()}>Draft</span>
              <button style={linkBtn()}>Open builder →</button>
            </div>
            <div style={capline()}>
              A room's nightly dates are published on <b style={{ color: INK }}>Catalog → Availability</b> — the
              builder deep-links there rather than growing a second calendar.
            </div>
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}

/* ── local pieces ─────────────────────────────────────────────────────── */

function Dot({ children, ghost }: { children: React.ReactNode; ghost?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 17, height: 17, flex: "0 0 17px", borderRadius: 100,
        background: ghost ? "#EDF2F1" : ACC, color: ghost ? ACC : "#fff",
        border: ghost ? "1px solid #CBDAD7" : undefined,
        fontSize: 11, lineHeight: 1, fontWeight: 600, verticalAlign: "middle",
      }}
    >
      {children}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 1, background: HAIR, margin: "26px 0" }} />;
}

/* ── style helpers ────────────────────────────────────────────────────── */
function card(): React.CSSProperties {
  return { background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 };
}
function cardHd(): React.CSSProperties {
  return { padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
}
function doortile(): React.CSSProperties {
  return {
    border: `1px solid ${HAIR}`, borderRadius: 7, background: PAPER, padding: 20, textAlign: "left" as const,
    cursor: "pointer", minHeight: 180, display: "flex", flexDirection: "column" as const, width: "100%",
    fontFamily: "inherit", color: INK,
  };
}
function tileH4(): React.CSSProperties {
  return { fontSize: 15, fontWeight: 650, margin: "12px 0 5px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
}
function tileP(): React.CSSProperties {
  return { fontSize: 12.5, color: MUT, lineHeight: 1.5, margin: 0 };
}
function cta(): React.CSSProperties {
  return { marginTop: "auto", paddingTop: 14, fontSize: 12.5, color: ACC, fontWeight: 550 };
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
function propchip(): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 550,
    color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`,
    borderRadius: 100, padding: "2px 10px", whiteSpace: "nowrap" as const,
  };
}
function btnGhost(): React.CSSProperties {
  return { border: `1px solid ${HAIR}`, background: "transparent", color: INK, padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, fontFamily: "inherit" };
}
function linkBtn(): React.CSSProperties {
  return { background: "none", border: "none", color: ACC, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit" };
}
function capline(): React.CSSProperties {
  return { fontSize: 11.5, color: MUT, lineHeight: 1.55, marginTop: 8 };
}
