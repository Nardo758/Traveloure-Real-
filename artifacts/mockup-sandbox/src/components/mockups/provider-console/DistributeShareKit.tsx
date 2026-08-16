// Distribute — Section 4: Share kit (social images + editable caption + Instagram publish)

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";

const FRAMES = [
  { label: "Story (9:16)", emoji: "🚶", bg: "#C9DDD6", hint: "1080 × 1920" },
  { label: "Square (1:1)", emoji: "🚶", bg: "#D5E3E0", hint: "1080 × 1080" },
  { label: "Landscape (1.91:1)", emoji: "🚶", bg: "#EDF2F1", hint: "1200 × 628" },
];

const DEFAULT_CAPTION = `🌟 Gion Evening Food Walk — taste Kyoto's street food scene with a local guide.\n\nBook my link in bio or at traveloure.com/r/gion-fw-at`;

export function DistributeShareKit() {
  return (
    <Frame title="Distribute — Share kit" subtitle="Gion Evening Food Walk · Ready-to-post images, editable caption and one-tap Instagram publish.">

      {/* Channel strip — Social highlighted */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
        <StateChip icon="🏪" label="Storefront" ok text="live" dim />
        <StateChip icon="🛍️" label="Marketplace" ok text="live" dim />
        <StateChip icon="🔗" label="Direct" ok text="link ready" dim />
        <StateChip icon="🖼️" label="Social" ok text="images ready" highlight />
      </div>

      <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8 }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${HAIR}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <span style={{ fontSize: 15 }}>🖼️</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>Share kit</span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid #BFD5D0", background: "#EDF2F1", color: ACC }}>✓ Images ready</span>
          </div>
          <p style={{ fontSize: 12.5, color: MUT, margin: 0, lineHeight: 1.5 }}>
            Tap an image to select it, edit the caption, then copy, post to X or publish directly to Instagram.
          </p>
        </div>

        <div style={{ padding: "16px 20px" }}>
          {/* Image frames */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
            {FRAMES.map((f, i) => (
              <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{
                  background: f.bg, borderRadius: 8, border: i === 1 ? `2px solid ${ACC}` : `1px solid ${HAIR}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 6, padding: 12, aspectRatio: "1", cursor: "pointer", position: "relative",
                }}>
                  {i === 1 && (
                    <div style={{ position: "absolute", top: 6, right: 6, background: ACC, color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>
                      SELECTED
                    </div>
                  )}
                  <span style={{ fontSize: 32 }}>{f.emoji}</span>
                  <span style={{ fontSize: 10.5, color: INK, fontWeight: 600, textAlign: "center" }}>{f.label}</span>
                  <span style={{ fontSize: 10, color: MUT }}>{f.hint}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Caption editor */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>
                Caption
              </p>
              <button style={{ fontSize: 11.5, color: MUT, background: "none", border: "none", cursor: "pointer" }}>Reset to default</button>
            </div>
            <textarea
              defaultValue={DEFAULT_CAPTION}
              style={{ width: "100%", borderRadius: 6, border: `1px solid ${HAIR}`, background: GRD, padding: "10px 12px", fontSize: 12.5, color: INK, resize: "vertical", minHeight: 90, lineHeight: 1.6, boxSizing: "border-box" as const, fontFamily: "inherit" }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            <Btn>Copy caption + link</Btn>
            <Btn>WhatsApp</Btn>
            <Btn>Post to X</Btn>
            <Btn accent>📸 Publish to Instagram</Btn>
          </div>

          {/* Instagram publish note */}
          <p style={{ fontSize: 11.5, color: MUT, marginTop: 10, lineHeight: 1.5 }}>
            Instagram publish sends the selected image + caption to your connected account. Connect your account in Settings if you haven't yet.
          </p>
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 7, padding: "8px 10px", border: highlight ? `1.5px solid ${ACC}` : `1px solid ${HAIR}`, background: highlight ? "#EDF2F1" : dim ? GRD : PAPER, opacity: dim ? 0.55 : 1 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: highlight ? ACC : INK, lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: ok ? "#166534" : MUT, lineHeight: 1.2, marginTop: 2 }}>{ok ? `✓ ${text}` : text}</div>
      </div>
    </div>
  );
}

function Btn({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <button style={{ fontSize: 12.5, padding: "7px 13px", borderRadius: 6, cursor: "pointer", border: `1px solid ${accent ? ACC : HAIR}`, background: accent ? ACC : PAPER, color: accent ? PAPER : INK, fontFamily: "inherit" }}>
      {children}
    </button>
  );
}
