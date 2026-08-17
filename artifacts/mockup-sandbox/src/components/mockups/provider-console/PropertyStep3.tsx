// Property builder (gap #1) — Step 3 "Review"
// Faithful to docs/design/provider-console-mockup/mockup.html propBody2()
// with the default seeded state: pin NOT placed, Tatami room has one published range.

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

export function PropertyStep3() {
  return (
    <ConsoleShell
      active="workstation"
      crumbs={[{ label: "Workstation" }, { label: "New property" }, { label: "3. Review", current: true }]}
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
                  border: `1px solid ${i === 2 ? INK : HAIR}`, background: i === 2 ? INK : PAPER,
                  color: i === 2 ? "#fff" : MUT, borderRadius: 100, padding: "5px 13px",
                  fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {s}
              </button>
            ))}
          </span>
        </div>

        <div style={{ padding: "20px 22px" }}>
          {/* honesty note */}
          <div style={{ ...noteQuiet(), marginBottom: 18 }}>
            Review is honest about the one thing that actually stops a room being sold: nothing has published dates
            until you say so, and this builder does not pretend otherwise.
          </div>

          {/* summary rows */}
          <SumRow k="Property" v={<span>Machiya Kikuya — Gion</span>} />
          <SumRow k="Rooms" v={<span>2 — each one bookable on its own</span>} />
          <SumRow k="Photos" v={<span>3 property photos</span>} />
          <SumRow
            k="Location"
            v={
              <span>
                <span style={{ color: WARN_INK }}>No pin placed.</span> A property with no pin is not on any map — and
                neither are its rooms, which inherit it.
                <span style={{ display: "block", fontSize: 11.5, color: MUT, lineHeight: 1.55, marginTop: 4 }}>
                  No directions line — optional, and never a coordinate source. The pin is what locates you.
                </span>
              </span>
            }
          />
          <SumRow k="Amenities" v={<span>Wi-Fi · Kitchen · Air conditioning · Japanese bath (ofuro)</span>} last />

          {/* Can a traveler book this? */}
          <h5 style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase" as const, color: MUT, fontWeight: 600, margin: "20px 0 10px" }}>
            Can a traveler book this?
          </h5>
          <div style={{ border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden" }}>
            <StopRow
              ok={false}
              name={
                <>
                  <b>The property itself</b>
                  <span> · 2 rooms inherit this</span>
                </>
              }
              flag="Not yet locatable — drop the pin"
            />
            <StopRow
              ok
              name={
                <>
                  <b>The Tatami Room</b>
                  <span> · sleeps 2 · $180 per night</span>
                </>
              }
              okText="Bookable · Tue 1 Sep → Sat 31 Oct published"
            />
            <StopRow
              ok={false}
              name={
                <>
                  <b>The Garden Room</b>
                  <span> · sleeps 3 · $240 per night</span>
                </>
              }
              flag="Not yet bookable — no date ranges published"
              last
            />
          </div>

          {/* inheritance footnote */}
          <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.55, marginTop: 10 }}>
            <b style={{ color: INK }}>All rooms take their location from the property pin</b> — one placement locates
            the whole house, so a room is never asked where it is and two rooms can never disagree about it.
          </div>

          {/* Not yet bookable notice + deep link */}
          <div style={{ ...notice(), marginTop: 16 }}>
            <b style={{ fontWeight: 650 }}>Not yet bookable.</b> A room with no published date range is a listing
            nobody can buy. Nightly dates live on <b style={{ fontWeight: 650 }}>Catalog → Availability</b>, beside the
            listing — this builder deep-links there rather than growing a second calendar of its own.
            <div style={{ marginTop: 11 }}>
              <button style={btnAccentSm()}>Open Availability with the room selected →</button>
            </div>
          </div>

          {/* submit */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
            <button style={btnAccent()}>Submit for review</button>
            <span style={{ fontSize: 12.5, color: MUT }}>A property and its rooms are reviewed like any other listing.</span>
          </div>
        </div>

        {/* flowfoot */}
        <div style={{ padding: "0 22px 20px" }}>
          <div style={{ paddingTop: 16, borderTop: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button style={btnGhost()}>← Back</button>
            <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }} />
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}

/* ── local pieces ─────────────────────────────────────────────────────── */

function SumRow({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "9px 0", borderBottom: last ? "none" : `1px solid ${HAIR}`, fontSize: 13, flexWrap: "wrap" }}>
      <div style={{ width: 180, flex: "0 0 180px", color: MUT }}>{k}</div>
      <div style={{ flex: 1, minWidth: 200 }}>{v}</div>
    </div>
  );
}

function StopRow({ ok, name, flag, okText, last }: { ok: boolean; name: React.ReactNode; flag?: string; okText?: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderBottom: last ? "none" : `1px solid ${HAIR}`, fontSize: 13, flexWrap: "wrap" }}>
      <span
        style={{
          width: 20, height: 20, flex: "0 0 20px", borderRadius: 100,
          background: ok ? GRD : WARN_BG, color: ok ? MUT : WARN_INK,
          border: `1px solid ${ok ? HAIR : WARN_LINE}`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
        }}
      >
        {ok ? "✓" : "–"}
      </span>
      <span style={{ flex: 1, minWidth: 150 }}>{name}</span>
      {ok ? (
        <span style={{ fontSize: 11.5, color: ACC }}>{okText}</span>
      ) : (
        <span style={{ fontSize: 11.5, color: "#8A6A22", background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 100, padding: "1px 8px" }}>
          {flag}
        </span>
      )}
    </div>
  );
}

/* ── style helpers ────────────────────────────────────────────────────── */
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
function btnGhost(): React.CSSProperties {
  return { border: `1px solid ${HAIR}`, background: "transparent", color: INK, padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, fontFamily: "inherit" };
}
function btnAccent(): React.CSSProperties {
  return { border: `1px solid ${ACC}`, background: ACC, color: "#fff", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, fontFamily: "inherit" };
}
function btnAccentSm(): React.CSSProperties {
  return { border: `1px solid ${ACC}`, background: ACC, color: "#fff", padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, whiteSpace: "nowrap" as const, fontFamily: "inherit" };
}
