import { useRef, useEffect, useState, useCallback } from "react";

const MOBILE_BREAKPOINT = 700;

/** Snap points as fractions of viewport height (from bottom). */
const SNAP_PEEK = 0.055; // handle + title peeking
const SNAP_HALF = 0.45;
const SNAP_FULL = 0.85;
const SNAPS = [SNAP_PEEK, SNAP_HALF, SNAP_FULL];

function closest(val: number, pts: number[]) {
  return pts.reduce((a, b) => (Math.abs(b - val) < Math.abs(a - val) ? b : a));
}

/**
 * Enables mobile-only bottom-sheet drag on a container ref.
 * Returns { sheetRef, handleRef, heightPx, isMobile }.
 * On desktop (>700 px) this hook is inert.
 */
export function useBottomSheet() {
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT
  );
  const [snapFrac, setSnapFrac] = useState(SNAP_PEEK);

  // Track viewport resize
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Touch drag logic — only on mobile
  useEffect(() => {
    if (!isMobile) return;
    const handle = handleRef.current;
    const sheet = sheetRef.current;
    if (!handle || !sheet) return;

    let startY = 0;
    let startFrac = snapFrac;
    const vh = window.innerHeight;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      startFrac = snapFrac;
      sheet.style.transition = "none";
    };

    const onTouchMove = (e: TouchEvent) => {
      const dy = startY - e.touches[0].clientY; // positive = dragging up
      const newFrac = Math.min(SNAP_FULL, Math.max(SNAP_PEEK, startFrac + dy / vh));
      sheet.style.height = `${newFrac * 100}vh`;
      e.preventDefault(); // prevent scroll-through
    };

    const onTouchEnd = () => {
      const current = sheet.getBoundingClientRect().height / vh;
      const snapped = closest(current, SNAPS);
      setSnapFrac(snapped);
      sheet.style.transition = "height 0.3s ease";
      sheet.style.height = `${snapped * 100}vh`;
    };

    handle.addEventListener("touchstart", onTouchStart, { passive: false });
    handle.addEventListener("touchmove", onTouchMove, { passive: false });
    handle.addEventListener("touchend", onTouchEnd);

    return () => {
      handle.removeEventListener("touchstart", onTouchStart);
      handle.removeEventListener("touchmove", onTouchMove);
      handle.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile, snapFrac]);

  const heightPx = isMobile ? `${snapFrac * 100}vh` : undefined;

  const toggleSheet = useCallback(() => {
    if (!isMobile) return;
    setSnapFrac((prev) => (prev > SNAP_PEEK ? SNAP_PEEK : SNAP_HALF));
  }, [isMobile]);

  return { sheetRef, handleRef, heightPx, isMobile, toggleSheet };
}
