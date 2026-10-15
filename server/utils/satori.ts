/**
 * CP-1 PR 3 (ledger `2026-10-15-cp1-share-image-bundle`) — the ONE way the server loads `satori`.
 *
 * `satori` is an ESM-only package that the production build leaves EXTERNAL (`script/build.ts`), so
 * the CommonJS bundle loads it with `require()` and wraps it in esbuild's interop helper. With
 * `import satori from "satori"` that wrapper made `satori` the module namespace `{ default, init }`
 * instead of the render function, so EVERY share image on the production build answered 500
 * (`(0, d$e.default) is not a function`) while every test — which runs the TypeScript source, where
 * the default import resolves normally — stayed green.
 *
 * Reading the namespace and taking the first function in it works in both shapes: under the source
 * runtime `ns.default` is the function; under the bundle it is `ns.default.default`.
 */
import * as satoriNamespace from "satori";

type SatoriFn = typeof import("satori").default;

function resolveSatori(ns: any): SatoriFn {
  if (typeof ns === "function") return ns;
  if (typeof ns?.default === "function") return ns.default;
  if (typeof ns?.default?.default === "function") return ns.default.default;
  throw new Error("satori: no render function found in the loaded module");
}

export const satori: SatoriFn = resolveSatori(satoriNamespace);

/** Exported for the unit test only. */
export const _resolveSatoriForTest = resolveSatori;
