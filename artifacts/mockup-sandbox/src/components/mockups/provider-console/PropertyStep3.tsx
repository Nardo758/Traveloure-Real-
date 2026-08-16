// Property wizard — Step 3: Review
// Matches the reference artifact: header identity, breadcrumb, honesty note,
// summary rows, "Can a traveler book this?" bookability section, pin-inheritance
// footnote, "Not yet bookable" deep-link card, Submit for review.

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";
const ERR_INK = "#B84235";
const OK_INK = "#166534";

export function PropertyStep3() {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif", color: INK }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: `1px solid ${HAIR}`, background: PAPER }}>
        <div style={{ width: 30, height: 30, borderRadius: 999, background: "#1F3B38", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>AT</div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>Aiko Tanaka</p>
          <p style={{ fontSize: 11, color: MUT, margin: 0 }}>Machiya Kikuya · Gion, Kyoto · Provider</p>
        </div>
      </div>

      {/* ── Breadcrumb ── */}
      <div style={{ padding: "10px 24px", fontSize: 11.5, borderBottom: `1px solid ${HAIR}`, background: PAPER }}>
        <span style={{ color: ACC, textDecoration: "underline", cursor: "pointer" }}>Workstation</span>
        <span style={{ color: MUT }}> · </span>
        <span style={{ color: ACC, textDecoration: "underline", cursor: "pointer" }}>New property</span>
        <span style={{ color: MUT }}> · </span>
        <span style={{ color: INK, fontWeight: 600 }}>3. Review</span>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "18px 24px 32px" }}>

        <button style={{ fontSize: 12, color: ACC, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", marginBottom: 14 }}>
          ← Back to “What are you building?”
        </button>

        {/* ── Card ── */}
        <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, overflow: "hidden" }}>

          {/* Card header: title + badge + step pills */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${HAIR}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>New property</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 999, padding: "3px 10px" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: WARN_INK }} />
                Proposed — gap #1 · ratify or amend
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["1. The property", "2. Rooms", "3. Review"].map((s, i) => (
                <span key={s} style={{
                  fontSize: 11, fontWeight: i === 2 ? 700 : 400, borderRadius: 999, padding: "4px 12px",
                  border: `1px solid ${i === 2 ? "#1A1A18" : HAIR}`,
                  background: i === 2 ? "#1A1A18" : PAPER,
                  color: i === 2 ? "#fff" : MUT,
                }}>{s}</span>
              ))}
            </div>
          </div>

          <div style={{ padding: "16px 20px 20px" }}>

            {/* Honesty note */}
            <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "10px 14px", marginBottom: 16, background: GRD }}>
              <p style={{ fontSize: 11.5, color: MUT, margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>
                Review is honest about the one thing that actually stops a room being sold: nothing has published dates until you say so, and this builder does not pretend otherwise.
              </p>
            </div>

            {/* Summary rows */}
            {[
              { label: "Property",  body: <span>Machiya Kikuya — Gion</span> },
              { label: "Rooms",     body: <span>2 — each one bookable on its own</span> },
              { label: "Photos",    body: <span>3 property photos</span> },
              { label: "Location",  body: (
                <span>
                  <span style={{ color: ERR_INK, fontWeight: 600 }}>No pin placed.</span>{" "}
                  <span style={{ color: ERR_INK }}>A property with no pin is not on any map — and neither are its rooms, which inherit it.</span>
                  <span style={{ display: "block", fontSize: 11.5, color: MUT, marginTop: 3 }}>
                    No directions line — optional, and never a coordinate source. The pin is what locates you.
                  </span>
                </span>
              ) },
              { label: "Amenities", body: <span>Wi-Fi · Kitchen · Air conditioning · Japanese bath (ofuro)</span> },
            ].map(({ label, body }) => (
              <div key={label} style={{ display: "flex", gap: 16, padding: "10px 2px", borderBottom: `1px solid ${HAIR}`, fontSize: 12.5 }}>
                <span style={{ width: 110, flexShrink: 0, color: MUT }}>{label}</span>
                <div style={{ color: INK, lineHeight: 1.5 }}>{body}</div>
              </div>
            ))}

            {/* ── Can a traveler book this? ── */}
            <p style={{ fontSize: 10.5, fontWeight: 700, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.08em", margin: "18px 0 8px" }}>
              Can a traveler book this?
            </p>

            {[
              {
                ok: false,
                title: "The property itself",
                meta: "2 rooms inherit this",
                pill: "Not yet locatable — drop the pin",
              },
              {
                ok: true,
                title: "The Tatami Room",
                meta: "sleeps 2 · $180 per night",
                right: "Bookable · Tue 1 Sep → Sat 31 Oct published",
              },
              {
                ok: false,
                title: "The Garden Room",
                meta: "sleeps 3 · $240 per night",
                pill: "Not yet bookable — no date ranges published",
              },
            ].map(row => (
              <div key={row.title} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${HAIR}`, borderRadius: 7, padding: "10px 14px", marginBottom: 7, background: PAPER }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                  border: `1.5px solid ${row.ok ? OK_INK : WARN_LINE}`,
                  color: row.ok ? OK_INK : WARN_INK,
                  background: row.ok ? "#F0FDF4" : WARN_BG,
                }}>{row.ok ? "✓" : "○"}</span>
                <span style={{ fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700 }}>{row.title}</span>
                  <span style={{ color: MUT }}> · {row.meta}</span>
                </span>
                <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                  {"pill" in row && row.pill ? (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 999, padding: "3px 11px" }}>{row.pill}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: MUT }}>{(row as any).right}</span>
                  )}
                </span>
              </div>
            ))}

            {/* Pin inheritance footnote */}
            <p style={{ fontSize: 11.5, color: MUT, margin: "10px 0 16px", lineHeight: 1.55 }}>
              <span style={{ fontWeight: 700, color: INK }}>All rooms take their location from the property pin</span> — one placement locates the whole house, so a room is never asked where it is and two rooms can never disagree about it.
            </p>

            {/* Not yet bookable card */}
            <div style={{ background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 7, padding: "14px 16px", marginBottom: 18 }}>
              <p style={{ fontSize: 12, color: WARN_INK, margin: "0 0 10px", lineHeight: 1.55 }}>
                <span style={{ fontWeight: 700 }}>Not yet bookable.</span> A room with no published date range is a listing nobody can buy. Nightly dates live on <span style={{ fontWeight: 700 }}>Catalog → Availability</span>, beside the listing — this builder deep-links there rather than growing a second calendar of its own.
              </p>
              <button style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: ACC, border: "none", borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}>
                Open Availability with the room selected →
              </button>
            </div>

            {/* Submit */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <button style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: ACC, border: "none", borderRadius: 7, padding: "10px 20px", cursor: "pointer", fontFamily: "inherit" }}>
                Submit for review
              </button>
              <span style={{ fontSize: 12, color: MUT }}>A property and its rooms are reviewed like any other listing.</span>
            </div>

            <button style={{ fontSize: 12.5, fontWeight: 600, color: INK, background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit" }}>
              ← Back
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
