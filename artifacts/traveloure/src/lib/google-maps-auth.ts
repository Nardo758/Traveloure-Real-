import { useSyncExternalStore } from "react";

/**
 * Tracks Google Maps' runtime authentication hook so every Google-powered surface can
 * switch to its keyless fallback when a browser rejects the configured Maps key.
 *
 * @vis.gl/react-google-maps installs its own gm_authFailure handler after app modules
 * have evaluated. The stable accessor below keeps our notification wrapper in place while
 * retaining that handler as the inner callback.
 */
let googleMapsAuthFailed = false;
const authFailureListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  const mapWindow = window as Window & {
    __gmAuthFailureHooked?: boolean;
    gm_authFailure?: (() => void) | undefined;
  };

  if (!mapWindow.__gmAuthFailureHooked) {
    let innerHandler = typeof mapWindow.gm_authFailure === "function" ? mapWindow.gm_authFailure : undefined;
    const wrapper = () => {
      googleMapsAuthFailed = true;
      authFailureListeners.forEach((listener) => listener());
      innerHandler?.();
    };

    try {
      Object.defineProperty(mapWindow, "gm_authFailure", {
        configurable: true,
        get: () => wrapper,
        set(handler: unknown) {
          if (handler !== wrapper) innerHandler = typeof handler === "function" ? (handler as () => void) : undefined;
        },
      });
      mapWindow.__gmAuthFailureHooked = true;
    } catch {
      // A non-configurable global cannot be safely wrapped. Maps still reports its native
      // error state; the normal APIProvider onError callback remains available as a fallback.
    }
  }
}

export function useGoogleMapsAuthFailed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      authFailureListeners.add(listener);
      return () => authFailureListeners.delete(listener);
    },
    () => googleMapsAuthFailed,
    () => false,
  );
}