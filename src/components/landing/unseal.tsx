"use client";

import { useEffect, useRef } from "react";
import { motionAllowed } from "./motion";

/**
 * Wraps a sealed card. Rendered open (the final state); with motion allowed it closes on mount
 * and breaks the seal the first time it's on screen.
 */
export function Unseal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !motionAllowed()) return;
    el.dataset.sealed = "true";
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      timer = window.setTimeout(() => delete el.dataset.sealed, 350);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
