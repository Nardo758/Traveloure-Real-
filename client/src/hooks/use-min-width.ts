import { useEffect, useState } from "react";

/**
 * True once the viewport is at least `px` wide. False on the server and on the first client render, so a
 * layout that reads it starts from the phone shape and widens after mount - never the other way round.
 */
export function useMinWidth(px: number): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${px}px)`);
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [px]);
  return wide;
}
