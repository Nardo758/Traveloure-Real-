// Property builder (gap #1) — Step 2 "Rooms"
// Faithful to docs/design/provider-console-mockup/mockup.html propBody1().

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

const ROOMS = [
  { n: "The Tatami Room", sleeps: "2", price: "180" },
  { n: "The Garden Room", sleeps: "3", price: "240" },
];

export function PropertyStep2() {
  return (
    <ConsoleShell
      active="workstation"
      crumbs={[{ label: "Workstation" }, { label: "New property" }, { label: "2. Rooms", current: true }]}
    >
      <button style={backlink()}>← Back to “What are you building?”</button>
      <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
        {/* card header */}
        <div style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>New property</h3>
          <span style={propchip()}>Proposed — gap #1 · ratify or amend</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
            {["1. The property", "2. Rooms", "3. Review"].map((s, i) => (
              <button
                key={s}
                style={{
                  border: `1px solid ${i === 1 ? INK : HAIR}`, background: i === 1 ? INK : PAPER,
                  color: i === 1 ? "#fff" : MUT, borderRadius: 100, padding: "5px 13px",
                  fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {s}
              </button>
            ))}
          </span>
        </div>

        <div style={{ padding: "20px 22px" }}>
          {/* notice */}
          <div style={{ ...notice(), marginBottom: 18 }}>
            <b style={{ fontWeight: 650 }}>Each room becomes its own bookable listing under this property.</b> That is
            the proposed model: the property is the parent record, and every room is a child row a traveler can book by
            the night — so a booking, a review and a payout all attach to a room, not to the building.
          </div>

          {/* pin-inheritance capline (pin not placed) */}
          <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.55, margin: "0 0 14px" }}>
            <b style={{ color: INK }}>All rooms take their location from the property pin</b> — one placement locates
            the whole house. <span style={{ color: WARN_INK }}>The pin is not placed yet, so no room is locatable.</span>{" "}
            <button style={{ ...linkBtn(), fontSize: 11.5 }}>Drop the pin on step 1 →</button>
          </div>

          {/* room cards — exactly two */}
          <div>
            {ROOMS.map((r) => (
              <div
                key={r.n}
                style={{
                  display: "flex", gap: 14, alignItems: "center", border: `1px solid ${HAIR}`,
                  borderRadius: 6, padding: "12px 14px", marginBottom: 10, flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    width: 56, height: 42, flex: "0 0 56px", borderRadius: 5, background: "#EDEBE3",
                    border: `1px solid ${HAIR}`, display: "flex", alignItems: "center",
                    justifyContent: "center", color: "#B8B6AC",
                  }}
                >
                  ▤
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <input aria-label="Room name" style={{ ...inp(), fontWeight: 600, marginBottom: 6 }} defaultValue={r.n} />
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: MUT }}>
                    <span>Sleeps</span>
                    <input aria-label="Sleeps" style={{ ...inp(), maxWidth: 60 }} defaultValue={r.sleeps} />
                    <span>$</span>
                    <input aria-label="Nightly price" style={{ ...inp(), maxWidth: 80 }} defaultValue={r.price} />
                    <span>per night</span>
                  </div>
                </div>
                <button style={btnGhostSm()}>Photo</button>
                <button style={{ ...linkBtn(), fontSize: 12, color: MUT }}>Remove</button>
              </div>
            ))}
          </div>
          <button style={btnGhostSm()}>+ Add a room</button>

          {/* per-night note */}
          <div style={{ ...noteQuiet(), marginTop: 16 }}>
            Prices are <b style={{ color: INK }}>per night</b> — the unit the single-service form cannot express, which
            is why this is its own builder. Seasonal pricing is not set here: it belongs to a published date range on{" "}
            <b style={{ color: INK }}>Availability</b>.
          </div>
        </div>

        {/* flowfoot */}
        <div style={{ padding: "0 22px 20px" }}>
          <div style={{ paddingTop: 16, borderTop: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button style={btnGhost()}>← Back</button>
            <button style={btn()}>Next: Review →</button>
            <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>2 rooms — each one bookable on its own</span>
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}

/* ── style helpers ────────────────────────────────────────────────────── */
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 11px", border: `1px solid ${HAIR}`, borderRadius: 6,
    background: PAPER, color: INK, font: "inherit", fontSize: 13.5, boxSizing: "border-box" as const,
  };
}
function notice(): React.CSSProperties {
  return { background: WARN_BG, border: `1px solid ${WARN_LINE}`, color: WARN_INK, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, lineHeight: 1.5 };
}
function noteQuiet(): React.CSSProperties {
  return { background: GRD, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUT, lineHeight: 1.5 };
}
function propchip(): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 550,
    color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`,
    borderRadius: 100, padding: "2px 10px", whiteSpace: "nowrap" as const,
  };
}
function backlink(): React.CSSProperties {
  return {
    background: "none", border: "none", color: ACC, cursor: "pointer", fontSize: 13,
    textDecoration: "underline", textUnderlineOffset: 2, marginBottom: 14, display: "inline-block",
    padding: 0, fontFamily: "inherit",
  };
}
function linkBtn(): React.CSSProperties {
  return { background: "none", border: "none", color: ACC, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit" };
}
function btn(): React.CSSProperties {
  return { border: `1px solid ${INK}`, background: INK, color: "#fff", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, fontFamily: "inherit" };
}
function btnGhost(): React.CSSProperties {
  return { border: `1px solid ${HAIR}`, background: "transparent", color: INK, padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, fontFamily: "inherit" };
}
function btnGhostSm(): React.CSSProperties {
  return { border: `1px solid ${HAIR}`, background: "transparent", color: INK, padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, whiteSpace: "nowrap" as const, flex: "0 0 auto", fontFamily: "inherit" };
}
