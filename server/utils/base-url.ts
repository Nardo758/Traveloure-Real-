export function getBaseUrl(): string {
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    return `https://${replitDomains.split(",")[0].trim()}`;
  }
  if (process.env.CLIENT_URL) {
    return process.env.CLIENT_URL;
  }
  return "http://localhost:5000";
}
