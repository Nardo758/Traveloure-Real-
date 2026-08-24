// Distribute — Gap states (§13 honesty):
// Shows a listing with real blockers before the gates are cleared.
// What the provider sees: Marketplace blocked, no direct link, social locked, no promote opportunities.

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";
const ERR_BG = "#FDF3F2";
const ERR_LINE = "#F5C6C2";
const ERR_INK = "#B84235";

export function DistributeGaps() {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif", color: INK, padding: "28px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>

        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
          Distribute — Gap states
        </h2>
        <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 22px", lineHeight: 1.5 }}>
          Morning Tea Ceremony · Blocked listing — what the provider sees before clearing identity + attestation gates.
        </p>

        {/* Channel strip — three of four blocked */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 20 }}>
          <Chip icon="🏪" label="Storefront" ok text="live" />
          <Chip icon="🛍️" label="Marketplace" ok={false} text="not live yet" warn />
          <Chip icon="🔗" label="Direct" ok={false} text="no link yet" />
          <Chip icon="🖼️" label="Social" ok={false} text="needs approval" warn />
        </div>

        {/* GAP 1 — Marketplace blocked */}
        <Gap n={1} icon="🛍️" title="Marketplace — listing not live"
          sub="This listing can't go live until you resolve the following:">
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:6 }}>
            <Blocker sev="error"
              msg="Your identity hasn't been verified yet. Verified providers are trusted by travelers and unlock full marketplace distribution."
              fix="Verify identity →" />
            <Blocker sev="warn"
              msg="You haven't confirmed the operating attestations for this listing (safety, local compliance, age restrictions)."
              fix="Complete attestations →" />
          </div>
        </Gap>

        {/* GAP 2 — Direct link not yet minted */}
        <Gap n={2} icon="🔗" title="Direct link — no link yet"
          sub="The link is minted the first time you act — Copy link, WhatsApp or Show QR. Nothing to resolve beforehand.">
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <Btn>Copy link</Btn>
            <Btn>WhatsApp</Btn>
            <Btn>Show QR</Btn>
          </div>
          <p style={{ fontSize:11.5, color:MUT, margin:"10px 0 0", lineHeight:1.5 }}>
            Tapping any action above mints the link inline — the tracked /r/ rail is unchanged underneath.
          </p>
        </Gap>

        {/* GAP 3 — Share kit locked */}
        <Gap n={3} icon="🖼️" title="Share kit — locked until approved"
          sub="Social images are generated once this listing is approved and active on the marketplace.">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginTop:10 }}>
            {["Story","Square","Landscape"].map(l => (
              <div key={l} style={{ background:HAIR, borderRadius:8, border:`1px dashed ${HAIR}`, aspectRatio:"1", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6 }}>
                <span style={{ fontSize:20, opacity:0.35 }}>🖼️</span>
                <span style={{ fontSize:11, color:MUT, opacity:0.6 }}>{l}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize:11.5, color:MUT, margin:"10px 0 0", lineHeight:1.5 }}>
            Resolve gaps 1 &amp; 2 above → listing goes live → share kit unlocks automatically.
          </p>
        </Gap>

        {/* GAP 4 — No promote opportunities */}
        <Gap n={4} icon="📢" title="Promote — no opportunities yet"
          sub="Posting nudges appear when your listings are live and match an upcoming event, season or open slot.">
          <div style={{ borderRadius:6, border:`1px dashed ${HAIR}`, background:GRD, padding:"14px 16px", textAlign:"center" as const }}>
            <p style={{ fontSize:12.5, color:MUT, margin:0, lineHeight:1.5 }}>
              No opportunities right now — get at least one listing approved and we'll surface relevant moments to promote it.
            </p>
          </div>
        </Gap>

      </div>
    </div>
  );
}

// ── primitives ──────────────────────────────────────────────────────────────

function Chip({ icon, label, ok, text, warn }: { icon:string; label:string; ok:boolean; text:string; warn?:boolean }) {
  const border = !ok && warn ? WARN_LINE : HAIR;
  const bg     = !ok && warn ? WARN_BG  : ok ? PAPER : GRD;
  const sub    = ok ? "#166534" : warn ? WARN_INK : MUT;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, borderRadius:7, padding:"8px 10px", border:`1px solid ${border}`, background:bg }}>
      <span style={{ fontSize:14 }}>{icon}</span>
      <div>
        <div style={{ fontSize:11.5, fontWeight:600, color:INK, lineHeight:1.2 }}>{label}</div>
        <div style={{ fontSize:10.5, color:sub, lineHeight:1.2, marginTop:2 }}>{ok ? `✓ ${text}` : text}</div>
      </div>
    </div>
  );
}

function Gap({ n, icon, title, sub, children }: { n:number; icon:string; title:string; sub:string; children:React.ReactNode }) {
  return (
    <div style={{ background:PAPER, border:`1px solid ${HAIR}`, borderRadius:8, marginBottom:16, overflow:"hidden" }}>
      <div style={{ padding:"14px 18px", borderBottom:`1px solid ${HAIR}`, display:"flex", gap:10, alignItems:"flex-start" }}>
        <span style={{ fontSize:12, fontWeight:700, color:MUT, background:HAIR, borderRadius:999, width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
          {n}
        </span>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
            <span style={{ fontSize:14 }}>{icon}</span>
            <span style={{ fontSize:13.5, fontWeight:600, color:INK }}>{title}</span>
          </div>
          <p style={{ fontSize:12.5, color:MUT, margin:0, lineHeight:1.5 }}>{sub}</p>
        </div>
      </div>
      <div style={{ padding:"14px 18px" }}>{children}</div>
    </div>
  );
}

function Blocker({ sev, msg, fix }: { sev:"error"|"warn"; msg:string; fix:string }) {
  const bg = sev === "error" ? ERR_BG  : WARN_BG;
  const ln = sev === "error" ? ERR_LINE : WARN_LINE;
  const ink = sev === "error" ? ERR_INK : WARN_INK;
  return (
    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, borderRadius:7, border:`1px solid ${ln}`, background:bg, padding:"11px 14px" }}>
      <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
        <span style={{ fontSize:13, color:ink, flexShrink:0 }}>{sev==="error"?"✕":"⚠"}</span>
        <p style={{ fontSize:12.5, color:ink, margin:0, lineHeight:1.5 }}>{msg}</p>
      </div>
      <button style={{ fontSize:12, fontWeight:600, color:ink, background:"none", border:`1px solid ${ln}`, borderRadius:5, padding:"5px 10px", cursor:"pointer", whiteSpace:"nowrap" as const, flexShrink:0 }}>
        {fix}
      </button>
    </div>
  );
}

function Btn({ children }: { children:React.ReactNode }) {
  return (
    <button style={{ fontSize:12.5, padding:"7px 13px", borderRadius:6, cursor:"pointer", border:`1px solid ${HAIR}`, background:PAPER, color:INK, fontFamily:"inherit" }}>
      {children}
    </button>
  );
}
