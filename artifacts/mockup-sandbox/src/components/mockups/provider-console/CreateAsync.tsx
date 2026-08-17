// Create flow — Async delivery details step (gap #3: voice_notes & async_messaging)
// Replicates docs/design/provider-console-mockup/mockup.html body_asyncdet() exactly.
import { useState } from "react";
import { Shell, StepList } from "./CreateSession";

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

const REPLIES: [string, string][] = [
  ["4h", "I reply within 4 hours"],
  ["24h", "I reply within 24 hours"],
  ["2d", "I reply within 2 days"],
];
const ECHO: Record<string, string> = {
  "4h": "Replies within 4 hours",
  "24h": "Replies within 24 hours",
  "2d": "Replies within 2 days",
};

const SCOPE_SEED = "Five days of messages while you are in Kyoto — restaurant calls, “is this queue worth it”, last-minute swaps when it rains. One traveler, as many questions as you have.";

export default function CreateAsync() {
  const [reply, setReply] = useState("24h");
  const [scope, setScope] = useState(SCOPE_SEED);

  return (
    <Shell crumbs={[["Workstation", false], ["New service", false], ["Step 2 · Async details", true]]}>
      <button type="button" style={{ background: "none", border: "none", color: ACC, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 2, marginBottom: 14, display: "inline-block", font: "inherit", padding: 0 }}>
        ← Back to “What are you building?”
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "236px minmax(0,1fr)", gap: 22, alignItems: "start" }}>
        <StepList
          steps={["Basics", "Async details", "Review & submit"]}
          cur={1}
          count={<><b>3 steps</b> for “Voice notes”. No location, transport or travel-surcharge questions anywhere in this flow — the Logistics step never appears.</>}
        />

        <main style={{ minWidth: 0 }}>
          <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
            <div style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Async delivery details</h3>
              <span style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: "1px solid #D9CDB2", background: WBG, color: WINK }}>Draft · autosaved</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>Step 2 of 3</span>
            </div>

            <div style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                <h5 style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: MUT, fontWeight: 600, margin: 0 }}>Async delivery details</h5>
                <PropChip text="Proposed — gap #3 · ratify or amend" />
              </div>

              <NoteQuiet style={{ marginBottom: 18 }}>
                Voice notes and async messaging are the platform's <b style={{ color: INK }}>provider-declared async lane</b>{" "}
                — there is no slot to book and no session to attend, so this branch asks three things the scheduled branches
                never do. It is deliberately <i>not</i> the PDF upload step.
                <DotGhost ch="⑲" />
              </NoteQuiet>

              <div style={{ marginBottom: 16 }}>
                <Label>How fast do you reply?</Label>
                <div style={{ display: "inline-flex", border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden", background: PAPER }}>
                  {REPLIES.map(([k, label], i) => (
                    <button key={k} type="button" aria-pressed={reply === k} onClick={() => setReply(k)} style={{
                      background: reply === k ? INK : PAPER, color: reply === k ? "#fff" : MUT,
                      border: "none", borderRight: i < REPLIES.length - 1 ? `1px solid ${HAIR}` : "none",
                      padding: "7px 13px", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", font: "inherit",
                    }}>{label}</button>
                  ))}
                </div>
                <Help>
                  Travelers see this on the listing as <b style={{ color: INK }}>“{ECHO[reply]}”</b>. It is your own
                  declaration — the platform does not police it, and does not claim to.
                </Help>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
                <div style={{ marginBottom: 16 }}>
                  <Label>What is included in one exchange?</Label>
                  <textarea style={{ ...inp, resize: "vertical", minHeight: 64 }} value={scope} onChange={(e) => setScope(e.target.value)} />
                  <Help>
                    The scope statement stands in for a duration. It is what a traveler is buying, in your words.{" "}
                    <span>{scope.length} characters</span>.
                  </Help>
                </div>
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <Label>How is it delivered?</Label>
                    <select style={inp} defaultValue="Messages in Traveloure chat">
                      <option>Messages in Traveloure chat</option>
                      <option>Voice notes in Traveloure chat</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <Label>Runs for</Label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input style={{ ...inp, maxWidth: 90 }} defaultValue="5" aria-label="Engagement window" />
                      <select style={inp} defaultValue="days from first message">
                        <option>days from first message</option>
                        <option>days from purchase</option>
                      </select>
                    </div>
                    <Help>The engagement window — when the clock starts, and when it stops.</Help>
                  </div>
                </div>
              </div>

              <div style={{ background: WBG, border: `1px solid ${WLN}`, color: WINK, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, lineHeight: 1.5 }}>
                <b style={{ fontWeight: 650 }}>Completion, honestly.</b> There is no slot that ends, so nothing marks this delivered on its own:{" "}
                <b style={{ fontWeight: 650 }}>you mark it complete, and the traveler has a dispute window before the payout settles.</b> That is the
                existing provider-declared completion rule, not a new one — this branch is wired to it rather than inventing
                a second definition of “done”.
              </div>

              <NoteQuiet style={{ marginTop: 16 }}>
                Basics are untouched — “Kyoto Questions — Ask Me Anything for 5 Days”, $30 per traveler. No location, transport,
                surcharge or slot question appears anywhere in this flow.
              </NoteQuiet>
            </div>

            <div style={{ padding: "0 22px 20px" }}>
              <div style={{ paddingTop: 16, borderTop: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
