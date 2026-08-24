function SectionLabel({ children, accent }: { children: string; accent?: boolean }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: accent ? "#0F6E56" : "#888",
      marginBottom: 10,
    }}>{children}</div>
  );
}

function OldGemCard({ name, type }: { name: string; type: string }) {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden", display: "flex" }}>
      <div style={{ width: 90, flexShrink: 0, background: "linear-gradient(135deg, #d1fae5, #a7f3d0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>💎</div>
      <div style={{ padding: "10px 12px", flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{name}</div>
        <span style={{ fontSize: 10, padding: "2px 6px", border: "0.5px solid #e2e8f0", borderRadius: 4, color: "#555" }}>{type}</span>
        <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>⭐ 4.8 by locals · Free</div>
      </div>
    </div>
  );
}

export function Gap7() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", minHeight: "100vh" }}>

      {/* ── BEFORE — old CityDetailView popup (TravelPulse tab) ── */}
      <div style={{ padding: "14px 14px 10px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 2 }}>Gap 7 — TravelPulse city popup</div>
        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
          Clicking any city card in the TravelPulse tab opens <b>CityDetailView.tsx</b>. Retiring it swaps it for the bento feed.
        </div>
      </div>

      {/* BEFORE */}
      <div style={{ padding: "0 14px 14px" }}>
        <SectionLabel>Before — CityDetailView.tsx (live today, scheduled for retirement)</SectionLabel>

        <div style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          {/* Photo hero with dark overlay */}
          <div style={{ position: "relative", height: 140, background: "linear-gradient(135deg, #2d6a4f 0%, #1b4332 100%)" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)" }} />
            <div style={{ position: "absolute", bottom: 12, left: 14, right: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Kyoto</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>📍 Japan · Kansai</div>
              </div>
              <span style={{ background: "linear-gradient(135deg, #e11d48, #f97316)", color: "#fff", padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>⚡ 88</span>
            </div>
          </div>

          {/* 4-column stats cards */}
          <div style={{ padding: "12px 12px 0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 7 }}>
            {[
              { icon: "👥", v: "2,847", l: "Travelers" },
              { icon: "📈", v: "23", l: "Trending" },
              { icon: "💎", v: "41", l: "Hidden Gems" },
              { icon: "💰", v: "$180", l: "Avg/night" },
            ].map(s => (
              <div key={s.l} style={{ border: "0.5px solid #e2e8f0", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 16, marginBottom: 3 }}>{s.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{s.v}</div>
                <div style={{ fontSize: 9, color: "#888" }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Highlight card */}
          <div style={{ margin: "10px 12px 0", background: "rgba(255,56,92,0.07)", border: "0.5px solid rgba(255,56,92,0.2)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>✨</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#e11d48" }}>What's Happening Now</div>
              <div style={{ fontSize: 12 }}>Cherry blossom season at peak bloom</div>
            </div>
          </div>

          {/* Vibe tags */}
          <div style={{ padding: "10px 12px 0", display: "flex", gap: 5, flexWrap: "wrap" }}>
            {["cultural", "zen", "foodie", "historic"].map(t => (
              <span key={t} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 999, background: "#f1f5f9", border: "0.5px solid #e2e8f0", color: "#475569" }}>{t}</span>
            ))}
          </div>

          {/* 6-tab bar */}
          <div style={{ margin: "10px 12px 0", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", borderBottom: "1px solid #e2e8f0" }}>
            {["💎 Gems", "✨ For You", "📅 Now", "⚡ Live", "🖼 Photos", "🧠 AI"].map((t, i) => (
              <div key={t} style={{
                padding: "7px 3px",
                fontSize: 9,
                textAlign: "center",
                color: i === 0 ? "#e11d48" : "#999",
                borderBottom: i === 0 ? "2px solid #e11d48" : "2px solid transparent",
              }}>{t}</div>
            ))}
          </div>

          {/* Old gem list */}
          <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <OldGemCard name="Fushimi Inari Trail" type="Hiking" />
            <OldGemCard name="Ippodo Tea Co." type="Cafe" />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", marginBottom: 14 }}>
        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
        <span style={{ fontSize: 12, color: "#0F6E56", fontWeight: 600 }}>→ retired, replaced by bento feed</span>
        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
      </div>

      {/* AFTER */}
      <div style={{ padding: "0 14px 14px" }}>
        <SectionLabel accent>After — same bento feed as /discover/location/:city</SectionLabel>

        <div style={{ background: "#fff", border: "1.5px solid #9FE1CB", borderRadius: 12, overflow: "hidden" }}>
          {/* Teal gradient hero */}
          <div style={{ background: "linear-gradient(135deg, #0F6E56 0%, #0c5a47 100%)", padding: "18px 18px", position: "relative" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#fff" }}>Kyoto</div>
            <div style={{ fontSize: 12, color: "#5DCAA5", marginTop: 3 }}>🌸 Cherry blossom season at peak bloom</div>
            <div style={{ position: "absolute", top: 14, right: 14, background: "#04342C", borderRadius: 8, padding: "6px 10px", textAlign: "center" }}>
              <b style={{ display: "block", fontSize: 15, color: "#5DCAA5" }}>88</b>
              <span style={{ fontSize: 8, color: "#5DCAA5", textTransform: "uppercase", letterSpacing: "0.07em" }}>pulse</span>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ padding: "10px 12px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["👥 2,847 here now", "🟢 Moderate crowds", "3 neighborhoods"].map(s => (
              <span key={s} style={{ fontSize: 11, padding: "5px 10px", border: "0.5px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#666" }}>{s}</span>
            ))}
          </div>

          {/* Spine chips */}
          <div style={{ padding: "10px 12px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["All gems", "Eat", "Do", "Stay", "Experts"].map((c, i) => (
              <span key={c} style={{ fontSize: 12, padding: "5px 11px", borderRadius: 999, border: i === 0 ? "none" : "0.5px solid #dde3e7", background: i === 0 ? "#E1F5EE" : "#fff", color: i === 0 ? "#085041" : "#666" }}>{c}</span>
            ))}
          </div>

          {/* Neighbourhood container preview */}
          <div style={{ margin: "10px 12px 12px", background: "#f8f9fa", border: "0.5px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#085041" }}>📍</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Arashiyama</div>
                <div style={{ fontSize: 11, color: "#0F6E56" }}>8 things to do</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              <div style={{ gridColumn: "span 2", background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>🏯 Suiran riverside ryokan <span style={{ color: "#FAEEDA", marginLeft: 4 }}>Marquee stay</span></div>
              <div style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>📷 Bamboo grove</div>
              <div style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>🎟 Tenryū-ji</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, background: "#f0fdf4", border: "0.5px solid #86efac", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#166534" }}>
          <b>Impact:</b> The TravelPulse city popup switches from the old 6-tab view to the same bento feed. Two surfaces merge into one. <code>CityDetailView.tsx</code> can then be deleted (~1,514 lines removed).
        </div>
      </div>

    </div>
  );
}
