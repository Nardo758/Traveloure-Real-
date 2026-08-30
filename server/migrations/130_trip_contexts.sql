-- Migration 130: TripContext server persistence (Trip-Strip program P2/E2).
-- Additive new table, no CHECK constraints -> no publish-time drizzle-push trap.
-- Mirrors the client sessionStorage TripContext for signed-in users so planning
-- survives browser restarts and crosses devices. Self-scoped by user_id (§14).

CREATE TABLE IF NOT EXISTS trip_contexts (
  user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  context JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);
