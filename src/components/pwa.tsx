"use client";

import { trackFeature } from "@/lib/analytics";
import { useEffect, useState } from "react";
import { BellRing, Download, X } from "lucide-react";
import { toast } from "sonner";
import { subscribePushAction, unsubscribePushAction } from "@/app/actions/push";
import { Button } from "@/components/ui/button";
import { deleteAllDrafts } from "@/lib/draft-store";

// ─── Saved data belongs to one account ───────────────────────────────────────

// Not cleared by sign-in: only by sign-out (Clear-Site-Data) or a different account.
const OWNER_KEY = "uniflow.offline-owner";

function clearSavedPageCaches() {
  // The worker also forgets the account's list it keeps in memory.
  navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" });
  if (!("caches" in window)) return;
  caches
    .keys()
    .then((keys) => keys.filter((k) => /^(uniflow|slotty)-pages-/.test(k)).forEach((k) => caches.delete(k)))
    .catch(() => {});
}

/**
 * In every signed-in page: if this device's saved pages and marking drafts belong to
 * another account (someone else signed in without signing out first), forget them.
 * `owner` is an opaque per-account key (`offlineOwner`), never the user id.
 */
export function OfflineOwner({ owner }: { owner: string }) {
  useEffect(() => {
    let previous: string | null = null;
    try {
      previous = localStorage.getItem(OWNER_KEY);
    } catch {}
    const changed = previous !== owner;
    if (changed) {
      clearSavedPageCaches();
      void deleteAllDrafts();
      try {
        localStorage.setItem(OWNER_KEY, owner);
      } catch {}
    }
    // Load this account's pages ahead of time (#162): now (forced after a sign-in, so the day
    // starts prepared), when the app comes back to the screen and when the connection
    // returns. The worker itself waits 5 minutes between syncs unless forced.
    syncOfflinePages(changed);
    const onVisible = () => document.visibilityState === "visible" && syncOfflinePages(false);
    const onOnline = () => syncOfflinePages(false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [owner]);
  return null;
}

let preparedOnce = false;

/** Ask the service worker to sync this account's offline pages. */
function syncOfflinePages(force: boolean) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      reg.active?.postMessage({ type: "sync-pages", force });
      if (preparedOnce) return;
      preparedOnce = true;
      // Keep saved pages (and marking drafts) from being cleared when the disk runs low.
      void navigator.storage?.persist?.().catch(() => {});
      // Installed Chrome apps: refresh saved pages even when the app isn't opened (about every
      // 12 hours, when Chrome decides). A bonus: nothing relies on it.
      const periodic = (reg as ServiceWorkerRegistration & { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void> } }).periodicSync;
      if (periodic) {
        void navigator.permissions
          ?.query({ name: "periodic-background-sync" as PermissionName })
          .then((p) => (p.state === "granted" ? periodic.register("uniflow-pages", { minInterval: 12 * 60 * 60 * 1000 }) : undefined))
          .catch(() => {});
      }
    })
    .catch(() => {});
}

// ─── Service worker ──────────────────────────────────────────────────────────

const swEnabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (swEnabled) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
      return;
    }
    // Under `next dev`, remove a worker left by an earlier production run on this origin:
    // it would keep answering with its cached assets instead of the dev server's.
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(() => ("caches" in window ? caches.keys() : []))
      .then((keys) => Promise.all(keys.filter((k) => /^(uniflow|slotty)-/.test(k)).map((k) => caches.delete(k))))
      .catch(() => {});
  }, []);
  return null;
}

/**
 * On the sign-in, invite and password pages: forget pages saved for whoever used this
 * browser before. Marking drafts stay: they may be this person's unsaved work after their
 * session expired; `OfflineOwner` removes them if a different account signs in.
 */
export function ClearSavedPages() {
  useEffect(clearSavedPageCaches, []);
  return null;
}

// ─── Install ─────────────────────────────────────────────────────────────────

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Storage keys keep their pre-Uniflow names, so dismissed hints stay dismissed.
const DISMISS_KEY = "slotty.install-hint.dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "Install Uniflow" on the dashboard: uses the browser's install prompt where
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
        <p className="font-medium">Install Uniflow on this device</p>
        <p className="text-muted-foreground">
          Open it like an app, see the demo details you&apos;ve opened even offline, and get reminders as notifications.
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
      trackFeature("push_enabled");
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
    return <p className="text-sm text-muted-foreground">This browser can&apos;t receive notifications from Uniflow. On iPhone, install Uniflow to your Home Screen first.</p>;
  }
  if (state === "denied") {
    return <p className="text-sm text-muted-foreground">Notifications are blocked for Uniflow in this browser&apos;s settings. Allow them there to turn this on.</p>;
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
        <p className="text-xs text-muted-foreground">They need a connection when they&apos;re sent. For a reminder that works offline, add the demo to your calendar.</p>
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
