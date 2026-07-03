import { useState, useEffect } from 'react';

/** True auf mobilen Viewports (< breakpoint). Steuert Karten-/Sheet-Layouts. */
export function useIsMobile(breakpoint = 1024) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [breakpoint]);
  return mobile;
}
