// Ledger `2026-10-18-legacy-concierge-hidden`: CI fixture databases run with the OLD done-for-you concierge's
// traveler doors SHOWN, so the specs that cover that flow (concierge-phase-a, j2-ai-entry, deprecated-route-redirects,
// stripe-connect-reminder-notification) keep covering it. Production keeps the switch off (a missing row reads off);
// an admin turns it on in /admin, audited — never a script.
//
// LOCAL DATABASES ONLY: it refuses any DATABASE_URL whose host is not localhost / 127.0.0.1 / ::1. It writes ONE
// platform_settings row and nothing else.
import { Pool } from "pg";
import { LEGACY_CONCIERGE_SETTING } from "../shared/legacy-concierge";

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
    console.error(`[ci-legacy-concierge-on] refused: DATABASE_URL host "${host || "(unparseable)"}" is not local`);
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  await pool.query(
    `INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
     VALUES ($1, 'true', 'CI fixture database: old concierge doors shown (scripts/ci-legacy-concierge-on.ts)', NOW())
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'true', updated_at = NOW()`,
    [LEGACY_CONCIERGE_SETTING],
  );
  console.log(`[ci-legacy-concierge-on] ${LEGACY_CONCIERGE_SETTING} = true (CI fixture database)`);
  await pool.end();
}

main().catch((err) => {
  console.error("[ci-legacy-concierge-on] failed:", err);
  process.exit(1);
});
