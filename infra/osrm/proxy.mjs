/**
 * The OSRM VM's one public door (9a-ii operator steps; ledger `2026-10-17-9a-ii-osrm-vm`).
 *
 * Replit gives a deployment one external port and a public address, so this proxy is the only thing
 * listening outside the VM. It ALLOWLISTS: exactly
 *
 *   GET /<OSRM_PATH_PREFIX>/route/v1/driving/<lng,lat>;<lng,lat>?overview=false&steps=false&alternatives=false
 *   GET /<OSRM_PATH_PREFIX>/route/v1/foot/<lng,lat>;<lng,lat>?<same>
 *
 * go to the car and foot `osrm-routed` processes on loopback (prefix stripped). Every other request —
 * /table, /match, /trip, /nearest, /tile, a bare /route, a wrong prefix, more than two coordinates, any
 * other query key or value, any method but GET — is 404 with no body. The prefix is a secret (≥32 random
 * bytes, base64url) read from the deployment's secrets; it is never logged.
 *
 * No dependencies: the VM runs `node proxy.mjs` with nothing installed.
 */
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** ≥32 bytes of base64url (no padding) is ≥43 characters. */
export const PREFIX_RE = /^[A-Za-z0-9_-]{43,}$/;

/** OSRM takes `lng,lat`; the adapter sends six decimals. The proxy still permits exactly two points,
 * even though OSRM 5.26 requires an upstream --max-viaroute-size of at least 3. */
const COORD = String.raw`-?\d{1,3}(?:\.\d{1,7})?,-?\d{1,2}(?:\.\d{1,7})?`;
const ROUTE_RE = new RegExp(String.raw`^/([^/]+)/route/v1/(driving|foot)/(${COORD};${COORD})$`);

/** The only query the adapter sends; anything else is not ours to serve. */
const ALLOWED_QUERY = { overview: "false", steps: "false", alternatives: "false" };

const UPSTREAM_TIMEOUT_MS = 10_000;

function samePrefix(given, expected) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function queryAllowed(search) {
  const params = new URLSearchParams(search);
  for (const [key, value] of params) {
    if (ALLOWED_QUERY[key] !== value) return false;
  }
  return params.size === new Set(params.keys()).size; // no repeated keys
}

/**
 * Pure: the upstream path for an allowed request, or null for everything else.
 * `rawUrl` is the request target exactly as received (path + optional query).
 */
export function resolveUpstream(method, rawUrl, prefix) {
  if (method !== "GET" || typeof rawUrl !== "string") return null;
  const q = rawUrl.indexOf("?");
  const path = q === -1 ? rawUrl : rawUrl.slice(0, q);
  const search = q === -1 ? "" : rawUrl.slice(q + 1);
  const m = ROUTE_RE.exec(path);
  if (!m || !samePrefix(m[1], prefix) || !queryAllowed(search)) return null;
  const profile = m[2];
  return { profile, path: `/route/v1/${profile}/${m[3]}${search ? `?${search}` : ""}` };
}

/** The response header carrying the extract's OSM replication timestamp (the "checked <date>" source). */
export const EXTRACT_HEADER = "x-osrm-extract";

/** Pure: the `osm_replication_timestamp=` value from EXTRACT.txt's text, or null when it states none. */
export function extractTimestamp(text) {
  const m = /^osm_replication_timestamp=(\S+)\s*$/m.exec(text ?? "");
  return m ? m[1] : null;
}

function notFound(res) {
  res.writeHead(404, { "content-length": "0" });
  res.end();
}

/**
 * @param {{ prefix: string, upstreams: { driving: number, foot: number }, upstreamHost?: string, extract?: string | null }} opts
 */
export function createProxy({ prefix, upstreams, upstreamHost = "127.0.0.1", extract = null }) {
  if (!PREFIX_RE.test(prefix ?? "")) {
    throw new Error("OSRM_PATH_PREFIX must be at least 32 random bytes, base64url (43+ characters)");
  }
  return http.createServer((req, res) => {
    const target = resolveUpstream(req.method, req.url, prefix);
    if (!target) return notFound(res);

    const upstream = http.request(
      { host: upstreamHost, port: upstreams[target.profile], path: target.path, method: "GET", timeout: UPSTREAM_TIMEOUT_MS },
      (up) => {
        const headers = { "content-type": up.headers["content-type"] ?? "application/json" };
        if (up.statusCode === 200 && extract) headers[EXTRACT_HEADER] = extract;
        res.writeHead(up.statusCode ?? 502, headers);
        up.pipe(res);
      },
    );
    upstream.on("timeout", () => upstream.destroy(new Error("upstream timeout")));
    upstream.on("error", () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { "content-length": "0" });
      res.end();
    });
    upstream.end();
  });
}

function portFromEnv(name, fallback) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new Error(`${name} must be a TCP port`);
  return n;
}

/** EXTRACT.txt's replication timestamp, or null (no header sent) when the file or the line is missing. */
function readExtract(dataDir) {
  try {
    return extractTimestamp(readFileSync(`${dataDir}/EXTRACT.txt`, "utf8"));
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = portFromEnv("PORT", 8080);
  const server = createProxy({
    prefix: process.env.OSRM_PATH_PREFIX ?? "",
    upstreams: { driving: portFromEnv("OSRM_DRIVING_PORT", 5001), foot: portFromEnv("OSRM_FOOT_PORT", 5002) },
    extract: readExtract(process.env.OSRM_DATA_DIR ?? "./data"),
  });
  server.listen(port, "0.0.0.0", () => console.log(`osrm proxy listening on :${port}`));
}
