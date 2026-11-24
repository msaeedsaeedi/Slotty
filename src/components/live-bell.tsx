"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

/** How often the badge checks for new notifications while the tab is visible. */
export const BELL_POLL_MS = 30_000;
/**
 * Pages that show notification-driven data without forms, so they reload their data when
 * something new arrives. Everywhere else only the badge changes, so nothing moves under
 * someone who is typing.
 */
const REFRESH_ON_NEW = [/^\/notifications$/, /^\/dashboard$/, /^\/bookings$/];

/**
 * The header's notification bell. Starts from the server's count, then checks
 * `/api/notifications/unread` every 30 seconds while the tab is visible, straight away when
 * the tab comes back, and when a push arrives (the service worker posts `uniflow:push`; workers from before the rename post `slotty:push`, #138).
 */
export function LiveBell({ initial }: { initial: number }) {
  const router = useRouter();
  const pathname = usePathname();
  // A polled count is shown until the next server render (navigation, refresh, Server Action)
  // brings a fresher `initial`.
  const [polled, setPolled] = useState<{ count: number; base: number } | null>(null);
  const count = polled && polled.base === initial ? polled.count : initial;
  const base = useRef(initial);
  const last = useRef(initial);
  const stopped = useRef(false);
  useEffect(() => {
    base.current = initial;
    last.current = initial;
  }, [initial]);

  const check = useCallback(async () => {
    if (stopped.current || document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/notifications/unread", { cache: "no-store" });
      if (res.status === 401) {
        stopped.current = true; // signed out elsewhere; the next navigation goes to /login
        return;
      }
      if (!res.ok) return;
      const { count: next } = (await res.json()) as { count: number };
      if (next > last.current && REFRESH_ON_NEW.some((re) => re.test(pathname))) router.refresh();
      last.current = next;
      setPolled({ count: next, base: base.current });
    } catch {
      // Offline or a blip: try again on the next tick.
    }
  }, [pathname, router]);

  useEffect(() => {
    const timer = setInterval(check, BELL_POLL_MS);
    const onVisible = () => void check();
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "uniflow:push" || e.data?.type === "slotty:push") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [check]);

  return (
    <Button asChild variant="ghost" size="icon" aria-label={`Notifications (${count} unread)`} className="relative">
      <Link href="/notifications">
        <Bell />
        {count > 0 && (
          <span
            data-testid="bell-count"
            className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
