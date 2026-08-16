// Distribute — Section 1: Storefront channel (account-level)
// Shows: handle live, storefront URL, QR, share tools

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";

export function DistributeStorefront() {
  return (
    <Frame title="Distribute — Storefront" subtitle="Your public storefront page — every approved, active listing in one place.">

      {/* Channel-state strip (account-level chips only) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
        <StateChip icon="🏪" label="Storefront" ok text="live" />
        <StateChip icon="🛍️" label="Marketplace" ok text="live" dim />
        <StateChip icon="🔗" label="Direct" ok={false} text="no link yet" dim />
        <StateChip icon="🖼️" label="Social" ok text="images ready" dim />
      </div>

      {/* Storefront card — full layout */}
      <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>Your storefront page</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid #BFD5D0", background: "#EDF2F1", color: ACC }}>✓ Live</span>
            </div>
            <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 12px", lineHeight: 1.5 }}>
              Your public page — every approved, active listing you own in one place for travelers to browse and book.
            </p>
            <code style={{ fontSize: 12, color: INK, background: GRD, border: `1px solid ${HAIR}`, borderRadius: 4, padding: "4px 10px" }}>
              traveloure.com/s/aiko-tanaka
            </code>
          </div>
          {/* QR */}
          <div style={{ width: 88, height: 88, border: `1px solid ${HAIR}`, borderRadius: 8, background: GRD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 40 }}>▣</span>
          </div>
        </div>

        {/* Share actions */}
        <div style={{ padding: "14px 20px", display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          <Btn>Copy link</Btn>
          <Btn>WhatsApp</Btn>
          <Btn>Post to X</Btn>
          <Btn>Download QR (PNG)</Btn>
          <Btn>Download QR (SVG)</Btn>
        </div>
      </div>

      {/* Listings on storefront */}
      <div style={{ marginTop: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
          What's showing on your storefront (3 live listings)
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { name: "Gion Evening Food Walk", price: "$52/person" },
            { name: "Tokyo Like a Local Guide", price: "$24" },
            { name: "Kimono Dressing & Gion Photo Walk", price: "$120/group" },
          ].map(l => (
            <div key={l.name} style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 999, border: "1px solid #BFD5D0", background: "#EDF2F1", color: ACC }}>Live</span>
                <span style={{ fontSize: 13, color: INK }}>{l.name}</span>
              </div>
              <span style={{ fontSize: 12.5, color: MUT }}>{l.price}</span>
            </div>
          ))}
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

function StateChip({ icon, label, ok, text, dim }: { icon: string; label: string; ok: boolean; text: string; dim?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 7, border: `1px solid ${HAIR}`, background: dim ? GRD : PAPER, padding: "8px 10px", opacity: dim ? 0.55 : 1 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: INK, lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: ok ? "#166534" : MUT, lineHeight: 1.2, marginTop: 2 }}>{ok ? `✓ ${text}` : text}</div>
      </div>
    </div>
  );
}

function Btn({ children }: { children: React.ReactNode }) {
  return (
    <button style={{ fontSize: 12.5, padding: "7px 13px", borderRadius: 6, cursor: "pointer", border: `1px solid ${HAIR}`, background: PAPER, color: INK, fontFamily: "inherit" }}>
      {children}
    </button>
  );
}
