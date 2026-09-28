#!/usr/bin/env node
/**
 * probe-ticketmaster-coverage.cjs — READ-ONLY. How many Ticketmaster events fall in each operating
 * city over the next 180 days? (Ledger `2026-09-28-city-events`: Ticketmaster is NOT wired as a
 * `city_events` source; this script exists so the decision-maker can see coverage before
 * deciding.)
 *
 * It writes nothing — no database, no file — and makes one Discovery API search per city
 * (`size=1`, reading only `page.totalElements`). The cities, their coordinates and country codes
 * are read from shared/operating-markets.ts, never retyped here (§13: no second city list).
 * Each city is searched by its coordinates within RADIUS_KM, because a market name is not always
 * a city (Goa is a state).
 *
 * The key comes from the operator in TICKETMASTER_API_KEY; the script refuses to run without it
 * and never prints it. PredictHQ is not a source for this strip (its terms forbid public
 * display) and is not queried.
 *
 * Usage: TICKETMASTER_API_KEY=… node scripts/probe-ticketmaster-coverage.cjs [--days 180] [--radius 30]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const API = "https://app.ticketmaster.com/discovery/v2/events.json";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}

/** The operating markets, parsed from the shared TS source (the one list). */
function readMarkets() {
  const src = fs.readFileSync(path.join(ROOT, "shared/operating-markets.ts"), "utf8");
  const out = [];
  const block = /\{\s*cityName:\s*'([^']+)'[\s\S]*?marketKey:\s*'([^']+)'[\s\S]*?lat:\s*([-\d.]+)[\s\S]*?lng:\s*([-\d.]+)[\s\S]*?countryCode:\s*'([A-Z]{2})'/g;
  let m;
  while ((m = block.exec(src))) out.push({ city: m[1], marketKey: m[2], lat: Number(m[3]), lng: Number(m[4]), countryCode: m[5] });
  return out;
}

function isoNoMs(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function main() {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key || !key.trim()) {
    console.error("probe-ticketmaster-coverage: TICKETMASTER_API_KEY is not set. Refusing to run.");
    console.error("The key comes from the operator; nothing here supplies or stores one.");
    process.exit(2);
  }
  const days = arg("--days", 180);
  const radius = arg("--radius", 30);
  const markets = readMarkets();
  if (markets.length === 0) {
    console.error("probe-ticketmaster-coverage: could not read any market from shared/operating-markets.ts — update the parser.");
    process.exit(1);
  }
  const start = new Date();
  const end = new Date(start.getTime() + days * 86_400_000);
  console.log(`Ticketmaster events in the next ${days} days, within ${radius} km of each city centre (read-only):`);
  let failures = 0;
  for (const mkt of markets) {
    const url = new URL(API);
    url.searchParams.set("apikey", key);
    url.searchParams.set("latlong", `${mkt.lat},${mkt.lng}`);
    url.searchParams.set("radius", String(radius));
    url.searchParams.set("unit", "km");
    url.searchParams.set("countryCode", mkt.countryCode);
    url.searchParams.set("startDateTime", isoNoMs(start));
    url.searchParams.set("endDateTime", isoNoMs(end));
    url.searchParams.set("size", "1");
    try {
      const res = await fetch(url);
      if (!res.ok) {
        failures += 1;
        console.log(`  ${mkt.city.padEnd(10)} error HTTP ${res.status}`);
        continue;
      }
      const body = await res.json();
      const total = body && body.page && typeof body.page.totalElements === "number" ? body.page.totalElements : null;
      console.log(`  ${mkt.city.padEnd(10)} ${total === null ? "no count returned" : total}`);
    } catch (e) {
      failures += 1;
      console.log(`  ${mkt.city.padEnd(10)} error ${e && e.message ? e.message : e}`);
    }
    // Stay well under the Discovery API's 5 requests/second.
    await new Promise((r) => setTimeout(r, 300));
  }
  process.exit(failures === markets.length ? 1 : 0);
}

if (require.main === module) main();
module.exports = { readMarkets };
