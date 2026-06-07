import { useEffect, useState } from 'react';

/** Tailwind's sm: breakpoint. */
const MOBILE_BREAKPOINT = 640;

/**
 * True when the viewport is narrower than the `sm` breakpoint (640px).
 * SSR-safe — defaults to `false` (desktop) on the server, then hydrates
 * to the real value on mount.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
