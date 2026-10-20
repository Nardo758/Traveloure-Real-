/**
 * First import for the LC-1 render tests. Node has no `window`, and `/experts` reads
 * `window.location.search` while the provider initializes. Not a test file.
 */
import "../../components/__tests__/node-navigator";

// framer-motion's SSR path checks `instanceof SVGElement`. Node has neither constructor.
if (typeof (globalThis as any).Element === "undefined") {
  (globalThis as any).Element = class Element {};
}
if (typeof (globalThis as any).HTMLElement === "undefined") {
  (globalThis as any).HTMLElement = class HTMLElement extends (globalThis as any).Element {};
}
if (typeof (globalThis as any).SVGElement === "undefined") {
  (globalThis as any).SVGElement = class SVGElement extends (globalThis as any).Element {};
}

const memory = new Map<string, string>();
const storage = {
  getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
};

if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = {
    location: { search: "", href: "http://localhost/experts", pathname: "/experts", hash: "" },
    sessionStorage: storage,
    localStorage: storage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
    navigator: (globalThis as any).navigator,
  };
}

export {};
