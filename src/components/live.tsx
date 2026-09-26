"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatLeft, formatUntil } from "@/domain/demo-day";

/**
 * Keep a live page current: re-fetch server data every `everyMs` while the tab
 * is visible, and straight away when the user comes back to it. Scroll position
 * and form input are kept (router.refresh re-renders in place).
 */
export function LiveRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, everyMs]);
  return null;
}

/**
 * "in 12 min" (mode "until") or "8 min left" (mode "left"), updated as time
 * passes. Starts from the server's `now` so the first render matches, and asks
 * for fresh data once the target time is reached (the demo started or ended).
 */
export function Countdown({ to, now, mode, className }: { to: string; now: string; mode: "until" | "left"; className?: string }) {
  const router = useRouter();
  const target = new Date(to).getTime();
  const [current, setCurrent] = useState(() => new Date(now).getTime());
  const refreshed = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => {
      const t = Date.now();
      setCurrent(t);
      if (t >= target && !refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, [router, target]);
  const ms = target - current;
  return <span className={className}>{mode === "until" ? formatUntil(ms) : formatLeft(ms)}</span>;
}
