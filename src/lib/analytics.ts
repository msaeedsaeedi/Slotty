/**
 * Browser side of usage analytics (docs chapter 7, "Usage analytics").
 *
 * Events queue in memory and go to /api/events in small batches with
 * `sendBeacon`, also when the tab is hidden or closed. Nothing is sent when
 * analytics is off; with "Share usage data" off, only errors are sent. The
 * server templates the path and checks every event against the catalog.
 */
import type { ClientEvent, EventName, Feature, Flow, FlowStep } from "@/domain/analytics";

type Props<N extends EventName> = Extract<ClientEvent, { name: N }> extends { props: infer P } ? P : undefined;

const ENDPOINT = "/api/events";
const FLUSH_MS = 10_000;
const FLUSH_AT = 20;
/** Errors per page load, so a render loop can't flood the endpoint. */
const MAX_ERRORS = 10;

let config = { enabled: false, share: false };
let queue: Record<string, unknown>[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let errorsSent = 0;
let fallbackSession: string | null = null;

export function configureAnalytics(next: { enabled: boolean; share: boolean }) {
  config = next;
  if (!next.enabled) queue = [];
}

/** Random per tab (sessionStorage), so a funnel can follow one visit. Not a cookie, never sent elsewhere. */
function sessionId(): string {
  const make = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  try {
    let id = sessionStorage.getItem("uniflow.sid");
    if (!id) {
      id = make();
      sessionStorage.setItem("uniflow.sid", id);
    }
    return id;
  } catch {
    return (fallbackSession ??= make());
  }
}

export function track<N extends EventName>(name: N, ...args: Props<N> extends undefined ? [] : [Props<N>]) {
  if (typeof window === "undefined" || !config.enabled) return;
  if (!config.share && name !== "client_error") return;
  if (name === "client_error" && ++errorsSent > MAX_ERRORS) return;
  queue.push({ name, path: location.pathname, at: Date.now(), ...(args[0] ? { props: args[0] } : {}) });
  if (queue.length >= FLUSH_AT) flush();
  else timer ??= setTimeout(flush, FLUSH_MS);
}

export const trackStep = (flow: Flow, step: FlowStep) => track("funnel", { flow, step });
export const trackFeature = (feature: Feature) => track("feature", { feature });

export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const body = JSON.stringify({ sessionId: sessionId(), events: queue.splice(0, 50) });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
}
