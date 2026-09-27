-- row-counts.sql — exact count(*) for every table in schema public.
-- Generates and runs one count query per table via a DO block, printing
-- "<table> <count>" per NOTICE line (psql: run with `-q` and grep NOTICE,
-- or prefer `npx tsx scripts/e2e/row-counts.ts` for clean stdout).
DO $$
DECLARE
  r RECORD;
  cnt BIGINT;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', r.table_name) INTO cnt;
    RAISE NOTICE '% %', r.table_name, cnt;
  END LOOP;
END $$;
