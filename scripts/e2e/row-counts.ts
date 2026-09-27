/**
 * row-counts.ts — exact count(*) for EVERY table in schema public, sorted.
 * Output: "<table> <count>" one per line, sorted by table name.
 * Used by teardown.sh to diff against the post-seed baseline (§20/R-4).
 */
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: tables } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );
    const lines: string[] = [];
    for (const { table_name } of tables) {
      const { rows } = await pool.query(`SELECT count(*)::text AS c FROM "${table_name}"`);
      lines.push(`${table_name} ${rows[0].c}`);
    }
    process.stdout.write(lines.join('\n') + '\n');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
