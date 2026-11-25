"use client";

/**
 * Connection status for the whole app (#161, agreed design: step 4 on #160).
 *
 * - `online`: the last request got an answer.
 * - `offline`: the browser has no network.
 * - `unreachable`: the browser has a network but Uniflow doesn't answer (captive portal,
 *   outage, lie-fi), or the service worker answered this page from its saved copy.
 *
 * No flicker: the browser's own offline signal counts only after 2 s without a network,
 * because it flips briefly during Wi-Fi handoffs. A failed request or a saved copy counts
 * at once. Both clear on the first request that gets an answer.
 *
 * The status is also set on the page root (`<html data-connection="…">`), so styles can
 * react to it without JavaScript.
 */

import { useSyncExternalStore } from "react";
import { toast } from "sonner";

export type ConnectionStatus = "online" | "offline" | "unreachable";

/** How long the browser must report no network before the app treats it as offline. */
export const OFFLINE_DELAY_MS = 2000;
/** How often to ask Uniflow whether it answers again. */
const PROBE_MS = 5000;

let browserOffline = false;
/** The browser has reported no network for the whole delay (set by the timer, not by comparing clocks). */
let offlineConfirmed = false;
let failed = false;
let savedCopy = false;
let status: ConnectionStatus = "online";
let started = false;
let graceTimer: ReturnType<typeof setTimeout> | undefined;
let probeTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function compute(): ConnectionStatus {
  if (failed || savedCopy) return browserOffline ? "offline" : "unreachable";
  return browserOffline && offlineConfirmed ? "offline" : "online";
}

function update() {
  const next = compute();
  if (next !== status) {
    status = next;
    document.documentElement.dataset.connection = status;
    listeners.forEach((l) => l());
  }
  if (status === "online") stopProbe();
  else startProbe();
}

/** Is the server answering? A cheap request that no cache answers. */
async function reachable() {
  try {
    return (await fetch("/health/live", { cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

function startProbe() {
  if (probeTimer) return;
  const check = async () => {
    probeTimer = undefined;
    if (status === "online") return;
    if (navigator.onLine && (await reachable())) reportReachable();
    // (If another request reached Uniflow meanwhile, the next check stops at once.)
    else probeTimer = setTimeout(check, PROBE_MS);
  };
  probeTimer = setTimeout(check, PROBE_MS);
}

function stopProbe() {
  clearTimeout(probeTimer);
  probeTimer = undefined;
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  // A page that opens without a network is a saved copy: no grace period.
  browserOffline = offlineConfirmed = !navigator.onLine;
  window.addEventListener("offline", () => {
    browserOffline = true;
    clearTimeout(graceTimer);
    graceTimer = setTimeout(() => {
      offlineConfirmed = true;
      update();
    }, OFFLINE_DELAY_MS);
    update();
  });
  window.addEventListener("online", () => {
    browserOffline = offlineConfirmed = false;
    clearTimeout(graceTimer);
    update();
    // The network is back, but is Uniflow? Ask now rather than at the next probe.
    if (failed || savedCopy) void reachable().then((ok) => ok && reportReachable());
  });
  // Ask the service worker whether it answered this page from its saved copy.
  const sw = navigator.serviceWorker;
  if (sw?.controller) {
    sw.addEventListener("message", (e: MessageEvent) => {
      if (e.data?.type === "uniflow:saved-copy" && e.data.savedCopy) {
        savedCopy = true;
        update();
      }
    });
    sw.controller.postMessage({ type: "saved-copy?" });
  }
  document.documentElement.dataset.connection = status = compute();
  if (status !== "online") startProbe();
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** A request got no answer: Uniflow counts as unreachable until one does. */
export function reportUnreachable() {
  start();
  failed = true;
  update();
}

/** A request got an answer: Uniflow can be reached (and this page is no longer just a saved copy once refreshed). */
export function reportReachable() {
  failed = false;
  savedCopy = false;
  update();
}

/** The current status, outside React (click guards). Also false-safe: no network means offline now. */
export function connectionNow(): ConnectionStatus {
  start();
  return typeof navigator !== "undefined" && !navigator.onLine ? "offline" : status;
}

/** The app's connection status (always `online` during SSR). */
export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(subscribe, () => status, () => "online");
}

/**
 * The connection for components: the status, whether this page is a saved copy (Uniflow
 * didn't answer), and whether changes can be sent now. Changes that need the network are
 * never queued, so they wait for `canSubmit`.
 */
export function useConnection() {
  const s = useConnectionStatus();
  return { status: s, online: s === "online", savedCopy: s !== "online", canSubmit: s === "online" };
}

/**
 * Call `cb` once Uniflow can be reached again. Returns a cancel function. Uses the shared
 * probe: on the browser's `online` event or a probe every few seconds (a flaky connection
 * never fires `online`).
 */
export function whenReachable(cb: () => void): () => void {
  start();
  let done = false;
  const listener = () => {
    if (done || status !== "online") return;
    done = true;
    listeners.delete(listener);
    cb();
  };
  listeners.add(listener);
  // Already reachable but asked to wait (a request just failed): probe now.
  if (status !== "online") startProbe();
  return () => {
    done = true;
    listeners.delete(listener);
  };
}

// ─── Offline policy ────────────────────────────────────────────────────────────

/** What a control needs: `network` (never queued; the default for actions) or `local` (works offline, syncs later). */
export type OfflinePolicy = "network" | "local";

export const NEEDS_CONNECTION = "Needs a connection";

/** Whether a control with this policy is blocked right now, and why. */
export function useOfflinePolicy(policy: OfflinePolicy | undefined): { blocked: boolean; reason?: string } {
  const s = useConnectionStatus();
  const blocked = policy === "network" && s !== "online";
  return blocked ? { blocked, reason: NEEDS_CONNECTION } : { blocked };
}

/**
 * For custom controls whose action needs Uniflow (not `Button`/`SubmitButton`, which do this
 * themselves): attributes for the Offline state and a guard that blocks the action with a
 * short toast instead of running it. Nothing is queued.
 */
export function useNetworkGuard() {
  const { blocked, reason } = useOfflinePolicy("network");
  const props = blocked ? ({ "aria-disabled": true, "data-offline": "blocked", title: reason } as const) : {};
  const guard =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      if (blocked || connectionNow() === "offline") {
        toast(NEEDS_CONNECTION, { id: "needs-connection" });
        return;
      }
      fn(...args);
    };
  return { blocked, props, guard };
}
