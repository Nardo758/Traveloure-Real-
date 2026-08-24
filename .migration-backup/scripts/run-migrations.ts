import { runMigrations } from "../server/migrations/run-migrations";

runMigrations()
  .then(() => {
    console.log("[post-merge] Migrations complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[post-merge] Migrations failed:", err);
    process.exit(1);
  });
