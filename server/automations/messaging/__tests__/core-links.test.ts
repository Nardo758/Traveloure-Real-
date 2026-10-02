import { describe, expect, it, vi } from "vitest";
import { journeyBaseUrl } from "../_core-policy";

describe("Journey email environment boundaries", () => {
  it("uses the development preview without reading the shared base URL", () => {
    const fallback = vi.fn(() => "https://published.example");
    expect(journeyBaseUrl(fallback, {
      NODE_ENV: "development", REPLIT_DEV_DOMAIN: "preview.example.replit.dev",
    })).toBe("https://preview.example.replit.dev");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("preserves production links even when a development domain exists", () => {
    expect(journeyBaseUrl(() => "https://published.example", {
      NODE_ENV: "production", REPLIT_DEV_DOMAIN: "preview.example.replit.dev",
    })).toBe("https://published.example");
  });

  it("preserves the existing fallback outside the hosted development preview", () => {
    expect(journeyBaseUrl(() => "http://localhost:5000", { NODE_ENV: "development" }))
      .toBe("http://localhost:5000");
    expect(journeyBaseUrl(() => "https://published.example", {
      REPLIT_DEV_DOMAIN: "preview.example.replit.dev",
    })).toBe("https://published.example");
  });

  it("rejects a malformed development host instead of sending unsafe links", () => {
    expect(() => journeyBaseUrl(() => "https://published.example", {
      NODE_ENV: "development", REPLIT_DEV_DOMAIN: "preview.example/redirect",
    })).toThrow("Invalid development host");
  });
});