// Ledger `2026-10-18-traveler-doors-hidden`: CI fixture databases run with BOTH switched traveler doors OPEN —
// `event_concierge` (the old done-for-you concierge) and `handoff_booking` ("Book this for me") — so the specs that
// cover those flows keep covering them. Production keeps both off (a missing row reads off); an admin turns them on
// in /admin, audited — never a script.
//
// LOCAL DATABASES ONLY: it refuses any DATABASE_URL whose host is not localhost / 127.0.0.1 / ::1. It writes TWO
// platform_settings rows and nothing else.
import { Pool } from "pg";
import { EVENT_CONCIERGE_SETTING, HANDOFF_BOOKING_SETTING } from "../shared/traveler-doors";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  if (!LOCAL_HOSTS.has(host)) {
    console.error(`[ci-traveler-doors-on] refused: DATABASE_URL host "${host || "(unparseable)"}" is not local`);
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  for (const key of [EVENT_CONCIERGE_SETTING, HANDOFF_BOOKING_SETTING]) {
    await pool.query(
      `INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
       VALUES ($1, 'true', 'CI fixture database: switched traveler door open (scripts/ci-traveler-doors-on.ts)', NOW())
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'true', updated_at = NOW()`,
      [key],
    );
    console.log(`[ci-traveler-doors-on] ${key} = true (CI fixture database)`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[ci-traveler-doors-on] failed:", err);
  process.exit(1);
});
