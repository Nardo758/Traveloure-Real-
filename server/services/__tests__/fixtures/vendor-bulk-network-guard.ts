import { vi } from "vitest";

const { blocked } = vi.hoisted(() => ({
  blocked: () => { throw new Error("Vendor proposal fixtures prohibit network access"); },
}));
vi.stubGlobal("fetch", blocked);
// Defense in depth if a future import uses a Node transport instead of fetch.
vi.mock("node:http", () => ({ request: blocked, get: blocked }));
vi.mock("node:https", () => ({ request: blocked, get: blocked }));
vi.mock("node:net", () => ({ connect: blocked, createConnection: blocked }));
vi.mock("resend", () => ({ Resend: class { constructor() { blocked(); } } }));
