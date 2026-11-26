"use client";

import { useConnectionStatus } from "@/components/connection";
import { cn } from "@/lib/utils";

/**
 * Freshness for values that go stale quickly (free places, the waitlist; #162, agreed design:
 * step 4 on #160). Nothing while Uniflow answers; on a saved copy, "updated 10:42" (with the
 * day if it wasn't today), from when the server made the page.
 */
export function UpdatedAt({ at, className, prefix = " · " }: { at: string | Date; className?: string; prefix?: string }) {
  const status = useConnectionStatus();
  if (status === "online") return null;
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  const when = d.toLocaleString(undefined, sameDay ? { hour: "2-digit", minute: "2-digit" } : { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <span data-fresh={d.toISOString()} className={cn("text-xs text-muted-foreground", className)}>
      {prefix}updated {when}
    </span>
  );
}
