// Provider Distribute mockup — one hub for getting what you sell seen
// Sections: Storefront · Channel-state strip · Marketplace · Direct link · Share kit · Promote

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";

const LISTINGS = [
  { id: "1", name: "Gion Evening Food Walk", live: true },
  { id: "2", name: "Morning Tea Ceremony", live: false },
  { id: "3", name: "Tokyo Like a Local Guide", live: true },
  { id: "4", name: "Kyoto Trip Planning Call", live: false },
];

export function Distribute() {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", color: INK }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 28px", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* Page header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>↗</span>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>Distribute</h1>
          </div>
          <p style={{ fontSize: 13, color: MUT, margin: 0, maxWidth: "70ch", lineHeight: 1.55 }}>
            One hub for getting what you sell seen — your storefront, the marketplace, direct links, share kits and posting nudges.
          </p>
        </div>

        {/* ── Storefront channel ── */}
        <section>
          <SectionLabel icon="🏪">Storefront</SectionLabel>
          <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" as const }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>Your storefront page</span>
                  <LiveChip />
                </div>
                <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 10px", lineHeight: 1.5 }}>
                  Your public page — every approved, active listing you own in one place.
                </p>
                <code style={{ fontSize: 11.5, color: INK, background: GRD, border: `1px solid ${HAIR}`, borderRadius: 4, padding: "3px 8px", display: "inline-block" }}>
                  traveloure.com/s/aiko-tanaka
                </code>
              </div>
              {/* Faux QR */}
              <div style={{ width: 72, height: 72, border: `1px solid ${HAIR}`, borderRadius: 7, background: GRD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 28 }}>▣</span>
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              <ActionBtn>Copy link</ActionBtn>
              <ActionBtn>WhatsApp</ActionBtn>
              <ActionBtn>Download QR</ActionBtn>
            </div>
          </div>
        </section>

        {/* ── Per-listing section ── */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
            <SectionLabel icon="">This listing</SectionLabel>
            {/* Listing selector */}
            <select style={{ border: `1px solid ${HAIR}`, borderRadius: 6, padding: "7px 10px", fontSize: 13, color: INK, background: PAPER, minWidth: 240 }}>
              {LISTINGS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Channel-state strip */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const,
            borderRadius: 10, border: `1px solid ${HAIR}`, background: `${GRD}`, padding: 12,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, flex: 1 }}>
              <StateChip icon="🏪" label="Storefront" ok text="live" />
              <StateChip icon="🛍️" label="Marketplace" ok text="live" />
              <StateChip icon="🔗" label="Direct" ok={false} text="no link yet" />
              <StateChip icon="🖼️" label="Social" ok text="images ready" />
            </div>
            <button style={{ fontSize: 12.5, color: INK, background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "7px 13px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
              <span>📊</span> View link performance →
            </button>
          </div>

          {/* Marketplace card */}
          <ChannelCard icon="🛍️" title="Marketplace" subtitle="Where travelers discover this listing on Traveloure — Search, Discover and the feeds.">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <LiveChip />
              <span style={{ fontSize: 13, color: MUT }}>Travelers can find and book <strong style={{ color: INK }}>Gion Evening Food Walk</strong> right now.</span>
            </div>
            <ActionBtn>View public page →</ActionBtn>
          </ChannelCard>

          {/* Direct link card */}
          <ChannelCard icon="🔗" title="Direct link" subtitle="Your own trackable booking link for this listing — share it anywhere.">
            <p style={{ fontSize: 12.5, color: MUT, marginBottom: 10, lineHeight: 1.5 }}>
              A booking through your own link is attributed to you and secures your rails rate.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              <ActionBtn>Copy link</ActionBtn>
              <ActionBtn>WhatsApp</ActionBtn>
              <ActionBtn>Show QR</ActionBtn>
            </div>
          </ChannelCard>

          {/* Share kit card */}
          <ChannelCard icon="🖼️" title="Share kit" subtitle="Ready-to-post images, an editable caption and one-tap Instagram publish for this listing.">
            {/* Three faux share frames */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
              {[
                { label: "Story", bg: "#C9DDD6", emoji: "🚶" },
                { label: "Square", bg: "#D5E3E0", emoji: "🚶" },
                { label: "Landscape", bg: "#EDF2F1", emoji: "🚶" },
              ].map(f => (
                <div key={f.label} style={{ background: f.bg, borderRadius: 7, border: `1px solid ${HAIR}`, overflow: "hidden", aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <span style={{ fontSize: 28 }}>{f.emoji}</span>
                  <span style={{ fontSize: 11, color: INK, fontWeight: 600 }}>{f.label}</span>
                </div>
              ))}
            </div>
            {/* Caption editor */}
            <textarea
              readOnly
              value={`🌟 Gion Evening Food Walk — taste Kyoto's street food scene with a local guide. Book at traveloure.com/services/gion-food-walk`}
              style={{ width: "100%", borderRadius: 6, border: `1px solid ${HAIR}`, background: GRD, padding: "9px 11px", fontSize: 12.5, color: MUT, resize: "none", height: 72, lineHeight: 1.5, boxSizing: "border-box" as const }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" as const }}>
              <ActionBtn>Copy caption + link</ActionBtn>
              <ActionBtn>WhatsApp</ActionBtn>
              <ActionBtn>Post to X</ActionBtn>
              <ActionBtn accent>Publish to Instagram</ActionBtn>
            </div>
          </ChannelCard>
        </section>

        {/* ── Promote ── */}
        <section>
          <SectionLabel icon="📢">Promote</SectionLabel>
          <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "Golden Week is coming (May 3–5)", tag: "Seasonal", urgency: "3 weeks away" },
              { label: "Cherry Blossom season — Kyoto openings", tag: "Event", urgency: "6 weeks away" },
            ].map(o => (
              <div key={o.label} style={{ border: `1px solid ${HAIR}`, borderRadius: 7, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 999, border: `1px solid ${HAIR}`, background: GRD, color: MUT }}>{o.tag}</span>
                    <span style={{ fontSize: 11, color: MUT }}>{o.urgency}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{o.label}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <ActionBtn>Copy caption + link</ActionBtn>
                  <ActionBtn accent>Post to Instagram</ActionBtn>
                </div>
              </div>
            ))}
            {/* Measurement note */}
            <div style={{ borderRadius: 6, border: `1px dashed ${HAIR}`, background: `${GRD}`, padding: "10px 14px", fontSize: 12, color: MUT, lineHeight: 1.5 }}>
              <strong style={{ color: INK }}>Measurement stays on Performance.</strong>{" "}
              This page makes the asset and hands you the link; how it did is a question the analytics module answers.
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionLabel({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
      {icon && <span>{icon}</span>} {children}
    </p>
  );
}

function LiveChip() {
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid #BFD5D0`, background: "#EDF2F1", color: ACC, display: "inline-flex", alignItems: "center", gap: 4 }}>
      ✓ Live
    </span>
  );
}

function StateChip({ icon, label, ok, text }: { icon: string; label: string; ok: boolean; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 7, border: `1px solid ${HAIR}`, background: PAPER, padding: "8px 10px" }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: INK, lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: ok ? "#166534" : MUT, lineHeight: 1.2, marginTop: 2 }}>
          {ok ? `✓ ${text}` : text}
        </div>
      </div>
    </div>
  );
}

function ChannelCard({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8 }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${HAIR}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{title}</span>
        </div>
        <p style={{ fontSize: 12.5, color: MUT, margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
      </div>
      <div style={{ padding: "14px 18px" }}>{children}</div>
    </div>
  );
}

function ActionBtn({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <button style={{
      fontSize: 12.5, padding: "7px 13px", borderRadius: 6, cursor: "pointer",
      border: `1px solid ${accent ? ACC : HAIR}`,
      background: accent ? ACC : PAPER,
      color: accent ? PAPER : INK,
      fontFamily: "inherit",
    }}>
      {children}
    </button>
  );
}
