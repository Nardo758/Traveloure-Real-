// Create flow — "What they get" step (artifact / pdf method)
// Replicates docs/design/provider-console-mockup/mockup.html body_artifact() exactly.
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
function Help({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: MUT, marginTop: 5, lineHeight: 1.5 }}>{children}</div>;
}

export default function CreateArtifact() {
  const [uploaded, setUploaded] = useState(false);

  return (
    <Shell crumbs={[["Workstation", false], ["New service", false], ["Step 2 · What they get", true]]}>
      <button type="button" style={{ background: "none", border: "none", color: ACC, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 2, marginBottom: 14, display: "inline-block", font: "inherit", padding: 0 }}>
        ← Back to “What are you building?”
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "236px minmax(0,1fr)", gap: 22, alignItems: "start" }}>
        <StepList
          steps={["Basics", "What they get", "Review & submit"]}
          cur={1}
          count={<><b>3 steps</b> for “PDF guide”. No location, transport or travel-surcharge questions anywhere in this flow — the Logistics step never appears.</>}
        />

        <main style={{ minWidth: 0 }}>
          <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
            <div style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>What they get</h3>
              <span style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: "1px solid #D9CDB2", background: WBG, color: WINK }}>Draft · autosaved</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>Step 2 of 3</span>
            </div>

            <div style={{ padding: "20px 22px" }}>
              <NoteQuiet style={{ marginBottom: 18 }}>
                <b style={{ color: INK }}>No location, transport or surcharge anywhere in this flow.</b> A guide is not
                delivered somewhere, so the form never asks where.<DotGhost ch="①" />
              </NoteQuiet>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
                <div style={{ marginBottom: 16 }}>
                  <Label>What exactly do they receive?</Label>
                  <input style={inp} defaultValue="A 28-page PDF plus a printable one-page map" />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <Label>How soon after buying?</Label>
                  <select style={inp} defaultValue="Instantly — it is already written">
                    <option>Instantly — it is already written</option>
                    <option>Within 2 days — I personalise it</option>
                    <option>Within a week</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <Label>Upload the file</Label>
                {uploaded ? (
                  <div style={{ border: `1px solid ${HAIR}`, borderRadius: 6, padding: 18, textAlign: "center", background: PAPER }}>
                    <div style={{ fontSize: 13, fontWeight: 550 }}>tokyo-like-a-local-v3.pdf</div>
                    <div style={{ fontSize: 12, color: ACC, marginTop: 3 }}>
                      Uploaded · 4.1 MB ·{" "}
                      <button type="button" onClick={() => setUploaded(false)} style={{ background: "none", border: "none", color: ACC, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 13, fontWeight: 500, font: "inherit" }}>Remove</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 6, padding: 22, textAlign: "center", background: GRD }}>
                    <div style={{ fontSize: 13, color: MUT, marginBottom: 9 }}>No file yet — travelers cannot receive anything until there is one.</div>
                    <button type="button" onClick={() => setUploaded(true)} style={{ background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, font: "inherit", whiteSpace: "nowrap" }}>Upload the guide</button>
                  </div>
                )}
                <Help>
                  Travelers get the current file at the moment they buy. Updating it later does not re-send.
                  This is the item the draft checklist watches — it ticks when a file is here, not when you tick it.
                </Help>
              </div>

              <div style={{ marginBottom: 16 }}>
                <Label>Show a sample?</Label>
                <select style={inp} defaultValue="First 3 pages, free">
                  <option>First 3 pages, free</option>
                  <option>No sample</option>
                </select>
                <Help>Optional.</Help>
              </div>
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
