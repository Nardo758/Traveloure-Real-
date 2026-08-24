// Create flow — Session step (gap #4, live-remote branch: video & phone call)
// Replicates docs/design/provider-console-mockup/mockup.html body_session() exactly.
import { useState } from "react";

const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const ACC = "#35605A";
const ACCS = "#EDF2F1";
const WBG = "#FBF6EC";
const WLN = "#D9C79A";
const WINK = "#6B551F";

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: `1px solid ${HAIR}`, borderRadius: 6,
  background: PAPER, color: INK, font: "inherit", fontSize: 13.5,
};

function DotGhost({ ch }: { ch: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 17, height: 17, borderRadius: 100, background: ACCS, color: ACC,
      border: "1px solid #CBDAD7", fontSize: 11, lineHeight: 1, fontWeight: 600,
      verticalAlign: "middle", marginLeft: 6,
    }}>{ch}</span>
  );
}

function PropChip({ text }: { text: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 550,
      color: WINK, background: WBG, border: `1px solid ${WLN}`, borderRadius: 100,
      padding: "2px 10px", whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 100, background: "#C79A3C", flex: "0 0 6px" }} />
      {text}
    </span>
  );
}

function NoteQuiet({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: GRD, border: `1px dashed ${HAIR}`, borderRadius: 6,
      padding: "11px 14px", fontSize: 12.5, color: MUT, lineHeight: 1.5, ...style,
    }}>{children}</div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5 }}>{children}</label>;
}
function Help({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 12, color: MUT, marginTop: 5, lineHeight: 1.5, ...style }}>{children}</div>;
}

const navGroups: [string, [string, string, boolean?, boolean?, string?][]][] = [
  ["Work", [["◇", "Dashboard"], ["▤", "Calendar"], ["✉", "Inbox"], ["⚒", "Workstation", true]]],
  ["Business", [["▦", "Catalog"], ["↗", "Distribute", false, true, "⑧"], ["☺", "Customers"], ["↑", "Performance"], ["$", "Money"]]],
  ["Account", [["⚙", "Settings"], ["▣", "Playbook"]]],
];

export function Shell({ crumbs, children }: { crumbs: [string, boolean][]; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAF8]" style={{
      display: "grid", gridTemplateColumns: "216px minmax(0,1fr)", minHeight: "100vh",
      color: INK, fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      fontSize: 14, lineHeight: 1.5,
    }}>
      <aside style={{ background: PAPER, borderRight: `1px solid ${HAIR}`, padding: "16px 12px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 8px 18px", fontWeight: 650, letterSpacing: "-.01em", fontSize: 15 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke={ACC} strokeWidth="1.7" />
            <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" stroke={ACC} strokeWidth="1.5" />
          </svg>
          Traveloure
        </div>
        <nav>
          {navGroups.map(([g, items]) => (
            <div key={g}>
              <div style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: MUT, padding: "14px 8px 5px", fontWeight: 600 }}>{g}</div>
              {items.map(([gl, label, on, proposed, dot]) => (
                <button key={label} type="button" style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 5,
                  fontSize: 13, width: "100%", textAlign: "left", cursor: "pointer", font: "inherit",
                  background: on ? ACCS : "none",
                  color: on ? ACC : INK,
                  fontWeight: on ? 600 : 400,
                  border: proposed ? "1px dashed #BFD5D0" : "1px solid transparent",
                  boxShadow: on ? "inset 0 0 0 1px #CBDAD7" : undefined,
                }}>
                  <span style={{ width: 15, textAlign: "center", color: on ? ACC : MUT, fontSize: 12, flex: "0 0 15px" }}>{gl}</span>
                  {label}
                  {dot && (
                    <span title="proposed new nav entry" style={{
                      marginLeft: "auto", width: 15, height: 15, borderRadius: 100, background: ACCS,
                      border: "1px solid #CBDAD7", color: ACC, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{dot}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: "14px 8px 4px", borderTop: `1px solid ${HAIR}`, fontSize: 11, color: MUT, lineHeight: 1.5 }}>
          Provider console — proposed structure.<br />
          <b style={{ color: INK }}>Distribute</b> is the one new entry.
        </div>
      </aside>

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ background: PAPER, borderBottom: `1px solid ${HAIR}`, padding: "11px 26px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{
            width: 29, height: 29, flex: "0 0 29px", borderRadius: 100, background: ACCS,
            border: "1px solid #CBDAD7", color: ACC, fontSize: 11, fontWeight: 650,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>AT</span>
          <span>
            <b style={{ display: "block", fontSize: 13.5, fontWeight: 650, lineHeight: 1.25 }}>Aiko Tanaka</b>
            <span style={{ display: "block", fontSize: 12, color: MUT, lineHeight: 1.3 }}>Machiya Kikuya · Gion, Kyoto · Provider</span>
          </span>
          <span style={{
            marginLeft: "auto", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase",
            color: MUT, border: `1px solid ${HAIR}`, borderRadius: 100, padding: "3px 11px", background: GRD,
          }}>Mock — not connected to live data</span>
          <button type="button" style={{
            background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "6px 11px",
            borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, font: "inherit", whiteSpace: "nowrap",
          }}>Mock notes</button>
        </div>
        <div style={{ background: PAPER, borderBottom: `1px solid ${HAIR}`, padding: "9px 26px", fontSize: 12.5 }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", color: MUT }}>
            {crumbs.map(([label, current], i) => (
              <span key={label} style={{ display: "flex", gap: 7, alignItems: "center" }}>
                {i > 0 && <span style={{ color: "#C4C4BC" }}>›</span>}
                {current
                  ? <span style={{ color: INK, fontWeight: 600 }}>{label}</span>
                  : <button type="button" style={{ background: "none", border: "none", padding: 0, color: ACC, cursor: "pointer", fontSize: 12.5, textDecoration: "underline", textUnderlineOffset: 2, font: "inherit" }}>{label}</button>}
              </span>
            ))}
          </div>
        </div>
        <div style={{ padding: "22px 26px 76px", maxWidth: 1180, width: "100%" }}>{children}</div>
      </div>
    </div>
  );
}

export function StepList({ steps, cur, count }: { steps: string[]; cur: number; count: React.ReactNode }) {
  return (
    <aside style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7, padding: 14, position: "sticky", top: 16 }}>
      <h5 style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: MUT, fontWeight: 600, marginBottom: 12 }}>Steps</h5>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {steps.map((s, i) => {
          const done = i < cur, on = i === cur;
          return (
            <li key={s} style={{
              display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 6px", borderRadius: 6,
              fontSize: 13, cursor: "pointer",
              color: on || done ? INK : MUT,
              fontWeight: on ? 600 : 400,
              background: on ? ACCS : undefined,
            }}>
              <span style={{
                width: 20, height: 20, flex: "0 0 20px", borderRadius: 100,
                border: `1px solid ${done ? INK : on ? ACC : HAIR}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
                background: done ? INK : on ? ACC : PAPER,
                color: done || on ? "#fff" : undefined,
              }}>{done ? "✓" : i + 1}</span>
              <span>{s}</span>
            </li>
          );
        })}
      </ol>
      <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${HAIR}`, fontSize: 12, color: MUT }}>{count}</div>
      <NoteQuiet style={{ marginTop: 12, fontSize: 11.5 }}>
        The step list is generated from the delivery method. Nothing here is a fixed 4-step wizard.
      </NoteQuiet>
    </aside>
  );
}

export default function CreateSession() {
  const [venue, setVenue] = useState("traveloure");
  const [cap, setCap] = useState<"1on1" | "group">("1on1");
  const [tz, setTz] = useState("Japan (GMT+9)");
  const [link, setLink] = useState("");

  return (
    <Shell crumbs={[["Workstation", false], ["New service", false], ["Step 2 · Session details", true]]}>
      <button type="button" style={{ background: "none", border: "none", color: ACC, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 2, marginBottom: 14, display: "inline-block", font: "inherit", padding: 0 }}>
        ← Back to “What are you building?”
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "236px minmax(0,1fr)", gap: 22, alignItems: "start" }}>
        <StepList
          steps={["Basics", "Session details", "Review & submit"]}
          cur={1}
          count={<><b>3 steps</b> for “Video call”. No location, transport or travel-surcharge questions anywhere in this flow — the Logistics step never appears.</>}
        />

        <main style={{ minWidth: 0 }}>
          <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
            <div style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Session details</h3>
              <span style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: "1px solid #D9CDB2", background: WBG, color: WINK }}>Draft · autosaved</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>Step 2 of 3</span>
            </div>

            <div style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                <h5 style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: MUT, fontWeight: 600, margin: 0 }}>Session details</h5>
                <PropChip text="Proposed — gap #4 · ratify or amend" />
              </div>

              <NoteQuiet style={{ marginBottom: 18 }}>
                <b style={{ color: INK }}>No location card, no transport question, no travel surcharge.</b> This method does not
                happen anywhere, so those questions are not asked — not disabled, not skipped over. Absent. What it does need
                is the three things a remote session actually turns on: <b style={{ color: INK }}>when you are reachable,
                where the call happens, and whether it is one person or a group.</b>
                <DotGhost ch="①" /><DotGhost ch="⑲" />
              </NoteQuiet>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
                <div style={{ marginBottom: 16 }}>
                  <Label>How long is the call?</Label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={inp} defaultValue="45" />
                    <select style={inp} defaultValue="minutes"><option>minutes</option></select>
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <Label>Your timezone</Label>
                  <select style={inp} value={tz} onChange={(e) => setTz(e.target.value)}>
                    {["Japan (GMT+9)", "Korea (GMT+9)", "Singapore (GMT+8)", "United Kingdom (GMT+1)", "US Pacific (GMT−7)"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <Help>Named the way a person would say it, not “Asia/Tokyo”. Travelers see start times converted to their own clock — you never do that arithmetic.</Help>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
                <div style={{ marginBottom: 16 }}>
                  <Label>Where does it happen?</Label>
                  <select style={inp} value={venue} onChange={(e) => setVenue(e.target.value)}>
                    <option value="traveloure">Traveloure video room</option>
                    <option value="own">My own link (Zoom, Meet, Teams)</option>
                    <option value="phone">I call their number</option>
                  </select>
                  <Help>The default room needs nothing from you and cannot go stale.</Help>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <Label>Languages you can run it in</Label>
                  <input style={inp} defaultValue="English, Japanese" />
                </div>
              </div>

              {venue === "own" ? (
                <div style={{ marginBottom: 16, padding: 14, border: `1px solid ${ACC}`, borderRadius: 6, background: ACCS }}>
                  <Label>Your meeting link</Label>
                  <input style={inp} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.example.com/aiko-kyoto" aria-label="Your meeting link" />
                  <Help style={{ color: ACC }}>
                    <b>Shared with the traveler only after booking</b> — it never appears on the public listing, in search,
                    or in a share image. If you paste a room that anyone can join, that is your decision to make knowingly.
                  </Help>
                </div>
              ) : (
                <NoteQuiet style={{ marginBottom: 16 }}>
                  Choosing <b style={{ color: INK }}>my own link</b> reveals one field for it, and states plainly that the
                  link is shared with the traveler only after booking.
                </NoteQuiet>
              )}

              <div style={{ marginBottom: 16 }}>
                <Label>Is this one-on-one, or a group?</Label>
                <div style={{ display: "inline-flex", border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden", background: PAPER }}>
                  {([["1on1", "One-on-one"], ["group", "A group can join"]] as const).map(([k, label], i) => (
                    <button key={k} type="button" aria-pressed={cap === k} onClick={() => setCap(k)} style={{
                      background: cap === k ? INK : PAPER, color: cap === k ? "#fff" : MUT,
                      border: "none", borderRight: i === 0 ? `1px solid ${HAIR}` : "none",
                      padding: "7px 13px", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", font: "inherit",
                    }}>{label}</button>
                  ))}
                </div>
                {cap === "group" ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                    <span style={{ fontSize: 12.5, color: MUT }}>Up to</span>
                    <input style={{ ...inp, maxWidth: 80 }} defaultValue="6" aria-label="Group size" />
                    <span style={{ fontSize: 12.5, color: MUT }}>people on the call — checkout refuses a booking past this number</span>
                  </div>
                ) : (
                  <Help>One traveler per booking. There is no seat count to keep, and none is asked for.</Help>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <Label>What do they walk away with?</Label>
                <textarea style={{ ...inp, resize: "vertical", minHeight: 64 }} defaultValue="A written summary of what we decided, sent within a day of the call." />
              </div>
            </div>

            <div style={{ padding: "0 22px 20px" }}>
              <div style={{ marginTop: 0, paddingTop: 16, borderTop: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={{ background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, font: "inherit" }}>← Back</button>
                <button type="button" style={{ background: INK, color: "#fff", border: `1px solid ${INK}`, padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, font: "inherit" }}>Next: Review & submit →</button>
                <span style={{ marginLeft: "auto" }} />
                <span style={{ fontSize: 12, color: MUT }}>Autosaved. Closing this tab keeps everything.</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </Shell>
  );
}
