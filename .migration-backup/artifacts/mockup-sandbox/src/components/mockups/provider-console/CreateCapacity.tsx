// Create flow — Capacity step (in_person). Replicates body_capacity (~lines 2197-2212)
// of docs/design/provider-console-mockup/mockup.html with zero divergence.

import { ConsoleShell } from "./CreateBasics";

const INK = "#1A1A18";
const MUTED = "#7A7A72";
const HAIR = "#E8E8E2";
const GROUND = "#FAFAF8";

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: `1px solid ${HAIR}`, borderRadius: 6,
  background: "#fff", color: INK, font: "inherit", fontSize: 13.5,
};
const fieldLabel: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5 };
const help: React.CSSProperties = { fontSize: 12, color: MUTED, marginTop: 5, lineHeight: 1.5 };

function RenamedChip({ was }: { was: string }) {
  return (
    <div style={{ background: "#FBF6EC", border: "1px solid #D9C79A", color: "#6B551F", borderRadius: 6, padding: "11px 14px", fontSize: 12.5, lineHeight: 1.5, marginBottom: 16, display: "flex", gap: 9, alignItems: "flex-start", flexWrap: "wrap" }}>
      <span style={{ flex: "0 0 auto", display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: `1px solid ${HAIR}`, color: MUTED, background: GROUND }}>renamed — amend if you prefer</span>
      <span style={{ fontSize: 12.5, lineHeight: 1.55, flex: 1, minWidth: 220 }}>
        Previously called <b style={{ fontWeight: 650 }}>{was}</b>. The name <b style={{ fontWeight: 650 }}>Logistics</b> now belongs to the new 4th step, which is where everything spatial went. Say the word and we will call this something else.
      </span>
    </div>
  );
}

export default function CreateCapacity() {
  return (
    <ConsoleShell
      curStep={2}
      stepTitle="Capacity — how many people"
      footer={
        <>
          <button style={{ font: "inherit", background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550 }}>← Back</button>
          <button style={{ font: "inherit", border: `1px solid ${INK}`, background: INK, color: "#fff", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550 }}>Next: Logistics →</button>
          <span style={{ marginLeft: "auto" }} />
          <span style={{ fontSize: 12, color: MUTED }}>Autosaved. Closing this tab keeps everything.</span>
        </>
      }
    >
      <RenamedChip was="Group" />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Party size</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={inp} defaultValue="1" />
            <span style={{ color: MUTED }}>to</span>
            <input style={inp} defaultValue="4" />
          </div>
          <div style={help}>
            One pair of numbers. Today capacity is asked three times, in three vocabularies. These are the numbers checkout refuses a booking against, so a traveler can never book a party you cannot take.
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Seating</label>
          <select style={inp} defaultValue="Private — one party at a time">
            <option>Private — one party at a time</option>
            <option>Shared — I will seat several parties together</option>
          </select>
          <div style={help}>Asked once, here, and rendered on the traveler’s page in these words.</div>
        </div>
      </div>

      <div style={{ background: GROUND, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
        Capacity is its own step because it is the answer most often got wrong when it was buried in a 44-control screen — and because the new <b style={{ color: INK }}>Logistics</b> step needed the name this step used to share.
      </div>
    </ConsoleShell>
  );
}
