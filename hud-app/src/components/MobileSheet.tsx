// ── MobileSheet: Find My-style bottom sheet with tab bar ───────────

import { useRef, useEffect, useState, type ReactNode } from "react";

// ── Snap points (fraction of vh, measured from bottom) ──
const SNAP_BAR  = 0;     // just the tab bar
const SNAP_HALF = 0.42;
const SNAP_FULL = 0.82;
const SNAPS = [SNAP_BAR, SNAP_HALF, SNAP_FULL];

function closest(v: number, pts: number[]) {
  return pts.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

export type TabId = "pings" | "esp32" | "controls";

interface Tab {
  id: TabId;
  label: string;
  icon: ReactNode;
}

const TABS: Tab[] = [
  {
    id: "pings",
    label: "Pings",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    id: "esp32",
    label: "ESP32",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
      </svg>
    ),
  },
  {
    id: "controls",
    label: "Controls",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: ReactNode;
}

export default function MobileSheet({ activeTab, onTabChange, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [snapFrac, setSnapFrac] = useState(SNAP_HALF);
  // When false, the sheet auto-fits to content (capped at SNAP_HALF).
  // Becomes true after the user drags manually, so we respect their choice.
  const userAdjustedRef = useRef(false);
  // Latest snapFrac, readable synchronously inside touch handlers.
  const snapFracRef = useRef(SNAP_HALF);
  // True while a drag is in progress, so auto-fit doesn't fight it.
  const draggingRef = useRef(false);

  useEffect(() => {
    snapFracRef.current = snapFrac;
  }, [snapFrac]);

  const applyHeight = (frac: number) => {
    sheetRef.current?.style.setProperty("--sheet-content-h", `${frac * 100}vh`);
  };

  // Auto-fit content height (capped at SNAP_HALF) whenever the content changes
  // or the active tab changes — unless the user has manually dragged.
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const fit = () => {
      if (userAdjustedRef.current || draggingRef.current) return;
      const vh = window.innerHeight;
      const contentPx = el.scrollHeight;
      const capPx = SNAP_HALF * vh;
      const fracFromContent = Math.min(contentPx, capPx) / vh;
      // Never smaller than a tiny minimum so the sheet is still grabbable
      const frac = Math.max(0.08, fracFromContent);
      setSnapFrac(frac);
      applyHeight(frac);
    };

    fit();

    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [activeTab, children]);

  // Touch drag. Attached once — reads live state through refs so we never
  // tear down / re-add listeners (which would interrupt an in-flight drag).
  useEffect(() => {
    const handle = handleRef.current;
    const sheet = sheetRef.current;
    if (!handle || !sheet) return;
    const contentEl = sheet.querySelector(".msheet-content") as HTMLElement | null;

    let startY = 0;
    let startFrac = snapFracRef.current;
    let targetFrac = startFrac; // where the finger currently is
    let rafId = 0;

    const paint = () => {
      rafId = 0;
      sheet.style.setProperty("--sheet-content-h", `${targetFrac * 100}vh`);
    };

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      startFrac = snapFracRef.current;
      targetFrac = startFrac;
      draggingRef.current = true;
      // Kill the height transition so the sheet tracks the finger 1:1.
      if (contentEl) contentEl.style.transition = "none";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      const vh = window.innerHeight;
      const dy = startY - e.touches[0].clientY; // positive = dragging up
      targetFrac = Math.min(SNAP_FULL, Math.max(SNAP_BAR, startFrac + dy / vh));
      // Coalesce updates to one per frame to avoid layout thrash.
      if (!rafId) rafId = requestAnimationFrame(paint);
      e.preventDefault(); // prevent scroll-through
    };

    const onTouchEnd = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      // Snap to where the finger actually released — no mid-animation guessing.
      const snapped = closest(targetFrac, SNAPS);
      userAdjustedRef.current = true;
      snapFracRef.current = snapped;
      setSnapFrac(snapped);
      // Restore the CSS transition so it eases into the snap point.
      if (contentEl) contentEl.style.transition = "";
      sheet.style.setProperty("--sheet-content-h", `${snapped * 100}vh`);
    };

    handle.addEventListener("touchstart", onTouchStart, { passive: false });
    handle.addEventListener("touchmove", onTouchMove, { passive: false });
    handle.addEventListener("touchend", onTouchEnd);
    handle.addEventListener("touchcancel", onTouchEnd);

    return () => {
      handle.removeEventListener("touchstart", onTouchStart);
      handle.removeEventListener("touchmove", onTouchMove);
      handle.removeEventListener("touchend", onTouchEnd);
      handle.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // On tab switch: re-enter auto-fit mode so the sheet sizes to the new content.
  const handleTabClick = (id: TabId) => {
    onTabChange(id);
    userAdjustedRef.current = false;
  };

  return (
    <div
      className="msheet"
      ref={sheetRef}
      style={{ "--sheet-content-h": `${snapFrac * 100}vh` } as React.CSSProperties}
    >
      {/* Drag handle */}
      <div className="msheet-handle" ref={handleRef}>
        <div className="msheet-handle-bar" />
      </div>

      {/* Scrollable content area */}
      <div className="msheet-content">
        <div ref={measureRef} className="msheet-measure">
          {children}
        </div>
      </div>

      {/* Tab bar — always visible */}
      <div className="msheet-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`msheet-tab${activeTab === tab.id ? " msheet-tab--active" : ""}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
