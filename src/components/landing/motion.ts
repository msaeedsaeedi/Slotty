"use client";

import { useEffect } from "react";

/** True when JavaScript has opted the page into motion and the visitor allows it. */
export function motionAllowed(): boolean {
  return (
    typeof window !== "undefined" &&
    document.documentElement.hasAttribute("data-lp-js") &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Marks <html> with data-lp-js while the landing page is mounted, after hydration (changing
 * <html> before React hydrates it is a mismatch). Motion in landing.css applies only under it.
 */
export function MotionFlag() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-lp-js", "");
    return () => root.removeAttribute("data-lp-js");
  }, []);
  return null;
}
