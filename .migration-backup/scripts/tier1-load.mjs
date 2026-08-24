// Tier 1 Surface 1 load harness. Safe endpoints only (no Stripe paths).
// Usage: node scripts/tier1-load.mjs <pattern> <peakConcurrency> <durationSec> [mixRatio]
// patterns: ramp | spike | plateau | mixed
const BASE = "http://127.0.0.1:5000";
const [, , pattern = "ramp", peakArg = "300", durArg = "60", mixArg = "0"] = process.argv;
const PEAK = +peakArg, DUR = +durArg, MIX = +mixArg; // MIX = fraction of booking POSTs in mixed mode

const lat = [], errs = {}, codes = {};
let inflight = 0, done = 0, stop = false;
const t0 = Date.now();

function targetConcurrency(elapsed) {
  const f = elapsed / DUR;
  if (pattern === "ramp") return Math.ceil(PEAK * Math.min(1, f));
  if (pattern === "spike") return elapsed < 2 ? 5 : PEAK; // sudden jump
  if (pattern === "plateau") return PEAK;
  if (pattern === "mixed") return PEAK;
  return PEAK;
}

const cities = ["kyoto", "paris", "lisbon", "oaxaca", "seoul", "marrakech", "tbilisi", "hanoi"];
function pickUrl() {
  const r = Math.random();
  if (pattern === "mixed" && r < MIX) return { url: `${BASE}/api/services?limit=5&search=${cities[(Math.random()*8)|0]}`, tag: "search" };
  if (r < 0.5) return { url: `${BASE}/api/services?limit=${1 + ((Math.random()*40)|0)}`, tag: "services" };
  if (r < 0.75) return { url: `${BASE}/api/services?limit=12&search=${cities[(Math.random()*8)|0]}`, tag: "search" };
  return { url: `${BASE}/api/gems?limit=${1 + ((Math.random()*20)|0)}`, tag: "gems" };
}

async function worker() {
  while (!stop) {
    const elapsed = (Date.now() - t0) / 1000;
    if (elapsed > DUR) { stop = true; break; }
    if (inflight >= targetConcurrency(elapsed)) { await new Promise(r => setTimeout(r, 20)); continue; }
    inflight++;
    const { url, tag } = pickUrl();
    const s = performance.now();
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 30000);
      const res = await fetch(url, { signal: ctl.signal });
      clearTimeout(to);
      await res.arrayBuffer();
      const ms = performance.now() - s;
      lat.push(ms);
      codes[res.status] = (codes[res.status] || 0) + 1;
    } catch (e) {
      const k = `${tag}:${e.name || "err"}`;
      errs[k] = (errs[k] || 0) + 1;
    }
    inflight--; done++;
  }
}

// health sampler: cheap endpoint latency ≈ event-loop/queue pressure signal
const healthSamples = [];
const sampler = setInterval(async () => {
  const s = performance.now();
  try {
    const r = await fetch(`${BASE}/api/health/live`).catch(() => fetch(`${BASE}/health`));
    await r.text();
    healthSamples.push({ t: ((Date.now() - t0) / 1000) | 0, ms: +(performance.now() - s).toFixed(1), inflight, done });
  } catch { healthSamples.push({ t: ((Date.now() - t0) / 1000) | 0, ms: -1, inflight, done }); }
}, 1000);

const N_WORKERS = Math.min(PEAK, 500);
await Promise.all(Array.from({ length: N_WORKERS }, worker));
clearInterval(sampler);

lat.sort((a, b) => a - b);
const pct = p => lat.length ? +lat[Math.min(lat.length - 1, (lat.length * p) | 0)].toFixed(1) : null;
console.log(JSON.stringify({
  pattern, peak: PEAK, durationSec: DUR, completed: done,
  rps: +(done / DUR).toFixed(1),
  latencyMs: { p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: pct(0.999) },
  statusCodes: codes, errors: errs,
  healthTimeline: healthSamples.filter((_, i) => i % 5 === 0 || healthSamples[i].ms > 500),
}, null, 1));
