"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, Download, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { subscribePushAction, unsubscribePushAction } from "@/app/actions/push";
import { Button } from "@/components/ui/button";

// ─── Connectivity ─────────────────────────────────────────────────────────────

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** True while the browser reports no connection (always true during SSR). */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/**
 * Explains offline mode: the page is the last saved copy and changes are paused.
 * Changes are never queued — replaying a booking later could hit a slot that has
 * since been taken or cancelled.
 */
export function OfflineBanner({ renderedAt }: { renderedAt: string }) {
  const online = useOnline();
  if (online) return null;
  const saved = new Date(renderedAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div role="status" className="sticky top-14 z-20 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <WifiOff className="mr-1.5 inline size-4 align-text-bottom" aria-hidden />
      You&apos;re offline — showing what was saved {saved}. Booking and other changes are paused until you reconnect.
    </div>
  );
}

// ─── Service worker ──────────────────────────────────────────────────────────

const swEnabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!swEnabled || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

/** On the sign-in page: forget pages saved for whoever used this browser before. */
export function ClearSavedPages() {
  useEffect(() => {
    if (!("caches" in window)) return;
    caches.keys().then((keys) => keys.filter((k) => k.startsWith("slotty-pages-")).forEach((k) => caches.delete(k)));
  }, []);
  return null;
}

// ─── Install ─────────────────────────────────────────────────────────────────

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "slotty.install-hint.dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "Install Slotty" on the dashboard: uses the browser's install prompt where
 * available, and explains Add to Home Screen on iOS (needed there for push).
 */
export function InstallHint() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (standalone) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // Reading browser-only state after mount keeps server and client HTML identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setDismissed(readDismissed());
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (dismissed || (!prompt && !ios)) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm">
      <Download className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="flex-1 space-y-2">
        <p className="font-medium">Install Slotty on this device</p>
        <p className="text-muted-foreground">
          Open it like an app, see your demo details offline, and get reminders as notifications.
          {ios && !prompt && " On iPhone or iPad: tap the Share button, then “Add to Home Screen”."}
        </p>
        {prompt && (
          <Button
            size="sm"
            onClick={async () => {
              await prompt.prompt();
              await prompt.userChoice;
              setPrompt(null);
            }}
          >
            Install
          </Button>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-1 text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}

// ─── Push ────────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = "unsupported" | "denied" | "off" | "on" | "loading";

function usePush(publicKey: string | null) {
  const [state, setState] = useState<PushState>("loading");
  const [sub, setSub] = useState<PushSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!publicKey || !swEnabled || !("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (cancelled) return;
      setSub(existing);
      setState(existing ? "on" : "off");
    })().catch(() => setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const enable = async () => {
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const next = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey!) });
      const res = await subscribePushAction(JSON.parse(JSON.stringify(next)));
      if (!res?.ok) {
        await next.unsubscribe();
        toast.error(res?.error ?? "Couldn't turn on notifications.");
        return setState("off");
      }
      toast.success(res.message ?? "Notifications are on.");
      setSub(next);
      setState("on");
    } catch {
      toast.error("Couldn't turn on notifications on this device.");
      setState("off");
    }
  };

  const disable = async () => {
    if (!sub) return;
    setState("loading");
    await unsubscribePushAction(sub.endpoint);
    await sub.unsubscribe().catch(() => {});
    setSub(null);
    setState("off");
  };

  return { state, enable, disable };
}

/** Account page: turn push notifications on or off for this device. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const { state, enable, disable } = usePush(publicKey);
  if (state === "unsupported") {
    return <p className="text-sm text-muted-foreground">This browser can&apos;t receive notifications from Slotty. On iPhone, install Slotty to your Home Screen first.</p>;
  }
  if (state === "denied") {
    return <p className="text-sm text-muted-foreground">Notifications are blocked for Slotty in this browser&apos;s settings. Allow them there to turn this on.</p>;
  }
  return state === "on" ? (
    <Button variant="outline" size="sm" onClick={disable}>
      Turn off on this device
    </Button>
  ) : (
    <Button size="sm" onClick={enable} disabled={state === "loading"}>
      <BellRing /> Turn on for this device
    </Button>
  );
}

const PROMPT_KEY = "slotty.push-prompt.dismissed";

/**
 * Offered in context — right after a student has a booking — rather than on page
 * load, so the permission request makes sense to them.
 */
export function PushPrompt({ publicKey }: { publicKey: string | null }) {
  const { state, enable } = usePush(publicKey);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed((() => {
      try {
        return localStorage.getItem(PROMPT_KEY) === "1";
      } catch {
        return false;
      }
    })());
  }, []);
  if (dismissed || state !== "off") return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm">
      <BellRing className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="flex-1 space-y-2">
        <p>Get your demo reminders and any changes as notifications on this device?</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={enable}>
            Turn on
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDismissed(true);
              try {
                localStorage.setItem(PROMPT_KEY, "1");
              } catch {}
            }}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
