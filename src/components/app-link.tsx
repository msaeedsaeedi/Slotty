"use client";

/**
 * Next's `Link`, knowing which pages are on this device (#162; agreed design: step 4 on #160).
 * While Uniflow answers it is a plain `Link`. When it can't be reached, a link to a page that
 * isn't saved shows the **Unavailable offline** state (muted, crossed cloud, "Not available
 * offline") and doesn't navigate, so nobody lands on the offline page by surprise.
 *
 * The saved pages come from the service worker (`saved-pages?`), asked once each time the
 * connection drops. Which saved page an address opens is `savedPageKey` (src/lib/offline-urls.ts,
 * #173), the worker's own rule: relative links (`?reschedule=1`) are resolved against the current
 * page, and a query that changes the content (`?day=`, `?scope=`) is a page that isn't saved.
 *
 * `offlineFallback` (#175): pages to go to instead when this one isn't saved, first saved one
 * wins. A TA's way back from a student, or into a course, then lands on a saved page (the
 * marking sheet, the course's Today page) instead of a dead end. Online it changes nothing.
 */

import NextLink from "next/link";
import { useEffect, useSyncExternalStore, type ComponentProps } from "react";
import { CloudOff } from "lucide-react";
import { toast } from "sonner";
import { useConnectionStatus } from "@/components/connection";
import { savedPageKey } from "@/lib/offline-urls";
import { cn } from "@/lib/utils";

const NOT_AVAILABLE = "Not available offline";

let saved: ReadonlySet<string> | null = null;
let asking = false;
const listeners = new Set<() => void>();

function askWorker() {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (asking || !sw?.controller) return;
  asking = true;
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type !== "uniflow:saved-pages") return;
    sw.removeEventListener("message", onMessage);
    asking = false;
    saved = new Set<string>(e.data.paths);
    listeners.forEach((l) => l());
  };
  sw.addEventListener("message", onMessage);
  sw.controller.postMessage({ type: "saved-pages?" });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The paths saved on this device, or null if unknown (no service worker: nothing is blocked). */
function useSavedPages(active: boolean) {
  useEffect(() => {
    if (active) askWorker();
  }, [active]);
  return useSyncExternalStore(subscribe, () => saved, () => null);
}

type Href = ComponentProps<typeof NextLink>["href"];

/**
 * Whether a link leads to a page that isn't on this device: false for other sites, for links
 * to the page already open (`#section`, `?` with nothing), and when it's a saved page.
 */
function notSaved(href: Href, pages: ReadonlySet<string>): boolean {
  const here = new URL(window.location.href);
  let target: URL;
  try {
    if (typeof href === "string") target = new URL(href, here);
    else {
      target = new URL(href.pathname ?? here.pathname, here);
      if (href.query && typeof href.query === "object") {
        target.search = "";
        for (const [k, v] of Object.entries(href.query)) for (const one of ([] as unknown[]).concat(v)) if (one != null) target.searchParams.append(k, String(one));
      } else if (href.search) target.search = href.search;
    }
  } catch {
    return false;
  }
  if (target.origin !== here.origin) return false;
  if (target.pathname === here.pathname && target.search === here.search) return false;
  const key = savedPageKey(target);
  return key === null || !pages.has(key);
}

export default function Link({ className, onClick, children, href, offlineFallback, ...props }: ComponentProps<typeof NextLink> & { offlineFallback?: string | readonly string[] }) {
  const status = useConnectionStatus();
  const offline = status !== "online";
  const pages = useSavedPages(offline);
  let target: Href = href;
  let unavailable = false;
  if (offline && pages !== null && notSaved(href, pages)) {
    const alternative = ([] as string[]).concat(offlineFallback ?? []).find((f) => !notSaved(f, pages));
    if (alternative) target = alternative;
    else unavailable = true;
  }
  return (
    <NextLink
      href={target}
      {...props}
      data-offline={unavailable ? "unavailable" : undefined}
      aria-disabled={unavailable || undefined}
      title={unavailable ? NOT_AVAILABLE : props.title}
      className={cn(className, unavailable && "cursor-not-allowed text-offline")}
      onClick={(e) => {
        if (unavailable) {
          e.preventDefault();
          toast(NOT_AVAILABLE, { id: "not-available-offline" });
          return;
        }
        onClick?.(e);
      }}
    >
      {children}
      {unavailable && (
        <>
          <CloudOff className="ml-1 inline size-3 align-[-0.125em]" aria-hidden />
          <span className="sr-only">, {NOT_AVAILABLE.toLowerCase()}</span>
        </>
      )}
    </NextLink>
  );
}
