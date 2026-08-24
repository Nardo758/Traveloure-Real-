import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = readFileSync(
  path.join(artifactDir, "src", "migrations", "migration-files.ts"),
  "utf8",
);
const migrationNames = [
  ...new Set([...manifest.matchAll(/["']([^"']+\.sql)["']/g)].map((match) => match[1])),
];
const missing = migrationNames.filter(
  (name) => !existsSync(path.join(artifactDir, "dist", "migrations", name)),
);

if (missing.length > 0) {
  throw new Error(`Production bundle is missing migration assets: ${missing.join(", ")}`);
}

console.log(`Verified ${migrationNames.length} migration assets in dist/migrations.`);