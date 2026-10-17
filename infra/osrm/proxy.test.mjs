/**
 * OP1–OP6 — the OSRM VM proxy allowlists (ledger `2026-10-17-9a-ii-osrm-vm`). Fake upstreams on loopback;
 * no OSRM, no network.
 *
 *   OP1  /<prefix>/route/v1/driving/… reaches the car process, prefix stripped, query kept
 *   OP2  /<prefix>/route/v1/foot/… reaches the foot process
 *   OP3  every other OSRM service, a bare /route, a wrong or missing prefix → 404, empty body, no upstream call
 *   OP4  more than two points, any other query key/value, a repeated key, a non-GET → 404
 *   OP5  a dead upstream → 502, empty body
 *   OP6  a prefix shorter than 32 bytes of base64url refuses to start
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { createProxy } from "./proxy.mjs";

const PREFIX = randomBytes(32).toString("base64url");
const COORDS = "135.778519,35.003674;135.785046,34.994856";
const QUERY = "overview=false&steps=false&alternatives=false";

const seen = { driving: [], foot: [] };
const upstreams = {};
const servers = [];
let base;

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function get(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${path}`, { method }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

before(async () => {
  for (const profile of ["driving", "foot"]) {
    const s = http.createServer((req, res) => {
      seen[profile].push(req.url);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "Ok", profile }));
    });
    upstreams[profile] = await listen(s);
    servers.push(s);
  }
  const proxy = createProxy({ prefix: PREFIX, upstreams });
  base = `http://127.0.0.1:${await listen(proxy)}`;
  servers.push(proxy);
});

after(() => servers.forEach((s) => s.close()));

test("OP1 driving reaches the car process, prefix stripped", async () => {
  const r = await get(`/${PREFIX}/route/v1/driving/${COORDS}?${QUERY}`);
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body).profile, "driving");
  assert.equal(seen.driving.at(-1), `/route/v1/driving/${COORDS}?${QUERY}`);
});

test("OP2 foot reaches the foot process", async () => {
  const r = await get(`/${PREFIX}/route/v1/foot/${COORDS}?${QUERY}`);
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body).profile, "foot");
  assert.equal(seen.foot.at(-1), `/route/v1/foot/${COORDS}?${QUERY}`);
});

test("OP3 other services, bare route, wrong prefix → 404 empty, no upstream call", async () => {
  const before = seen.driving.length + seen.foot.length;
  const wrong = PREFIX.slice(0, -1) + (PREFIX.endsWith("A") ? "B" : "A");
  for (const path of [
    `/${PREFIX}/table/v1/driving/${COORDS}`,
    `/${PREFIX}/match/v1/driving/${COORDS}`,
    `/${PREFIX}/trip/v1/driving/${COORDS}`,
    `/${PREFIX}/nearest/v1/driving/135.778519,35.003674`,
    `/${PREFIX}/tile/v1/driving/tile(1310,3166,13).mvt`,
    `/${PREFIX}/route/v1/cycling/${COORDS}`,
    `/${PREFIX}/route/v1/driving`,
    `/${PREFIX}/route`,
    `/route/v1/driving/${COORDS}`,
    `/${wrong}/route/v1/driving/${COORDS}`,
    `/${PREFIX}x/route/v1/driving/${COORDS}`,
    `/`,
    `/${PREFIX}`,
  ]) {
    const r = await get(path);
    assert.equal(r.status, 404, path);
    assert.equal(r.body, "", path);
  }
  assert.equal(seen.driving.length + seen.foot.length, before);
});

test("OP4 extra points, other query, repeated key, non-GET → 404", async () => {
  for (const path of [
    `/${PREFIX}/route/v1/driving/${COORDS};135.7,35.0?${QUERY}`,
    `/${PREFIX}/route/v1/driving/${COORDS}?overview=full`,
    `/${PREFIX}/route/v1/driving/${COORDS}?annotations=true`,
    `/${PREFIX}/route/v1/driving/${COORDS}?steps=false&steps=false`,
    `/${PREFIX}/route/v1/driving/polyline(abc)?${QUERY}`,
  ]) {
    const r = await get(path);
    assert.equal(r.status, 404, path);
    assert.equal(r.body, "", path);
  }
  for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
    const r = await get(`/${PREFIX}/route/v1/driving/${COORDS}?${QUERY}`, method);
    assert.equal(r.status, 404, method);
  }
});

test("OP5 a dead upstream → 502 empty", async () => {
  const dead = http.createServer();
  const port = await listen(dead);
  await new Promise((r) => dead.close(r));
  const proxy = createProxy({ prefix: PREFIX, upstreams: { driving: port, foot: port } });
  const p = await listen(proxy);
  try {
    const r = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${p}/${PREFIX}/route/v1/driving/${COORDS}?${QUERY}`, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }).on("error", reject);
    });
    assert.equal(r.status, 502);
    assert.equal(r.body, "");
  } finally {
    proxy.close();
  }
});

test("OP6 a short or missing prefix refuses to start", () => {
  for (const prefix of ["", "short", randomBytes(31).toString("base64url"), `${randomBytes(32).toString("base64url")}/x`]) {
    assert.throws(() => createProxy({ prefix, upstreams: { driving: 1, foot: 2 } }));
  }
});
