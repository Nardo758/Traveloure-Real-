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

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sessions_pkey' AND conrelid = 'sessions'::regclass
      ) THEN
        ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pkey"
          PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
      END IF;
    END;
    $$;

    CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON "sessions" ("expire");
  `);
  console.log('Sessions table ready');
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
