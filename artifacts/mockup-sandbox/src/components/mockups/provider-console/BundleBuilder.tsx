// Bundle builder (gap #9) — component picker over approved listings, derived method,
// provider-set bundle price, availability-is-intersection rule.
// Replicates docs/design/provider-console-mockup/mockup.html renderBundle() exactly.
import { useState } from "react";
import { Shell } from "./CreateSession";

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

const COMPONENTS = [
  { k: "tour", n: "Gion Evening Food Walk", m: "In person", p: 52 },
  { k: "tea", n: "Morning Tea Ceremony in a Machiya", m: "In person", p: 40 },
  { k: "call", n: "Kyoto Trip Planning Call — 45 min", m: "Video call", p: 40 },
  { k: "pdf", n: "Tokyo Like a Local — 3-Day Guide", m: "PDF guide", p: 24 },
];

function CheckSvg() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
      <path d="M4 10.5l4 4 8-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BundleBuilder() {
  const [picked, setPicked] = useState<string[]>(["tour", "tea"]);
  const [price, setPrice] = useState("92");
  const [submitted, setSubmitted] = useState(false);

  const pickedComps = picked.map((k) => COMPONENTS.find((c) => c.k === k)!);
  const methods: string[] = [];
  pickedComps.forEach((c) => { if (!methods.includes(c.m)) methods.push(c.m); });
  const total = pickedComps.reduce((a, c) => a + c.p, 0);
  const derived = methods.length === 0 ? "—" : methods.length === 1 ? methods[0] : "Hybrid";
  const derivedWhy =
    methods.length === 0 ? <>Pick at least two components and the method follows from them.</>
    : methods.length === 1 ? <>Every component is “{methods[0]}”, so the bundle is too.</>
    : <>Components mix {methods.join(" and ")}, so the bundle is <b style={{ color: INK }}>Hybrid</b>.</>;

  const toggle = (k: string) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  return (
    <Shell crumbs={[["Workstation", false], ["New bundle", true]]}>
      <button type="button" style={{ background: "none", border: "none", color: ACC, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 2, marginBottom: 14, display: "inline-block", font: "inherit", padding: 0 }}>
        ← Back to “What are you building?”
      </button>

      <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
        <div style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>New bundle</h3>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 550, color: WINK, background: WBG, border: `1px solid ${WLN}`, borderRadius: 100, padding: "2px 10px", whiteSpace: "nowrap" }}>
            <span style={{ width: 6, height: 6, borderRadius: 100, background: "#C79A3C", flex: "0 0 6px" }} />
            Proposed — gap #9 · ratify or amend
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: MUT }}>Previewing the unlocked state</span>
        </div>

        <div style={{ padding: "20px 22px" }}>
          <div style={{ background: GRD, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUT, lineHeight: 1.5, marginBottom: 18 }}>
            A bundle is <b style={{ color: INK }}>not a new kind of thing</b> — it is your own approved listings sold
            together at one price. That is why it has a picker instead of a create form.
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 17, height: 17, borderRadius: 100, background: ACCS, color: ACC, border: "1px solid #CBDAD7", fontSize: 11, lineHeight: 1, fontWeight: 600, verticalAlign: "middle", marginLeft: 6 }}>⑯</span>
          </div>

          <h5 style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: MUT, fontWeight: 600, marginBottom: 10 }}>Pick the components</h5>
          {COMPONENTS.map((c) => {
            const on = picked.includes(c.k);
            return (
              <button key={c.k} type="button" aria-checked={on} onClick={() => toggle(c.k)} style={{
                display: "flex", gap: 12, alignItems: "center",
                border: `1px solid ${on ? ACC : HAIR}`, boxShadow: on ? `inset 0 0 0 1px ${ACC}` : undefined,
                borderRadius: 6, padding: "12px 14px", marginBottom: 9, background: PAPER,
                cursor: "pointer", width: "100%", textAlign: "left", flexWrap: "wrap", font: "inherit", color: INK,
              }}>
                <span style={{
                  width: 19, height: 19, flex: "0 0 19px", borderRadius: 5,
                  border: on ? `1.5px solid ${ACC}` : `1.5px solid ${HAIR}`,
                  background: on ? ACC : PAPER,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{on ? <CheckSvg /> : null}</span>
                <span style={{ flex: 1, minWidth: 180 }}>
                  <b style={{ fontSize: 13.5 }}>{c.n}</b>
                  <span style={{ display: "block", fontSize: 12, color: MUT }}>{c.m} · ${c.p} on its own</span>
                </span>
                <span style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: `1px solid ${HAIR}`, color: MUT, background: GRD }}>approved</span>
              </button>
            );
          })}

          <h5 style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: MUT, fontWeight: 600, marginBottom: 10, marginTop: 20 }}>In this bundle</h5>
          <div style={{ border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden" }}>
            {pickedComps.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", fontSize: 13 }}>
                <span style={{ flex: 1, minWidth: 150, color: MUT }}>Nothing picked yet.</span>
              </div>
            ) : pickedComps.map((c, i) => (
              <div key={c.k} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderBottom: i < pickedComps.length - 1 ? `1px solid ${HAIR}` : "none", fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ width: 20, height: 20, flex: "0 0 20px", borderRadius: 100, background: GRD, border: `1px solid ${HAIR}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: MUT }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 150 }}>{c.n}</span>
                <span style={{ fontSize: 12.5, color: MUT }}>${c.p}</span>
                <button type="button" onClick={() => toggle(c.k)} style={{ background: "none", border: "none", color: MUT, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 12, fontWeight: 500, font: "inherit" }}>Remove</button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.55, marginTop: 8 }}>
            These stay linked to the originals. Editing a component edits the listing it came from,
            and a component that leaves approval takes the bundle out of sale with it.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, marginTop: 18 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5 }}>Delivery method</label>
              <input style={{ ...inp, background: GRD, color: MUT }} value={derived} readOnly />
              <div style={{ fontSize: 12, color: MUT, marginTop: 5, lineHeight: 1.5 }}>
                <b style={{ color: INK }}>Derived, not chosen.</b> {derivedWhy}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5 }}>Bundle price</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: MUT }}>$</span>
                <input style={{ ...inp, maxWidth: 130 }} value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Bundle price" />
              </div>
              <div style={{ fontSize: 12, color: MUT, marginTop: 5, lineHeight: 1.5 }}>
                Components total <b style={{ color: INK }}>${total}</b> — <b style={{ color: INK }}>you set the
                bundle price</b>. Nothing is auto-summed and no discount is calculated for you; whatever you type is what a
                traveler pays, in one booking.
              </div>
            </div>
          </div>

          <div style={{ background: WBG, border: `1px solid ${WLN}`, color: WINK, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, lineHeight: 1.5 }}>
            <b style={{ fontWeight: 650 }}>Availability is the intersection.</b> A bundle is bookable only when every component is — the proposed
            rule, stated here so it is not discovered at checkout. Set it on{" "}
            <button type="button" style={{ background: "none", border: "none", color: ACC, padding: 0, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", fontSize: 12.5, fontWeight: 500, font: "inherit" }}>Availability →</button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
            <button type="button" disabled={submitted} onClick={() => setSubmitted(true)} style={{
              background: ACC, border: `1px solid ${ACC}`, color: "#fff", padding: "9px 16px",
              borderRadius: 6, cursor: submitted ? "default" : "pointer", fontSize: 13.5, fontWeight: 550, font: "inherit",
            }}>{submitted ? "Submitted" : "Submit for review"}</button>
            <span style={{ fontSize: 12.5, color: MUT }}>A bundle is reviewed like any other listing.</span>
          </div>
        </div>
      </div>
    </Shell>
  );
}
