import type { Express } from "express";
import { setupAuth, registerAuthRoutes, setupFacebookAuth, setupEmailAuth } from "../replit_integrations/auth";
import { registerChatRoutes } from "../replit_integrations/chat/routes";

export async function registerAuthDomain(app: Express): Promise<void> {
  try {
    await setupAuth(app);
    registerAuthRoutes(app);
    setupFacebookAuth(app);
    setupEmailAuth(app);
  } catch (error) {
    console.warn("Auth setup failed (OK for development):", (error as Error).message);
  }
  registerChatRoutes(app);
}
