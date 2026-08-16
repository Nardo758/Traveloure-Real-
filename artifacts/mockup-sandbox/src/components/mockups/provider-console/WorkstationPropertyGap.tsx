// Workstation — Property gap state
// Reference: Claude artifact showing "Machiya Kikuya — the Tatami Room · No dates published"
// Captures the property-in-Workstation view where rooms exist but have no availability published.
// Four distinct sub-states per room:
//   A. No availability published (amber — soft gate, still shows in catalog as draft)
//   B. Blackout gap — a date range with no dates open in a booked period
//   C. Stale — last published window has expired, calendar needs extending
//   D. Ready — room has live dates (reference/happy path)

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";
const STALE_BG = "#F0F4FF";
const STALE_LINE = "#C5D0F5";
const STALE_INK = "#3352CC";
const OK_INK = "#166534";
const OK_BG = "#F0FDF4";
const OK_LINE = "#BBF7D0";

// ── mini health bar (same design token as Catalog) ──────────────────────────
function HealthBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 4, width: 80, background: HAIR, borderRadius: 100, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 100 }} />
    </div>
  );
}

// ── room row ────────────────────────────────────────────────────────────────
function RoomRow({ name, price, state }: {
  name: string;
  price: string;
  state: "no-dates" | "blackout" | "stale" | "ready";
}) {
  const cfg = {
    "no-dates": { pct: 40, bar: "#F59E0B", label: "No dates published", bg: WARN_BG,   border: WARN_LINE,  ink: WARN_INK,  icon: "⚠",  ctaLabel: "Publish availability →", cta: true  },
    blackout:   { pct: 55, bar: "#F59E0B", label: "Blackout gap · Jun 14–21", bg: WARN_BG, border: WARN_LINE, ink: WARN_INK, icon: "⚠", ctaLabel: "Fill the gap →", cta: true },
    stale:      { pct: 60, bar: "#6B7AE8", label: "Window expired — extend calendar", bg: STALE_BG, border: STALE_LINE, ink: STALE_INK, icon: "↻", ctaLabel: "Extend calendar →", cta: true },
    ready:      { pct: 100, bar: ACC, label: "Availability published", bg: OK_BG, border: OK_LINE, ink: OK_INK, icon: "✓", ctaLabel: "", cta: false },
  }[state];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${HAIR}`, borderRadius: 7, overflow: "hidden", background: PAPER }}>
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{name}</span>
          <span style={{ fontSize: 12, color: MUT }}>{price}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <HealthBar pct={cfg.pct} color={cfg.bar} />
          <span style={{ fontSize: 11.5, color: cfg.ink, minWidth: 160, textAlign: "right" as const }}>{cfg.label}</span>
          <button style={{ fontSize: 12, padding: "5px 10px", borderRadius: 5, border: `1px solid ${HAIR}`, background: GRD, color: INK, cursor: "pointer" }}>Edit</button>
        </div>
      </div>
      {/* Inline gap alert */}
      {cfg.cta && (
        <div style={{ background: cfg.bg, borderTop: `1px solid ${cfg.border}`, padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: cfg.ink }}>{cfg.icon}</span>
            <span style={{ fontSize: 12.5, color: cfg.ink, lineHeight: 1.5 }}>{getAlertBody(state)}</span>
          </div>
          <button style={{ fontSize: 12, fontWeight: 600, color: cfg.ink, background: "none", border: `1px solid ${cfg.border}`, borderRadius: 5, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap" as const }}>
            {cfg.ctaLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function getAlertBody(state: "no-dates" | "blackout" | "stale" | "ready") {
  if (state === "no-dates")
    return "Travelers can see this room in Catalog but can't book it until you publish at least one date window in Availability.";
  if (state === "blackout")
    return "You have bookings either side of Jun 14–21 but no open dates in that window. Travelers landing on this room see it as full.";
  if (state === "stale")
    return "Your last published window ended Jul 31. The room appears unavailable to travelers browsing August onwards.";
  return "";
}

// ── main component ───────────────────────────────────────────────────────────
export function WorkstationPropertyGap() {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif", color: INK }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 28px" }}>

        {/* Page header — same as Workstation */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>🔧</span>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>Workstation</h1>
          </div>
          <p style={{ fontSize: 13, color: MUT, margin: 0, lineHeight: 1.55, maxWidth: "70ch" }}>
            One door for building what you sell — a single service to start, then bundles and properties as your offering grows.
          </p>
        </div>

        {/* Section label */}
        <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.07em", margin: "0 0 12px" }}>
          Your properties
        </p>

        {/* Property card */}
        <div style={{ border: `1px solid ${HAIR}`, borderRadius: 8, background: PAPER, overflow: "hidden", marginBottom: 28 }}>
          {/* Property header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${HAIR}` }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 15 }}>🏘️</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>Machiya Kikuya</span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: GRD, border: `1px solid ${HAIR}`, color: MUT }}>In review</span>
              </div>
              <span style={{ fontSize: 12.5, color: MUT }}>Gion · Kyoto · Property · 3 rooms</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ fontSize: 12.5, padding: "7px 13px", borderRadius: 6, border: `1px solid ${HAIR}`, background: GRD, color: INK, cursor: "pointer" }}>Edit property</button>
              <button style={{ fontSize: 12.5, padding: "7px 13px", borderRadius: 6, border: `1px solid ${ACC}`, background: "transparent", color: ACC, cursor: "pointer" }}>+ Add room</button>
            </div>
          </div>

          {/* Room list */}
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <RoomRow name="The Tatami Room" price="¥24 000 · ¥180 per night" state="no-dates" />
            <RoomRow name="Engawa Suite" price="¥38 000 · ¥285 per night" state="blackout" />
            <RoomRow name="Kura Studio" price="¥18 000 · ¥135 per night" state="stale" />
          </div>
        </div>

        {/* ── What "Publish availability" means ── */}
        <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 14 }}>📅</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Publishing availability for a room</span>
          </div>
          <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 14px", lineHeight: 1.6 }}>
            Availability is set per-room in the <strong style={{ color: INK }}>Availability</strong> section of your workstation — not here. Publishing a date window means travelers can see those dates as open and book them. Until at least one window is live, the room appears unavailable even if it's approved.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {[
              { icon: "🗓️", title: "Step 1", body: "Go to Availability → select this room" },
              { icon: "➕", title: "Step 2", body: "Add a date range (e.g. Jun 1 – Aug 31)" },
              { icon: "✓",  title: "Step 3", body: "Set nightly price overrides if needed, then publish" },
            ].map(s => (
              <div key={s.title} style={{ background: GRD, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "12px 14px" }}>
                <div style={{ fontSize: 16, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.5 }}>{s.body}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <button style={{ fontSize: 13, fontWeight: 600, padding: "9px 18px", borderRadius: 6, border: `1px solid ${ACC}`, background: ACC, color: "#fff", cursor: "pointer" }}>
              Go to Availability →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
