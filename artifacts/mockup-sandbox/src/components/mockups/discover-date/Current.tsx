export function Current() {
  const gems = [
    {
      id: "1",
      name: "Fushimi Inari Trail",
      type: "Hiking",
      rating: "4.8",
      localMentions: 312,
      touristMentions: 89,
      price: "Free",
      status: "rising",
      daysUntil: 14,
      desc: "The pre-dawn climb avoids 90% of crowds. Locals start at 4:30 AM.",
      whyLocals: "Hidden viewpoint at the third torii gate — tourists stop at the second.",
    },
    {
      id: "2",
      name: "Ippodo Tea Co.",
      type: "Cafe",
      rating: "4.9",
      localMentions: 201,
      touristMentions: 44,
      price: "¥800–¥2,000",
      status: "hidden",
      daysUntil: null,
      desc: "300-year-old tea house. Free tasting of matcha grades unavailable elsewhere.",
      whyLocals: "Ask for the 'back room' — reserved for regulars who know to ask.",
    },
    {
      id: "3",
      name: "Philosopher's Path (early)",
      type: "Walk",
      rating: "4.7",
      localMentions: 188,
      touristMentions: 120,
      price: "Free",
      status: "trending",
      daysUntil: 7,
      desc: "Cherry blossom canal walk, best at 6 AM before tour groups arrive.",
      whyLocals: "The unlisted shrine halfway along is the real gem.",
    },
  ];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", minHeight: "100vh", padding: "0" }}>
      {/* Back button */}
      <div style={{ padding: "12px 16px" }}>
        <button style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#555", cursor: "pointer" }}>
          ← Back to Cities
        </button>
      </div>

      {/* HERO — dark photo overlay */}
      <div style={{ position: "relative", height: 200, margin: "0 0 16px", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #2d6a4f 0%, #1b4332 100%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 16px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#fff" }}>Kyoto</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
              <span>📍 Japan</span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>•</span>
              <span>Kansai</span>
            </div>
          </div>
          <div>
            <span style={{ background: "linear-gradient(135deg, #e11d48, #f97316)", color: "#fff", padding: "5px 12px", borderRadius: 999, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              ⚡ 88
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 14px" }}>
        {/* Stats grid — 4 cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { icon: "👥", value: "2,847", label: "Active Travelers" },
            { icon: "📈", value: "23", label: "Trending Spots" },
            { icon: "💎", value: "41", label: "Hidden Gems" },
            { icon: "💰", value: "$180", label: "Avg Hotel/Night" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Highlight card */}
        <div style={{ background: "linear-gradient(90deg, rgba(255,56,92,0.1), rgba(255,56,92,0.05))", border: "0.5px solid rgba(255,56,92,0.2)", borderRadius: 10, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>✨</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#e11d48" }}>What's Happening Now</div>
            <div style={{ fontSize: 14, marginTop: 2 }}>Cherry blossom season at peak bloom in Maruyama Park</div>
          </div>
        </div>

        {/* Vibe tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {["cultural", "zen", "foodie", "historic", "photography"].map((t) => (
            <span key={t} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: "#f1f5f9", color: "#475569", border: "0.5px solid #e2e8f0", textTransform: "capitalize" }}>{t}</span>
          ))}
        </div>

        {/* 6-tab layout */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", borderBottom: "1px solid #e2e8f0", marginBottom: 14 }}>
          {["💎 Hidden Gems", "✨ For You", "📅 Now", "⚡ Live", "🖼 Photos", "🧠 AI"].map((t, i) => (
            <div key={t} style={{
              padding: "8px 4px",
              fontSize: 10,
              textAlign: "center",
              color: i === 0 ? "#e11d48" : "#888",
              borderBottom: i === 0 ? "2px solid #e11d48" : "2px solid transparent",
              cursor: "pointer",
            }}>{t}</div>
          ))}
        </div>

        {/* Gem list — old card style */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {gems.map((gem) => (
            <div key={gem.id} style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden", display: "flex" }}>
              <div style={{ width: 100, flexShrink: 0, background: "linear-gradient(135deg, #d1fae5, #a7f3d0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                💎
              </div>
              <div style={{ padding: "12px", flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{gem.name}</div>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, border: "0.5px solid #e2e8f0", color: "#555", marginTop: 3, display: "inline-block" }}>{gem.type}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: gem.status === "hidden" ? "#dbeafe" : gem.status === "rising" ? "#fef9c3" : "#dcfce7", color: gem.status === "hidden" ? "#1e40af" : gem.status === "rising" ? "#854d0e" : "#166534" }}>
                      {gem.status === "hidden" ? "Hidden" : gem.status === "rising" ? `⬆ ${gem.daysUntil}d` : "Trending"}
                    </span>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>⭐ {gem.rating} locals</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>{gem.desc}</div>
                <div style={{ background: "#f8fafc", borderRadius: 6, padding: "6px 8px", display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <span style={{ fontSize: 16 }}>❤️</span>
                  <span style={{ fontSize: 11, color: "#555" }}>{gem.whyLocals}</span>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "#888" }}>
                  <span>👥 {gem.localMentions} local mentions</span>
                  <span>👁 {gem.touristMentions} tourist</span>
                  <span>{gem.price}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
