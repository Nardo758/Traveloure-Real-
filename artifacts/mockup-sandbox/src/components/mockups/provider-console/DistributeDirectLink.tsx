// Distribute — Section 3: Direct link channel (per-listing, link generated + QR shown)

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";

const LISTING_URL = "https://traveloure.com/r/gion-fw-at";

export function DistributeDirectLink() {
  return (
    <Frame title="Distribute — Direct link" subtitle="Gion Evening Food Walk · Your trackable booking link — one click mints it, then share anywhere.">

      {/* Channel strip — Direct highlighted */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
        <StateChip icon="🏪" label="Storefront" ok text="live" dim />
        <StateChip icon="🛍️" label="Marketplace" ok text="live" dim />
        <StateChip icon="🔗" label="Direct" ok text="link ready" highlight />
        <StateChip icon="🖼️" label="Social" ok text="images ready" dim />
      </div>

      <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8 }}>
        {/* Card header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${HAIR}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <span style={{ fontSize: 15 }}>🔗</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>Direct link</span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid #BFD5D0", background: "#EDF2F1", color: ACC }}>✓ Link ready</span>
          </div>
          <p style={{ fontSize: 12.5, color: MUT, margin: 0, lineHeight: 1.5 }}>
            A booking through your own link is attributed to you and secures your rails rate.
          </p>
        </div>

        <div style={{ padding: "16px 20px" }}>
          {/* URL box */}
          <code style={{ display: "block", fontSize: 12, color: INK, background: GRD, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "10px 12px", wordBreak: "break-all", lineHeight: 1.6, marginBottom: 14, fontFamily: "ui-monospace, Menlo, monospace" }}>
            {LISTING_URL}
          </code>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" as const }}>
            <Btn>Copy link</Btn>
            <Btn>WhatsApp</Btn>
            <Btn active>Hide QR</Btn>
          </div>

          {/* QR + download */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ width: 140, height: 140, border: `1px solid ${HAIR}`, borderRadius: 10, background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56 }}>
              ▣
            </div>
            <div style={{ paddingTop: 8 }}>
              <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 10px", lineHeight: 1.5, maxWidth: "38ch" }}>
                Scan to open the booking page directly — use this on printed menus, table cards, or anywhere you meet guests in person.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn>↓ Download QR (PNG)</Btn>
                <Btn>↓ Download QR (SVG)</Btn>
              </div>
            </div>
          </div>

          {/* Caption with copy */}
          <div style={{ marginTop: 20, padding: "14px 16px", background: GRD, border: `1px solid ${HAIR}`, borderRadius: 7 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 8px" }}>Suggested caption</p>
            <p style={{ fontSize: 12.5, color: INK, lineHeight: 1.6, margin: "0 0 10px" }}>
              🌟 Gion Evening Food Walk — taste Kyoto's street food scene with a local guide. Book at {LISTING_URL}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn>Copy caption + link</Btn>
              <Btn>WhatsApp</Btn>
              <Btn>Post to X</Btn>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Frame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", color: INK, padding: "28px 28px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: "0 0 4px", letterSpacing: "-0.01em" }}>{title}</h2>
        <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 22px", lineHeight: 1.5 }}>{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function StateChip({ icon, label, ok, text, dim, highlight }: { icon: string; label: string; ok: boolean; text: string; dim?: boolean; highlight?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, borderRadius: 7, padding: "8px 10px",
      border: highlight ? `1.5px solid ${ACC}` : `1px solid ${HAIR}`,
      background: highlight ? "#EDF2F1" : dim ? GRD : PAPER,
      opacity: dim ? 0.55 : 1,
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: highlight ? ACC : INK, lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: ok ? "#166534" : MUT, lineHeight: 1.2, marginTop: 2 }}>{ok ? `✓ ${text}` : text}</div>
      </div>
    </div>
  );
}

function Btn({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button style={{ fontSize: 12.5, padding: "7px 13px", borderRadius: 6, cursor: "pointer", border: `1px solid ${active ? ACC : HAIR}`, background: active ? "#EDF2F1" : PAPER, color: active ? ACC : INK, fontFamily: "inherit" }}>
      {children}
    </button>
  );
}
