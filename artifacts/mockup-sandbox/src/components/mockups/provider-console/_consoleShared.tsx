// Shared console shell + availability editor for the provider-console mockups.
// Faithful to docs/design/provider-console-mockup/mockup.html — copy, numbers and
// callout markers are reproduced verbatim. Not a preview entry itself.

import type { CSSProperties, ReactNode } from "react";

export const T = {
  ink: "#1A1A18",
  muted: "#7A7A72",
  hair: "#E8E8E2",
  ground: "#FAFAF8",
  paper: "#FFFFFF",
  accent: "#35605A",
  accentSoft: "#EDF2F1",
  warnBg: "#FBF6EC",
  warnLine: "#D9C79A",
  warnInk: "#6B551F",
};

const navGroups: { label: string; items: { gl: string; name: string; proposed?: boolean }[] }[] = [
  {
    label: "Work",
    items: [
      { gl: "◇", name: "Dashboard" },
      { gl: "▤", name: "Calendar" },
      { gl: "✉", name: "Inbox" },
      { gl: "⚒", name: "Workstation" },
    ],
  },
  {
    label: "Business",
    items: [
      { gl: "▦", name: "Catalog" },
      { gl: "↗", name: "Distribute", proposed: true },
      { gl: "☺", name: "Customers" },
      { gl: "↑", name: "Performance" },
      { gl: "$", name: "Money" },
    ],
  },
  {
    label: "Account",
    items: [
      { gl: "⚙", name: "Settings" },
      { gl: "▣", name: "Playbook" },
    ],
  },
];

export function DotGhost({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 17, height: 17, flex: "0 0 17px", borderRadius: 100,
        background: T.accentSoft, color: T.accent, border: "1px solid #CBDAD7",
        fontSize: 11, lineHeight: 1, fontWeight: 600, verticalAlign: "middle", ...style,
      }}
    >
      {children}
    </span>
  );
}

export function PropChip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 550,
        color: T.warnInk, background: T.warnBg, border: `1px solid ${T.warnLine}`,
        borderRadius: 100, padding: "2px 10px", whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 100, background: "#C79A3C", flex: "0 0 6px" }} />
      {children}
    </span>
  );
}

export function ConsoleShell({ crumbs, active = "Catalog", children }: {
  crumbs: { label: string; current?: boolean }[];
  active?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        display: "grid", gridTemplateColumns: "216px minmax(0,1fr)", minHeight: "100vh",
        background: T.ground, color: T.ink, fontSize: 14, lineHeight: 1.5,
        fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
      }}
    >
      {/* ── sidebar ── */}
      <aside style={{ background: T.paper, borderRight: `1px solid ${T.hair}`, padding: "16px 12px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 8px 18px", fontWeight: 650, letterSpacing: "-0.01em", fontSize: 15 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="#35605A" strokeWidth="1.7" />
            <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" stroke="#35605A" strokeWidth="1.5" />
          </svg>
          Traveloure
        </div>
        <nav>
          {navGroups.map((g) => (
            <div key={g.label}>
              <div style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: T.muted, padding: "14px 8px 5px", fontWeight: 600 }}>
                {g.label}
              </div>
              {g.items.map((it) => {
                const on = it.name === active;
                return (
                  <button
                    key={it.name}
                    type="button"
                    style={{
                      display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 5,
                      fontSize: 13, width: "100%", textAlign: "left", cursor: "pointer",
                      background: on ? T.accentSoft : "none",
                      color: on ? T.accent : T.ink,
                      fontWeight: on ? 600 : 400,
                      border: it.proposed ? "1px dashed #BFD5D0" : "1px solid transparent",
                      boxShadow: on ? "inset 0 0 0 1px #CBDAD7" : "none",
                      font: "inherit",
                    }}
                  >
                    <span style={{ width: 15, textAlign: "center", color: on ? T.accent : T.muted, fontSize: 12, flex: "0 0 15px" }}>{it.gl}</span>
                    {it.name}
                    {it.proposed && (
                      <span
                        title="proposed new nav entry"
                        style={{
                          marginLeft: "auto", width: 15, height: 15, borderRadius: 100, background: T.accentSoft,
                          border: "1px solid #CBDAD7", color: T.accent, fontSize: 9,
                          display: "flex", alignItems: "center", justifyContent: "center",
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
        <div style={{ marginTop: "auto", padding: "14px 8px 4px", borderTop: `1px solid ${T.hair}`, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
          Provider console — proposed structure.<br />
          <b style={{ color: T.ink }}>Distribute</b> is the one new entry.
        </div>
      </aside>

      {/* ── main column ── */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ background: T.paper, borderBottom: `1px solid ${T.hair}`, padding: "11px 26px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span
            aria-hidden="true"
            style={{
              width: 29, height: 29, flex: "0 0 29px", borderRadius: 100, background: T.accentSoft,
              border: "1px solid #CBDAD7", color: T.accent, fontSize: 11, fontWeight: 650,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            AT
          </span>
          <span>
            <b style={{ display: "block", fontSize: 13.5, fontWeight: 650, lineHeight: 1.25 }}>Aiko Tanaka</b>
            <span style={{ display: "block", fontSize: 12, color: T.muted, lineHeight: 1.3 }}>Machiya Kikuya · Gion, Kyoto · Provider</span>
          </span>
          <span
            style={{
              marginLeft: "auto", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase",
              color: T.muted, border: `1px solid ${T.hair}`, borderRadius: 100, padding: "3px 11px", background: T.ground,
            }}
          >
            Mock — not connected to live data
          </span>
          <button
            type="button"
            style={{
              background: "transparent", color: T.ink, border: `1px solid ${T.hair}`, borderRadius: 6,
              padding: "6px 11px", fontSize: 12.5, fontWeight: 550, cursor: "pointer", whiteSpace: "nowrap", font: "inherit",
            }}
          >
            Mock notes
          </button>
        </div>

        <div style={{ background: T.paper, borderBottom: `1px solid ${T.hair}`, padding: "9px 26px", fontSize: 12.5 }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", color: T.muted }}>
            {crumbs.map((c, i) => (
              <span key={c.label} style={{ display: "inline-flex", gap: 7, alignItems: "center" }}>
                {i > 0 && <span style={{ color: "#C4C4BC" }}>›</span>}
                {c.current ? (
                  <span style={{ color: T.ink, fontWeight: 600 }}>{c.label}</span>
                ) : (
                  <span style={{ color: T.accent, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>{c.label}</span>
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

/* ═════════════ availability editor (gap #2) ═════════════ */

type AvKey = "tour" | "room" | "pdf";

const PICK: { key: AvKey; name: string; meta: string }[] = [
  { key: "tour", name: "Gion Evening Food Walk", meta: "In person · scheduled" },
  { key: "room", name: "Machiya — the Tatami Room", meta: "Property room · nightly" },
  { key: "pdf", name: "Tokyo Like a Local — 3-Day Guide", meta: "PDF guide · instant" },
];

type CellState = { k: "open" | "block" | "none"; t?: string };

function cellFor(sel: AvKey, day: number, month: "aug" | "sep"): CellState {
  if (sel === "tour" && month === "aug") {
    if (day >= 13 && day <= 16) return { k: "block", t: "Closed for Obon" };
    if (day === 22) return { k: "open", t: "11:00 · 6 seats *" };
    // pattern Tue/Thu from Aug 12 2026 (Aug 1 = Saturday)
    const dow = (6 + day - 1) % 7;
    if (day >= 12 && (dow === 2 || dow === 4)) return { k: "open", t: "18:00 · 8 seats" };
    return { k: "none" };
  }
  if (sel === "room" && month === "sep") {
    // range Sep 1 → Oct 31, $180/night; no September blackouts
    return { k: "open", t: "$180 / night" };
  }
  return { k: "none" };
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 7, ...style }}>{children}</div>;
}

function CardHd({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div style={{ padding: "14px 22px", borderBottom: `1px solid ${T.hair}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</h3>
      {right}
    </div>
  );
}

function MiniRow({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 0", fontSize: 12.5 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", fontWeight: 600 }}>{title}</b>
        <span style={{ display: "block", fontSize: 11.5, color: T.muted }}>{sub}</span>
      </div>
      <button type="button" style={{ background: "none", border: "none", color: T.accent, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 12, font: "inherit" }}>
        Remove
      </button>
    </div>
  );
}

function GhostBtn({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <button
      type="button"
      style={{
        background: "transparent", color: T.ink, border: `1px solid ${T.hair}`, borderRadius: 6,
        padding: "6px 11px", fontSize: 12.5, fontWeight: 550, cursor: "pointer", whiteSpace: "nowrap", font: "inherit", ...style,
      }}
    >
      {children}
    </button>
  );
}

function Capline({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, marginTop: 8, ...style }}>{children}</div>;
}

const inp: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px", border: `1px solid ${T.hair}`, borderRadius: 6,
  background: T.paper, color: T.ink, font: "inherit", fontSize: 13.5,
};

function RailBlackouts({ items }: { items: { label: string; range: string }[] }) {
  return (
    <Card>
      <CardHd title="Blackouts" right={<DotGhost>⑭</DotGhost>} />
      <div style={{ padding: "20px 22px" }}>
        <div>
          {items.length ? (
            items.map((b, i) => (
              <div key={b.label} style={{ borderBottom: i < items.length - 1 ? `1px solid ${T.hair}` : "none" }}>
                <MiniRow title={b.label} sub={b.range} />
              </div>
            ))
          ) : (
            <Capline style={{ margin: 0 }}>No blackouts.</Capline>
          )}
        </div>
        <input style={{ ...inp, marginTop: 10 }} placeholder="Reason (shown only to you)" aria-label="Blackout reason" readOnly />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <input style={{ ...inp, flex: "1 1 118px", minWidth: 0, width: "auto" }} type="date" defaultValue="2026-09-19" aria-label="Blackout from" readOnly />
          <span style={{ fontSize: 12.5, color: T.muted }}>to</span>
          <input style={{ ...inp, flex: "1 1 118px", minWidth: 0, width: "auto" }} type="date" defaultValue="2026-09-23" aria-label="Blackout to" readOnly />
        </div>
        <GhostBtn style={{ marginTop: 10 }}>Block this range</GhostBtn>
        <Capline>
          A blackout <b style={{ color: T.ink }}>subtracts</b> — it never edits the pattern or the range. Remove it and the days come back exactly as they were.
        </Capline>
      </div>
    </Card>
  );
}

export function AvailabilityEditor({ selected }: { selected: AvKey }) {
  const isTour = selected === "tour";
  const isRoom = selected === "room";
  const isPdf = selected === "pdf";

  // month geometry
  const monthTitle = isRoom ? "September 2026" : "August 2026";
  const firstDow = isRoom ? 2 : 6; // Sep 1 2026 = Tue; Aug 1 2026 = Sat
  const nDays = isRoom ? 30 : 31;
  const monthKey: "aug" | "sep" = isRoom ? "sep" : "aug";
  const jump = isTour ? "Next available: Tue 18 Aug" : isRoom ? "Next available: Tue 1 Sep" : null;

  const cells: ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={"p" + i} style={{ minHeight: 66, borderBottom: `1px solid ${T.hair}`, borderRight: (i + 1) % 7 ? `1px solid ${T.hair}` : "none", background: T.ground }} />);
  for (let d = 1; d <= nDays; d++) {
    const info = cellFor(selected, d, monthKey);
    const idx = firstDow + d - 1;
    const isToday = isTour && d === 12; // TODAY = 2026-08-12
    const bg = info.k === "open" ? T.accentSoft
      : info.k === "block" ? "repeating-linear-gradient(135deg,#FBF6EC,#FBF6EC 6px,#F5EDDC 6px,#F5EDDC 12px)"
      : undefined;
    cells.push(
      <div
        key={d}
        style={{
          minHeight: 66, padding: "5px 6px", fontSize: 11, position: "relative",
          borderBottom: `1px solid ${T.hair}`,
          borderRight: (idx + 1) % 7 ? `1px solid ${T.hair}` : "none",
          background: bg,
          boxShadow: isToday ? `inset 0 0 0 2px ${T.ink}` : undefined,
        }}
      >
        <span style={{ fontSize: 11, color: info.k === "open" ? T.accent : info.k === "block" ? T.warnInk : T.muted, fontWeight: info.k === "none" ? 400 : 650 }}>{d}</span>
        {info.t && (
          <span style={{ display: "block", fontSize: info.k === "block" ? 10.5 : 11, color: info.k === "block" ? T.warnInk : T.accent, fontWeight: info.k === "block" ? 500 : 600, lineHeight: 1.3, marginTop: 2 }}>
            {info.t}
          </span>
        )}
      </div>
    );
  }
  const trail = (7 - ((firstDow + nDays) % 7)) % 7;
  for (let i = 0; i < trail; i++) {
    const idx = firstDow + nDays + i;
    cells.push(<div key={"t" + i} style={{ minHeight: 66, borderBottom: `1px solid ${T.hair}`, borderRight: (idx + 1) % 7 ? `1px solid ${T.hair}` : "none", background: T.ground }} />);
  }

  const days2 = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div style={{ marginTop: 0 }}>
      <div style={{ border: `1px solid ${T.accent}`, borderRadius: 7, background: T.paper, padding: "18px 20px" }}>
        <h2 style={{ fontSize: 18, fontWeight: 650, letterSpacing: "-0.01em", marginBottom: 4, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          Availability<DotGhost>⑭</DotGhost>
          <PropChip>Proposed — gap #2 · ratify or amend</PropChip>
        </h2>
        <p style={{ color: T.muted, fontSize: 13, marginBottom: 18, maxWidth: "74ch" }}>
          The largest hole in the redesign: nothing else in the flow makes a listing <i>bookable</i>. One editor,
          whose semantics come from the listing's delivery method — scheduled listings author slots, property rooms
          publish date ranges, and things that sell without a calendar say so. Lives on{" "}
          <b style={{ color: T.ink }}>Catalog</b> (the §22b precedent that put slot editing there); Workstation's
          property room rows deep-link into it.
        </p>

        {/* three-listing switcher */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", border: `1px solid ${T.hair}`, borderRadius: 6, overflow: "hidden", marginBottom: 16, background: T.paper }}>
          {PICK.map((p, i) => {
            const on = p.key === selected;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                style={{
                  background: on ? T.accentSoft : T.paper, border: "none",
                  borderRight: i < 2 ? `1px solid ${T.hair}` : "none",
                  boxShadow: on ? `inset 0 -2px 0 ${T.accent}` : "none",
                  padding: "11px 14px", textAlign: "left", cursor: "pointer", font: "inherit",
                }}
              >
                <b style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.ink }}>{p.name}</b>
                <span style={{ display: "block", fontSize: 11.5, color: T.muted, marginTop: 2 }}>{p.meta}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 16, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>
            {isPdf ? (
              <div style={{ background: T.ground, border: `1px dashed ${T.hair}`, borderRadius: 6, padding: "26px 20px", textAlign: "center", fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
                <b style={{ color: T.ink, fontSize: 14, display: "block", marginBottom: 6 }}>No calendar — this sells without slots</b>
                A 28-page PDF is delivered the moment it is bought. There is nothing to publish, nothing to black out,
                and no “next available”. Showing an empty month grid here would invent a question this listing does not
                have — so the editor says so instead.
              </div>
            ) : (
              <Card style={{ overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${T.hair}`, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 14, fontWeight: 650, flex: 1, minWidth: 130 }}>{monthTitle}</b>
                  {jump && (
                    <button type="button" style={{ background: T.accentSoft, border: "1px solid #CBDAD7", color: T.accent, borderRadius: 100, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontWeight: 550, font: "inherit" }}>
                      {jump}
                    </button>
                  )}
                  <div style={{ display: "inline-flex", border: `1px solid ${T.hair}`, borderRadius: 6, overflow: "hidden", background: T.paper }}>
                    <button type="button" aria-label="Previous month" style={{ background: T.paper, border: "none", borderRight: `1px solid ${T.hair}`, padding: "7px 13px", fontSize: 12.5, cursor: "pointer", color: T.muted, font: "inherit" }}>‹</button>
                    <button type="button" aria-label="Next month" style={{ background: T.paper, border: "none", padding: "7px 13px", fontSize: 12.5, cursor: "pointer", color: T.muted, font: "inherit" }}>›</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", borderBottom: `1px solid ${T.hair}` }}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <span key={d} style={{ padding: "6px 8px", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: T.muted, fontWeight: 600 }}>{d}</span>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>{cells}</div>
                <div style={{ display: "flex", gap: 16, padding: "9px 14px", fontSize: 11, color: T.muted, flexWrap: "wrap" }}>
                  {[
                    { bg: T.accentSoft, bd: "#CBDAD7", label: "Bookable" },
                    { bg: "#F5EDDC", bd: T.warnLine, label: "Blacked out" },
                    { bg: T.paper, bd: T.hair, label: "Nothing published" },
                    { bg: T.paper, bd: T.ink, label: "Today" },
                  ].map((l) => (
                    <span key={l.label}>
                      <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: -1, background: l.bg, border: `1px solid ${l.bd}`, fontStyle: "normal" }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* right rail */}
          <div>
            {isTour && (
              <>
                <Card style={{ marginBottom: 12 }}>
                  <CardHd title="Repeats weekly" right={<PropChip>gap #2</PropChip>} />
                  <div style={{ padding: "20px 22px" }}>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5 }}>On these days</label>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {days2.map((d, i) => {
                          const on = i === 2 || i === 4;
                          return (
                            <button
                              key={d}
                              type="button"
                              aria-pressed={on}
                              style={{
                                width: 30, height: 30, borderRadius: 6, cursor: "pointer", font: "inherit",
                                border: `1px solid ${on ? T.accent : T.hair}`,
                                background: on ? T.accent : T.paper,
                                color: on ? "#fff" : T.muted,
                                fontSize: 11.5, fontWeight: on ? 650 : 400,
                              }}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5 }}>Start time</label>
                        <input style={inp} defaultValue="18:00" readOnly />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5 }}>Seats</label>
                        <input style={inp} defaultValue="8" readOnly />
                      </div>
                    </div>
                    <Capline style={{ marginTop: 12 }}>
                      Runs Wed 12 Aug → Sun 20 Dec. One pattern, written once — the grid is the{" "}
                      <b style={{ color: T.ink }}>outcome</b>, not a second thing to keep in sync.
                    </Capline>
                  </div>
                </Card>

                <Card style={{ marginBottom: 12 }}>
                  <CardHd title="One-off slots" />
                  <div style={{ padding: "20px 22px" }}>
                    <MiniRow title="Sat 22 Aug · 11:00 · 6 seats" sub="Extra morning walk" />
                    <GhostBtn style={{ marginTop: 10 }}>+ Add a one-off</GhostBtn>
                    <Capline>
                      Marked <b style={{ color: T.ink }}>*</b> on the grid so a one-off never looks like the pattern.
                    </Capline>
                  </div>
                </Card>

                <RailBlackouts items={[{ label: "Closed for Obon", range: "Thu 13 Aug → Sun 16 Aug" }]} />
              </>
            )}

            {isRoom && (
              <>
                <Card style={{ marginBottom: 12 }}>
                  <CardHd title="Published date ranges" right={<PropChip>gap #1 · #2</PropChip>} />
                  <div style={{ padding: "20px 22px" }}>
                    <MiniRow title="Tue 1 Sep → Sat 31 Oct" sub="$180 per night" />
                    <GhostBtn style={{ marginTop: 10 }}>+ Publish a range</GhostBtn>
                    <Capline>
                      A room is bookable <b style={{ color: T.ink }}>by the night across a range</b>, not by slot.
                      Nightly price belongs to the range, so a season can be priced without touching the listing.
                      There are no weekly day chips here — a room is not open “on Tuesdays”.
                    </Capline>
                  </div>
                </Card>
                <RailBlackouts items={[{ label: "Family staying", range: "Sat 10 Oct → Mon 12 Oct" }]} />
              </>
            )}

            {isPdf && (
              <Card>
                <CardHd title="Nothing to publish" />
                <div style={{ padding: "20px 22px" }}>
                  <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
                    This listing sells without a calendar, so there is no pattern, no range and no blackout rail.
                    The editor states that rather than showing three empty controls that would never do anything.
                  </div>
                  <Capline>
                    <b style={{ color: T.ink }}>The honest answer is a sentence, not an empty grid.</b> A provider
                    who sees a month here would reasonably think their guide needs dates.
                  </Capline>
                </div>
              </Card>
            )}
          </div>
        </div>

        <div style={{ background: T.ground, border: `1px dashed ${T.hair}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginTop: 16 }}>
          <b style={{ color: T.ink }}>Why one editor and not three.</b> A weekly pattern, a date range and “no
          calendar” are three <i>semantics</i>, not three products — they share the same month grid, the same
          blackout rail and the same published/not-published vocabulary. Splitting them would give a provider with a
          tour <i>and</i> a room two unrelated calendars to keep in their head.
        </div>
      </div>
    </div>
  );
}
