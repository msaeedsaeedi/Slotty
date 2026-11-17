"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import type { Flow, Vital } from "@/domain/analytics";
import { configureAnalytics, flush, track, trackFeature, trackStep } from "@/lib/analytics";

const VITALS = new Set<string>(["LCP", "INP", "CLS", "FCP", "TTFB"]);

/**
 * Mounted once in the signed-in layout: page views, Core Web Vitals, uncaught
 * errors and app installs. `enabled` is false wherever ANALYTICS_SECRET is unset.
 */
export function Analytics({ enabled, share }: { enabled: boolean; share: boolean }) {
  const pathname = usePathname();
  // Configure during render so the effects below (which run after) see it.
  configureAnalytics({ enabled, share });

  useEffect(() => {
    track("page_view");
  }, [pathname]);

  useReportWebVitals((m) => {
    if (VITALS.has(m.name)) track("web_vital", { metric: m.name as Vital, value: m.value, rating: m.rating });
  });

  useEffect(() => {
    const onError = (e: ErrorEvent) => track("client_error", { kind: "error", message: String(e.message || e.error || "Unknown error") });
    const onRejection = (e: PromiseRejectionEvent) =>
      track("client_error", { kind: "rejection", message: e.reason instanceof Error ? e.reason.message : String(e.reason ?? "Unhandled rejection") });
    const onInstalled = () => trackFeature("app_installed");
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}

/** Records that a flow's first step was shown (e.g. the slot picker), once per mount. */
export function TrackView({ flow }: { flow: Flow }) {
  useEffect(() => trackStep(flow, "view"), [flow]);
  return null;
}
