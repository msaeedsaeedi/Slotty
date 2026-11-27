"use client";

/**
 * One notification in the list, as a link (#174).
 *
 * Online it goes through `/notifications/{id}`, a server route that marks the item read and
 * redirects to what it's about. That's a plain `<a>`, not `<Link>`, so prefetching never
 * marks anything read.
 *
 * Offline that route can't run, and it's never a saved page, so every tap would end on the
 * offline page, even when the page it's about is on the device. Offline the item links
 * straight to that page instead, through `AppLink`: it opens if it's saved and shows
 * *Unavailable offline* if it isn't. The item isn't marked read offline; it is the next time
 * it's opened online.
 */
import type { ReactNode } from "react";
import Link from "@/components/app-link";
import { useConnectionStatus } from "@/components/connection";

export function NotificationLink({ id, target, className, children }: { id: string; target: string; className?: string; children: ReactNode }) {
  const status = useConnectionStatus();
  if (status !== "online") {
    return (
      <Link href={target} prefetch={false} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={`/notifications/${id}`} className={className}>
      {children}
    </a>
  );
}
