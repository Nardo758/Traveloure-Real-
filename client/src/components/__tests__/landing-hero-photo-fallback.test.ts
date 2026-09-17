import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveHeroTilePhoto } from "../landing/landing-hero";

const REMOTE = "https://images.example.test/kyoto.jpg";
const FALLBACK = "/images/landing/hero-fushimi-inari.jpg";

describe("landing hero tile photo fallback", () => {
  it("uses the live API image while it is available", () => {
    assert.deepEqual(resolveHeroTilePhoto(REMOTE, false, FALLBACK), {
      src: REMOTE,
      usesFallback: false,
    });
  });

  it("uses the bundled representative image when the API has no image", () => {
    assert.deepEqual(resolveHeroTilePhoto(undefined, false, FALLBACK), {
      src: FALLBACK,
      usesFallback: true,
    });
  });

  it("switches to the bundled representative image after the remote image fails", () => {
    assert.deepEqual(resolveHeroTilePhoto(REMOTE, true, FALLBACK), {
      src: FALLBACK,
      usesFallback: true,
    });
  });

  it("keeps the gradient when no market-specific fallback exists", () => {
    assert.deepEqual(resolveHeroTilePhoto(undefined, false, undefined), {
      src: null,
      usesFallback: true,
    });
  });
});