"use client";

import { trackFeature } from "@/lib/analytics";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Download, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { subscribePushAction, unsubscribePushAction } from "@/app/actions/push";
import { Button } from "@/components/ui/button";
import { deleteAllDrafts } from "@/lib/draft-store";

// ─── Connectivity ─────────────────────────────────────────────────────────────

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** True while the browser reports a connection (always true during SSR). */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

// Saved copy: the service worker answered this page from its saved copy because the server
// was slow, unreachable or failing, even though the browser may think it's online.
let savedCopy = false;
let askedWorker = false;
const savedCopyListeners = new Set<() => void>();
const setSavedCopy = (value: boolean) => {
  if (savedCopy === value) return;
  savedCopy = value;
  savedCopyListeners.forEach((l) => l());
};

function subscribeSavedCopy(cb: () => void) {
  savedCopyListeners.add(cb);
  const sw = navigator.serviceWorker;
  if (!askedWorker && sw?.controller) {
    askedWorker = true;
    sw.addEventListener("message", (e: MessageEvent) => {
      if (e.data?.type === "uniflow:saved-copy") setSavedCopy(Boolean(e.data.savedCopy));
    });
    sw.controller.postMessage({ type: "saved-copy?" });
  }
  return () => savedCopyListeners.delete(cb);
}

/**
 * Whether Uniflow can take changes right now: the browser is online and this page isn't a
 * saved copy. Changes are never queued, so submit buttons are disabled otherwise.
 */
export function useConnection() {
  const online = useOnline();
  const saved = useSyncExternalStore(subscribeSavedCopy, () => savedCopy, () => false);
  return { online, savedCopy: saved, canSubmit: online && !saved };
}

/** Is the server answering? A cheap request that no cache answers. */
async function reachable() {
  try {
    return (await fetch("/health/live", { cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

const PROBE_MS = 5000;

/**
 * Call `cb` once Uniflow can be reached again: on the browser's `online` event, or when a
 * probe every few seconds gets an answer (a flaky connection never fires `online`).
 * Returns a cancel function.
 */
export function whenReachable(cb: () => void): () => void {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = async () => {
    clearTimeout(timer);
    if (done) return;
    if (navigator.onLine && (await reachable())) {
      if (done) return;
      done = true;
      window.removeEventListener("online", check);
      cb();
      return;
    }
    timer = setTimeout(check, PROBE_MS);
  };
  window.addEventListener("online", check);
  timer = setTimeout(check, PROBE_MS);
  return () => {
    done = true;
    clearTimeout(timer);
    window.removeEventListener("online", check);
  };
}

/**
 * Explains offline mode: the page is the last saved copy and changes are paused.
 * Changes are never queued — replaying a booking later could hit a slot that has
 * since been taken or cancelled. When Uniflow can be reached again, the page
 * refreshes itself.
 */
/**
 * The one offline signifier: a small label in the header, hidden while Uniflow answers.
 * "Offline" when the browser has no network, "Can't connect" when it has one but Uniflow
 * doesn't answer (the page is then a saved copy). The tooltip says when the page was made.
 * When Uniflow answers again, the page refreshes itself. #161 turns this into the full
 * indicator (sync counts, the panel of items that need attention).
 */
export function ConnectionIndicator({ renderedAt }: { renderedAt: string }) {
  const { online, savedCopy: copy } = useConnection();
  const router = useRouter();
  const showing = !online || copy;
  useEffect(() => {
    if (!showing) return;
    return whenReachable(() => {
      setSavedCopy(false);
      router.refresh();
    });
  }, [showing, router]);
  const updated = new Date(renderedAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  // The live region stays mounted so screen readers announce the change when it appears.
  return (
    <span role="status" className="contents">
      {showing && (
        <span title={`Updated ${updated}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground">
          <WifiOff className="size-3.5" aria-hidden />
          {online ? "Can't connect" : "Offline"}
          <span className="sr-only">, page updated {updated}</span>
        </span>
      )}
    </span>
  );
}

// ─── Saved data belongs to one account ───────────────────────────────────────

// Not cleared by sign-in: only by sign-out (Clear-Site-Data) or a different account.
const OWNER_KEY = "uniflow.offline-owner";

function clearSavedPageCaches() {
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
    let previous: string | null;
    try {
      previous = localStorage.getItem(OWNER_KEY);
    } catch {
      return;
    }
    if (previous === owner) return;
    clearSavedPageCaches();
    void deleteAllDrafts();
    try {
      localStorage.setItem(OWNER_KEY, owner);
    } catch {}
  }, [owner]);
  return null;
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
