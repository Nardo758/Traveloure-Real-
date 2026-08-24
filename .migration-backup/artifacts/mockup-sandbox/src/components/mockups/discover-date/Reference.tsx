export function Reference() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", minHeight: "100vh", padding: "12px 14px" }}>

      {/* ── HERO — light mint, date-aware ──────────────────────────── */}
      <div style={{
        background: "#E1F5EE",
        borderRadius: 14,
        padding: "14px 18px",
        marginBottom: 14,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 500, color: "#04342C" }}>Kyoto</div>
          <div style={{ fontSize: 13, color: "#0F6E56", marginTop: 3 }}>🌸 9/10 in April · cherry-blossom season · moderate crowds</div>
          <div style={{
            fontSize: 12, color: "#0F6E56", marginTop: 5,
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(255,255,255,0.55)", padding: "3px 10px", borderRadius: 999,
          }}>
            📅 Planning April 8 &nbsp;<span style={{ fontSize: 13, opacity: 0.6 }}>✕</span>
          </div>
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: "#0F6E56" }}>88</div>
          <div style={{ fontSize: 11, color: "#0F6E56" }}>pulse</div>
        </div>
      </div>

      {/* ── PULLED TO TOP ─────────────────────────────────────────── */}
      <div style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>On April 8 — pulled to the top</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>

        {/* Seasonal event card */}
        <div style={{
          flex: "2 1 240px", display: "flex",
          background: "#fff", border: "0.5px solid #9FE1CB", borderRadius: 12, overflow: "hidden",
        }}>
          <div style={{ width: 68, flexShrink: 0, background: "#FBEAF0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "#72243E" }}>🌸</div>
          <div style={{ padding: "10px 12px", flex: 1 }}>
            <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>📌 Why you're here</span>
            <div style={{ fontSize: 14, fontWeight: 500, margin: "5px 0 6px", color: "#111" }}>Cherry blossom (Hanami) season</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <button style={{ fontSize: 12, padding: "5px 11px", borderRadius: 7, background: "#185FA5", color: "#fff", border: "none", cursor: "pointer" }}>Tickets</button>
              <button style={{ fontSize: 12, padding: "5px 11px", borderRadius: 7, background: "#fff", color: "#111", border: "0.5px solid #d1d5db", cursor: "pointer" }}>Add to April 8</button>
            </div>
          </div>
        </div>

        {/* Companion SERVICE card — platform badge */}
        <div style={{ flex: "1 1 140px", background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <div style={{ fontSize: 18, color: "#085041" }}>📷</div>
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#f0fdf4", color: "#166534", fontWeight: 700, letterSpacing: "0.04em" }}>PLATFORM</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Blossom photo shoot</div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>seasonal · from ¥12,000</div>
          <button style={{ fontSize: 12, padding: "4px 10px", borderRadius: 7, background: "#0F6E56", color: "#fff", border: "none", cursor: "pointer" }}>Book</button>
        </div>
      </div>

      {/* ── SPINE FILTER CHIPS ────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
        {["All gems", "Eat", "Do", "Stay", "Services", "Experts", "Events", "Photo spots"].map((c, i) => (
          <span key={c} style={{
            fontSize: 13, padding: "6px 13px", borderRadius: 999,
            border: i === 0 ? "none" : "0.5px solid #dde3e7",
            background: i === 0 ? "#E1F5EE" : "#fff",
            color: i === 0 ? "#085041" : "#666", cursor: "pointer",
          }}>{c}</span>
        ))}
      </div>

      {/* ── NEIGHBOURHOOD CONTAINER ───────────────────────────────── */}
      <div style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>

        {/* Header */}
        <div style={{ padding: "12px 15px", display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#085041", flexShrink: 0 }}>📍</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Arashiyama</span>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "#F1EFE8", color: "#444441", fontWeight: 500 }}>Neighborhood</span>
            </div>
            <div style={{ fontSize: 12, color: "#0F6E56", marginTop: 2 }}>Trending · 8 things to do</div>
          </div>
          <button style={{ fontSize: 12, padding: "6px 11px", borderRadius: 7, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer", flexShrink: 0 }}>Add a day</button>
        </div>

        {/* Inner bento */}
        <div style={{ background: "#f8f9fa", borderTop: "0.5px solid #e2e8f0", padding: "13px 14px" }}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>In Arashiyama</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>

            {/* Marquee stay — span 2, has match strip */}
            <div style={{ gridColumn: "span 2", display: "flex", background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ width: 68, flexShrink: 0, background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#0C447C" }}>🏯</div>
              <div style={{ padding: "10px 12px", flex: 1 }}>
                <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "#FAEEDA", color: "#633806", fontWeight: 500 }}>Marquee stay</span>
                <div style={{ fontSize: 14, fontWeight: 500, margin: "5px 0 6px" }}>Suiran riverside ryokan</div>
                {/* Match strip */}
                <div style={{ fontSize: 11, color: "#666", borderTop: "0.5px dashed #e2e8f0", paddingTop: 6, marginBottom: 7, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>🚗 matched: private car · ¥9,000</span>
                  <button style={{ fontSize: 11, padding: "4px 9px", borderRadius: 6, background: "#0F6E56", color: "#fff", border: "none", cursor: "pointer" }}>Book both</button>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Add to April 8</button>
                  <button style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Ask an expert</button>
                </div>
              </div>
            </div>

            {/* Photo spot — WITH match strip */}
            <div style={{ display: "flex", background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden", flexDirection: "column" }}>
              <div style={{ display: "flex", flex: 1 }}>
                <div style={{ width: 56, flexShrink: 0, background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#085041" }}>📷</div>
                <div style={{ padding: "9px 10px", flex: 1 }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>Photo spot</span>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: "#FAEEDA", color: "#633806", fontWeight: 500 }}>Trending</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, margin: "5px 0 4px" }}>Bamboo grove</div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "#0F6E56", color: "#fff", border: "none", cursor: "pointer" }}>Book shoot</button>
                    <button style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Add</button>
                  </div>
                </div>
              </div>
              {/* Match strip — photographer service */}
              <div style={{ fontSize: 10, color: "#666", borderTop: "0.5px dashed #e2e8f0", padding: "5px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>📷 matched: photographer · ¥8,000</span>
                <button style={{ fontSize: 10, padding: "3px 7px", borderRadius: 5, background: "#0F6E56", color: "#fff", border: "none", cursor: "pointer" }}>Book</button>
              </div>
            </div>

            {/* Attraction — WITH match strip */}
            <div style={{ display: "flex", background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden", flexDirection: "column" }}>
              <div style={{ display: "flex", flex: 1 }}>
                <div style={{ width: 56, flexShrink: 0, background: "#FAEEDA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#633806" }}>🎟</div>
                <div style={{ padding: "9px 10px", flex: 1 }}>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: "#FAEEDA", color: "#633806", fontWeight: 500 }}>Attraction</span>
                  <div style={{ fontSize: 13, fontWeight: 500, margin: "5px 0 4px" }}>Tenryū-ji temple</div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "#0F6E56", color: "#fff", border: "none", cursor: "pointer" }}>Book entry</button>
                    <button style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Add</button>
                  </div>
                </div>
              </div>
              {/* Match strip — local guide service */}
              <div style={{ fontSize: 10, color: "#666", borderTop: "0.5px dashed #e2e8f0", padding: "5px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>🧭 matched: local guide · ¥6,500</span>
                <button style={{ fontSize: 10, padding: "3px 7px", borderRadius: 5, background: "#0F6E56", color: "#fff", border: "none", cursor: "pointer" }}>Book</button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── TRIP COMPLEMENTS STRIP ────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
          COMPLETE YOUR KYOTO TRIP · complements any itinerary
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { icon: "👘", label: "Kimono rental", badge: "↑ for blossom season", platform: true },
            { icon: "🚖", label: "Airport transfer", badge: "Book on Traveloure", platform: true },
            { icon: "📱", label: "eSIM for travel", badge: "via Airalo", platform: false },
            { icon: "🛡", label: "Travel insurance", badge: "via SafetyWing", platform: false },
          ].map(a => (
            <div key={a.label} style={{
              flex: "1 1 130px",
              background: "#fff",
              border: "0.5px solid #e2e8f0",
              borderRadius: 10,
              padding: "10px 12px",
              cursor: "pointer",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <span style={{ fontSize: 18 }}>{a.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{a.label}</span>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, letterSpacing: "0.03em",
                background: a.platform ? "#f0fdf4" : "#eff6ff",
                color: a.platform ? "#166534" : "#1e40af",
              }}>{a.badge}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#aaa", textAlign: "center" }}>Kibune · Gion · experts continue below…</div>
    </div>
  );
}
