import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  // Both schema entry points must be listed so `drizzle-kit push` materializes
  // every live table. shared/schema.ts does NOT re-export guest-invites-schema.ts
  // (that file imports from schema.ts, not the reverse), so its 4 tables —
  // event_invites, guest_travel_plans, invite_templates, invite_send_log —
  // were invisible to push and would be absent on a fresh push-canonical deploy
  // (migration 001, which creates them, is bootstrap-stamped and never runs).
  schema: ["./shared/schema.ts", "./shared/guest-invites-schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
