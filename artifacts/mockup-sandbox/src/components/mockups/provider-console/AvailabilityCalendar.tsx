// Availability — standalone page (promoted out of the Catalog inline container).
// Design copied from the reference artifact: one editor whose semantics come from
// the listing's delivery method; month grid + published ranges rail + blackouts rail.

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";
const CELL_OK = "#F2F5F3";

const label = { fontSize: 10.5, fontWeight: 700 as const, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.08em" };

export function AvailabilityCalendar() {
  // September 2026: Sep 1 is a Tuesday; 30 days.
  const weeks: (number | null)[][] = [];
  let day = 1;
  const firstDow = 2; // Tue
  for (let w = 0; w < 5; w++) {
    const row: (number | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if ((w === 0 && d < firstDow) || day > 30) row.push(null);
      else row.push(day++);
    }
    weeks.push(row);
  }

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
        <span style={{ color: ACC, textDecoration: "underline", cursor: "pointer" }}>Catalog</span>
        <span style={{ color: MUT }}> · </span>
        <span style={{ color: INK, fontWeight: 600 }}>Availability</span>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 24px 32px" }}>

        {/* ── Title + badge ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>Availability</h1>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 999, padding: "3px 10px" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: WARN_INK }} />
            Proposed — gap #2 · ratify or amend
          </span>
        </div>
        <p style={{ fontSize: 12, color: MUT, margin: "0 0 16px", lineHeight: 1.6, maxWidth: "68ch" }}>
          The largest hole in the redesign: nothing else in the flow makes a listing <em>bookable</em>. One
          editor, whose semantics come from the listing's delivery method — scheduled listings author slots,
          property rooms publish date ranges, and things that sell without a calendar say so. Now its own page;
          Catalog rows and Workstation's property room rows deep-link into it.
        </p>

        {/* ── Listing tabs ── */}
        <div style={{ display: "flex", border: `1px solid ${HAIR}`, borderRadius: 7, overflow: "hidden", background: PAPER, marginBottom: 16 }}>
          {[
            { name: "Gion Evening Food Walk", meta: "In person · scheduled", on: false },
            { name: "Machiya — the Tatami Room", meta: "Property room · nightly", on: true },
            { name: "Tokyo Like a Local — 3-Day Guide", meta: "PDF guide · instant", on: false },
          ].map((t, i) => (
            <div key={t.name} style={{ flex: 1, padding: "11px 16px", cursor: "pointer", borderRight: i < 2 ? `1px solid ${HAIR}` : "none", background: t.on ? "#EDF2F1" : PAPER, borderBottom: t.on ? `2px solid ${ACC}` : "2px solid transparent" }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0, color: t.on ? ACC : INK }}>{t.name}</p>
              <p style={{ fontSize: 11, color: MUT, margin: "2px 0 0" }}>{t.meta}</p>
            </div>
          ))}
        </div>

        {/* ── Calendar + rails ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>

          {/* Month grid */}
          <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <p style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>September 2026</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: ACC, background: "#EDF2F1", border: `1px solid ${ACC}33`, borderRadius: 999, padding: "4px 12px" }}>Next available: Tue 1 Sep</span>
                {["‹", "›"].map(a => (
                  <button key={a} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${HAIR}`, background: PAPER, color: INK, fontSize: 13, cursor: "pointer" }}>{a}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderTop: `1px solid ${HAIR}`, borderLeft: `1px solid ${HAIR}` }}>
              {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(d => (
                <div key={d} style={{ padding: "7px 8px", borderRight: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}`, ...label }}>{d}</div>
              ))}
              {weeks.flat().map((d, i) => (
                <div key={i} style={{ minHeight: 46, padding: "6px 8px", borderRight: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}`, background: d ? CELL_OK : GRD }}>
                  {d && <>
                    <p style={{ fontSize: 11.5, fontWeight: 700, margin: 0 }}>{d}</p>
                    <p style={{ fontSize: 10.5, color: MUT, margin: "2px 0 0" }}>$180 / night</p>
                  </>}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
              {[
                [CELL_OK, "Bookable", `1px solid ${HAIR}`],
                [WARN_BG, "Blacked out", `1px solid ${WARN_LINE}`],
                [GRD, "Nothing published", `1px solid ${HAIR}`],
                [PAPER, "Today", `1.5px solid ${INK}`],
              ].map(([bg, txt, bd]) => (
                <span key={txt as string} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, color: MUT }}>
                  <span style={{ width: 11, height: 11, borderRadius: 2, background: bg as string, border: bd as string }} />
                  {txt}
                </span>
              ))}
            </div>
          </div>

          {/* Right rails */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Published date ranges */}
            <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Published date ranges</p>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 999, padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: WARN_INK }} />
                  gap #1 · #2
                </span>
              </div>
              <div style={{ border: `1px solid ${HAIR}`, borderRadius: 6, padding: "9px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Tue 1 Sep → Sat 31 Oct</span>
                  <button style={{ fontSize: 11, color: MUT, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Remove</button>
                </div>
                <p style={{ fontSize: 11, color: MUT, margin: "2px 0 0" }}>$180 per night</p>
              </div>
              <button style={{ fontSize: 12, fontWeight: 600, color: INK, background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
                + Publish a range
              </button>
              <p style={{ fontSize: 11, color: MUT, margin: 0, lineHeight: 1.55 }}>
                A room is bookable <span style={{ fontWeight: 700, color: INK }}>by the night across a range</span>, not by slot. Nightly price belongs to the range, so a season can be priced without touching the listing. There are no weekly day chips here — a room is not open “on Tuesdays”.
              </p>
            </div>

            {/* Blackouts */}
            <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "14px 16px" }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>Blackouts <span style={{ fontSize: 10, color: MUT }}>ⓘ</span></p>
              <div style={{ border: `1px solid ${HAIR}`, borderRadius: 6, padding: "9px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Family staying</span>
                  <button style={{ fontSize: 11, color: MUT, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Remove</button>
                </div>
                <p style={{ fontSize: 11, color: MUT, margin: "2px 0 0" }}>Sat 10 Oct → Mon 12 Oct</p>
              </div>
              <input placeholder="Reason (shown only to you)" style={{ width: "100%", boxSizing: "border-box" as const, fontSize: 11.5, padding: "8px 10px", border: `1px solid ${HAIR}`, borderRadius: 6, marginBottom: 8, fontFamily: "inherit", color: INK, background: PAPER }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <input value="09/19/2026" readOnly style={{ flex: 1, minWidth: 0, fontSize: 11.5, padding: "8px 10px", border: `1px solid ${HAIR}`, borderRadius: 6, fontFamily: "inherit", color: INK, background: PAPER }} />
                <span style={{ fontSize: 11, color: MUT }}>to</span>
              </div>
              <input value="09/23/2026" readOnly style={{ width: "100%", boxSizing: "border-box" as const, fontSize: 11.5, padding: "8px 10px", border: `1px solid ${HAIR}`, borderRadius: 6, marginBottom: 10, fontFamily: "inherit", color: INK, background: PAPER }} />
              <button style={{ fontSize: 12, fontWeight: 600, color: INK, background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
                Block this range
              </button>
              <p style={{ fontSize: 11, color: MUT, margin: 0, lineHeight: 1.55 }}>
                A blackout <span style={{ fontWeight: 700, color: INK }}>subtracts</span> — it never edits the pattern or the range. Remove it and the days come back exactly as they were.
              </p>
            </div>
          </div>
        </div>

        {/* ── Why one editor ── */}
        <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "12px 16px", marginTop: 16, background: GRD }}>
          <p style={{ fontSize: 11.5, color: MUT, margin: 0, lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700, color: INK }}>Why one editor and not three.</span> A weekly pattern, a date range and “no calendar” are three <em>semantics</em>, not three products — they share the same month grid, the same blackout rail and the same published/not-published vocabulary. Splitting them would give a provider with a tour <em>and</em> a room two unrelated calendars to keep in their head.
          </p>
        </div>

      </div>
    </div>
  );
}
