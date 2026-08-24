// Create flow — Scheduling step (in_person). Replicates body_scheduling (~lines 2153-2195)
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

function Attest({ title, desc }: { title: string; desc: string }) {
  return (
    <button
      type="button"
      aria-checked={false}
      style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${HAIR}`, textAlign: "left", display: "flex", gap: 13, alignItems: "flex-start", padding: "14px 18px", cursor: "pointer", font: "inherit" }}
    >
      <span style={{ width: 19, height: 19, flex: "0 0 19px", borderRadius: 5, border: `1.5px solid ${HAIR}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 550, color: INK, textDecoration: "none" }}>{title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{desc}</span>
      </span>
    </button>
  );
}

export default function CreateScheduling() {
  return (
    <ConsoleShell
      curStep={1}
      stepTitle="Scheduling — timing, duration & booking rules"
      footer={
        <>
          <button style={{ font: "inherit", background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550 }}>← Back</button>
          <button style={{ font: "inherit", border: `1px solid ${INK}`, background: INK, color: "#fff", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550 }}>Next: Capacity →</button>
          <span style={{ marginLeft: "auto" }} />
          <span style={{ fontSize: 12, color: MUTED }}>Autosaved. Closing this tab keeps everything.</span>
        </>
      }
    >
      <RenamedChip was="Logistics" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>How long does it take?</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={inp} defaultValue="90" />
            <select style={inp} defaultValue="minutes">
              <option>minutes</option>
              <option>hours</option>
              <option>days</option>
            </select>
          </div>
          <div style={help}>Asked once. Today the same answer is collected twice, in two different units.</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Notice you need before a booking</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={inp} defaultValue="24" />
            <select style={inp} defaultValue="hours">
              <option>hours</option>
              <option>days</option>
            </select>
          </div>
          <div style={help}>Below this, the slot stops being bookable — enforced at checkout, not just displayed.</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Guests can change up to</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={inp} defaultValue="24" />
            <select style={inp} defaultValue="hours before">
              <option>hours before</option>
              <option>days before</option>
            </select>
          </div>
          <div style={help}>Your change cutoff. The only one of these fields the server already reads today.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Booking rule</label>
          <select style={inp} defaultValue="Request first — I approve each booking">
            <option>Request first — I approve each booking</option>
            <option>Instant book</option>
          </select>
          <div style={help}>Per listing, not per account.</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Start window</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={inp} defaultValue="10:00" />
            <span style={{ color: MUTED }}>to</span>
            <input style={inp} defaultValue="16:00" />
          </div>
          <div style={help}>Earliest and latest start you will take on a day you are open.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>What should they bring or wear?</label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 64 }} defaultValue="Socks without holes — you will be on tatami. Nothing else; kimono is provided if you want one." />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Anything travelers should know about access?</label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 64 }} defaultValue="One step up at the entrance and low seating. I can provide a low stool — tell me when you book." />
          <div style={help}>Written in your words. We do not claim an accessibility standard on your behalf.</div>
        </div>
      </div>

      <div style={{ height: 1, background: HAIR, margin: "6px 0 16px" }} />
      <h5 style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: MUTED, fontWeight: 600, marginBottom: 10 }}>Safety basics</h5>
      <div style={{ background: GROUND, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
        <Attest
          title="I hold public liability cover for this activity"
          desc="Required for in-person listings. Not asked at all for remote ones."
        />
        <Attest
          title="I have read the in-person conduct standards"
          desc="Two minutes. Opens in a panel — you will not lose this draft."
        />
      </div>
      <div style={{ ...help, marginTop: 9 }}>
        Both of these are what the draft checklist’s “safety basics” row watches. It ticks when they are ticked <b style={{ color: INK }}>here</b>.
      </div>
    </ConsoleShell>
  );
}
