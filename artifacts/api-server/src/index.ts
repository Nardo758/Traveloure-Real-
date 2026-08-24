import app from "./app";
import { logger } from "./lib/logger";
import { createServer } from "node:http";
import { registerRoutes } from "./routes/routes";
import { setupWebSocket } from "./websocket";
import { getSession } from "./replit_integrations/auth";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  const server = createServer(app);
  setupWebSocket(server, getSession());
  await registerRoutes(server, app);

  server.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void start().catch((err) => {
  logger.error({ err }, "Unable to initialize Traveloure API");
  process.exit(1);
});
