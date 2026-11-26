"use client";

/**
 * Next's `Link`, knowing which pages are on this device (#162; agreed design: step 4 on #160).
 * While Uniflow answers it is a plain `Link`. When it can't be reached, a link to a page that
 * isn't saved shows the **Unavailable offline** state (muted, crossed cloud, "Not available
 * offline") and doesn't navigate, so nobody lands on the offline page by surprise.
 *
 * The saved pages come from the service worker (`saved-pages?`), asked once each time the
 * connection drops.
 */

import NextLink from "next/link";
import { useEffect, useSyncExternalStore, type ComponentProps } from "react";
import { CloudOff } from "lucide-react";
import { toast } from "sonner";
import { useConnectionStatus } from "@/components/connection";
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

function pathOf(href: ComponentProps<typeof NextLink>["href"]): string | null {
  const raw = typeof href === "string" ? href : href.pathname ?? null;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw.split(/[?#]/)[0] || "/";
}

export default function Link({ className, onClick, children, href, ...props }: ComponentProps<typeof NextLink>) {
  const status = useConnectionStatus();
  const offline = status !== "online";
  const pages = useSavedPages(offline);
  const path = pathOf(href);
  const unavailable = offline && pages !== null && path !== null && !pages.has(path);
  return (
    <NextLink
      href={href}
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
