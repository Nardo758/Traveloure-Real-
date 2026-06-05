export function Current() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", minHeight: "100vh", padding: "12px 14px" }}>

      {/* HERO — dark teal gradient, white text, dark pulse box */}
      <div style={{
        background: "linear-gradient(135deg, #0F6E56 0%, #0c5a47 100%)",
        borderRadius: 14,
        padding: "22px 24px",
        marginBottom: 14,
        position: "relative",
        overflow: "hidden",
      }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.15, letterSpacing: "-0.01em" }}>Kyoto</h1>
        <div style={{ fontSize: 13, color: "#5DCAA5", marginTop: 4 }}>
          🌸 Cherry blossom season at peak bloom in Maruyama Park
        </div>
        {/* Pulse badge — dark box, top-right */}
        <div style={{
          position: "absolute",
          top: 18,
          right: 18,
          background: "#04342C",
          borderRadius: 10,
          padding: "7px 13px",
          textAlign: "center",
        }}>
          <b style={{ display: "block", fontSize: 18, fontWeight: 700, color: "#5DCAA5", lineHeight: 1.1 }}>88</b>
          <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5DCAA5" }}>pulse</span>
        </div>
      </div>

      {/* STATS ROW — bordered pill chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {[
          "👥 2,847 travelers here now",
          "🟢 Moderate crowds",
          "12 services",
          "3 neighborhoods",
        ].map((s) => (
          <div key={s} style={{
            background: "#fff",
            border: "0.5px solid #e2e8f0",
            borderRadius: 10,
            padding: "7px 13px",
            fontSize: 12,
            color: "#666",
          }}>{s}</div>
        ))}
      </div>

      {/* SPINE FILTER CHIPS — same as reference */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
        {["All gems", "Eat", "Do", "Stay", "Services", "Experts", "Events", "Photo spots", "Vibe"].map((c, i) => (
          <span key={c} style={{
            fontSize: 13,
            padding: "6px 13px",
            borderRadius: 999,
            border: i === 0 ? "none" : "0.5px solid #dde3e7",
            background: i === 0 ? "#E1F5EE" : "#fff",
            color: i === 0 ? "#085041" : "#666",
            cursor: "pointer",
          }}>{c}</span>
        ))}
      </div>

      {/* NEIGHBORHOOD CONTAINER — same bento layout as reference */}
      <div style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "12px 15px", display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#085041", flexShrink: 0 }}>📍</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Arashiyama</span>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "#F1EFE8", color: "#444441", fontWeight: 500 }}>Neighborhood</span>
            </div>
            <div style={{ fontSize: 12, color: "#0F6E56", marginTop: 2 }}>Trending · 8 things to do</div>
          </div>
          {/* Two CTAs below header — current layout */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
            <button style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Explore Arashiyama</button>
            <button style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>+ Add a day</button>
          </div>
        </div>

        <div style={{ background: "#f8f9fa", borderTop: "0.5px solid #e2e8f0", padding: "13px 14px" }}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>In Arashiyama</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>

            {/* Marquee stay */}
            <div style={{ gridColumn: "span 2", display: "flex", background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ width: 68, flexShrink: 0, background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#0C447C" }}>🏯</div>
              <div style={{ padding: "10px 12px", flex: 1 }}>
                <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "#FAEEDA", color: "#633806", fontWeight: 500 }}>Marquee stay</span>
                <div style={{ fontSize: 14, fontWeight: 500, margin: "5px 0 6px" }}>Suiran riverside ryokan</div>
                <div style={{ fontSize: 11, color: "#666", borderTop: "0.5px dashed #e2e8f0", paddingTop: 6, marginBottom: 7, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>🚗 matched: private car · ¥9,000</span>
                  <button style={{ fontSize: 11, padding: "4px 9px", borderRadius: 6, background: "#0F6E56", color: "#fff", border: "none", cursor: "pointer" }}>Book both</button>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {/* Generic "Add" — no date */}
                  <button style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Add</button>
                  <button style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>💬 Ask</button>
                </div>
              </div>
            </div>

            {/* Photo spot */}
            <div style={{ display: "flex", background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ width: 56, flexShrink: 0, background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#085041" }}>📷</div>
              <div style={{ padding: "9px 10px", flex: 1 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>Photo spot</span>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: "#FAEEDA", color: "#633806", fontWeight: 500 }}>Trending</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, margin: "5px 0 6px" }}>Bamboo grove</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "#0F6E56", color: "#fff", border: "none", cursor: "pointer" }}>Book shoot</button>
                  <button style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Add</button>
                </div>
              </div>
            </div>

            {/* Attraction */}
            <div style={{ display: "flex", background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ width: 56, flexShrink: 0, background: "#FAEEDA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#633806" }}>🎟</div>
              <div style={{ padding: "9px 10px", flex: 1 }}>
                <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: "#FAEEDA", color: "#633806", fontWeight: 500 }}>Attraction</span>
                <div style={{ fontSize: 13, fontWeight: 500, margin: "5px 0 6px" }}>Tenryū-ji temple</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "#0F6E56", color: "#fff", border: "none", cursor: "pointer" }}>Book entry</button>
                  <button style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Add</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#aaa", textAlign: "center" }}>Kibune · Gion · experts · complements continue below…</div>
    </div>
  );
}
