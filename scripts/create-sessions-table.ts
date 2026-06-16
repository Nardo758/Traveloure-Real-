import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
    CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON "sessions" ("expire");
  `);
  console.log('Sessions table ready');
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
