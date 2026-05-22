/**
 * useMobile — returns true when the viewport width is ≤ breakpoint pixels.
 * Updates reactively on window resize.
 *
 * Usage:
 *   const isMobile = useMobile();        // default 768px breakpoint
 *   const isNarrow = useMobile(600);     // custom breakpoint
 */
import { useState, useEffect } from "react";

export function useMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);

  return isMobile;
}
