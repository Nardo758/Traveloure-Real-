// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`): CI fixture databases run with traveler sign-up OPEN.
//
// The traveler sign-up switch is read fail-closed (a missing row means 'waitlist'), and migration 381 seeds it
// 'waitlist' — production's launch posture. Every CI journey that registers a traveler (≈100 specs and suites)
// needs it 'open', so the shared ci-db-setup action runs this right after migrations. It writes ONE
// platform_settings row and nothing else.
//
// LOCAL DATABASES ONLY: it refuses any DATABASE_URL whose host is not localhost / 127.0.0.1 / ::1, so it can never
// open sign-up on a deployed database. Production's switch is flipped by Leon in admin, audited — never by a script.
import { Pool } from "pg";

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
    console.error(`[ci-open-traveler-signup] refused: DATABASE_URL host "${host || "(unparseable)"}" is not local`);
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  await pool.query(
    `INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
     VALUES ('traveler_signup_mode', 'open', 'CI fixture database: traveler sign-up open (scripts/ci-open-traveler-signup.ts)', NOW())
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'open', updated_at = NOW()`,
  );
  console.log("[ci-open-traveler-signup] traveler_signup_mode = open (CI fixture database)");
  await pool.end();
}

main().catch((err) => {
  console.error("[ci-open-traveler-signup] failed:", err);
  process.exit(1);
});
