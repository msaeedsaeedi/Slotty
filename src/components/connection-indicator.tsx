"use client";

/**
 * The one offline signifier (#161, agreed design: step 4 on #160): a small indicator next to
 * the notification bell, hidden while Uniflow answers and nothing waits.
 *
 * | Situation                       | Shows                                             |
 * | Online, nothing waiting         | nothing                                           |
 * | Offline                         | crossed cloud + "Offline" (tooltip: "Updated …") |
 * | Uniflow unreachable             | crossed cloud + "Can't connect"                   |
 * | Drafts waiting or syncing       | "3 waiting" / a spinner                           |
 * | Conflict or needs attention     | warning colour + count                            |
 * | Back online and all synced      | a check for 2 s                                   |
 *
 * Tapping it lists what is waiting or needs attention, each linking to the student's row.
 * Screen readers hear one polite announcement per change. When Uniflow answers again after
 * being unreachable, the page refreshes so it shows the server's current state.
 */

import { useEffect, useRef, useState } from "react";
import Link from "@/components/app-link";
import { useRouter } from "next/navigation";
import { Check, CloudOff, Loader2, TriangleAlert } from "lucide-react";
import { useConnectionStatus, whenReachable } from "@/components/connection";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { draftsOf, onDrafts, type StoredDraft } from "@/lib/draft-store";
import { cn } from "@/lib/utils";

const SYNCED_MS = 2000;

type Entry = Pick<StoredDraft, "key" | "state" | "message" | "label" | "href" | "at">;

function useDrafts(owner: string) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [syncing, setSyncing] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let alive = true;
    const load = () =>
      void draftsOf(owner).then((all) => {
        if (alive) setEntries(all.map(({ key, state, message, label, href, at }) => ({ key, state, message, label, href, at })));
      });
    load();
    const stop = onDrafts((e) => {
      if (e.type === "changed") load();
      else
        setSyncing((s) => {
          const next = new Set(s);
          if (e.on) next.add(e.key);
          else next.delete(e.key);
          return next;
        });
    });
    return () => {
      alive = false;
      stop();
    };
  }, [owner]);
  return { entries, syncing };
}

export function ConnectionIndicator({ owner, renderedAt }: { owner: string; renderedAt: string }) {
  const status = useConnectionStatus();
  const router = useRouter();
  const { entries, syncing } = useDrafts(owner);

  // Uniflow answers again: show the server's state rather than the saved copy.
  useEffect(() => {
    if (status === "online") return;
    return whenReachable(() => router.refresh());
  }, [status, router]);

  const attention = entries.filter((e) => e.state === "error" || e.state === "conflict");
  const waiting = entries.filter((e) => e.state !== "error" && e.state !== "conflict");
  const busy = syncing.size > 0;

  // A check for 2 s once everything that was waiting has reached Uniflow.
  const [synced, setSynced] = useState(false);
  const hadPending = useRef(false);
  const pending = waiting.length > 0 || busy;
  useEffect(() => {
    if (pending) {
      hadPending.current = true;
      return;
    }
    if (!hadPending.current || status !== "online" || attention.length) return;
    hadPending.current = false;
    const on = setTimeout(() => setSynced(true), 0);
    const off = setTimeout(() => setSynced(false), SYNCED_MS);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [pending, status, attention.length]);
  const showSynced = synced && !pending;

  const updated = new Date(renderedAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const connection = status === "offline" ? "Offline" : status === "unreachable" ? "Can't connect" : null;
  const count = attention.length ? `${attention.length} need${attention.length === 1 ? "s" : ""} attention` : waiting.length ? `${waiting.length} waiting` : null;
  const visible = Boolean(connection || count || busy || showSynced);

  // One sentence for screen readers per change.
  const announcement = [connection && `${connection}, page updated ${updated}`, busy && status === "online" ? "Syncing marks" : count, showSynced ? "All marks saved" : null].filter(Boolean).join(", ");

  const face = (
    <span
      data-connection={status}
      data-sync={
        attention.some((e) => e.state === "conflict") ? "conflict" : attention.length ? "error" : busy ? "syncing" : waiting.length ? "saved-local" : showSynced ? "synced" : undefined
      }
      title={connection ? `Updated ${updated}` : undefined}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground",
        attention.length > 0 && "text-warning",
        showSynced && "text-success",
      )}
    >
      {connection && <CloudOff className="size-3.5" aria-hidden />}
      {connection}
      {connection && count && <span aria-hidden>·</span>}
      {attention.length > 0 ? <TriangleAlert className="size-3.5" aria-hidden /> : busy && status === "online" ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
      {count}
      {showSynced && <Check className="size-3.5" aria-hidden />}
    </span>
  );

  const items = [...attention, ...waiting];
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {visible &&
        (items.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`${announcement}. Show the list`} className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {face}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>{attention.length ? "Marks that need attention or are waiting" : "Marks waiting to reach Uniflow"}</DropdownMenuLabel>
              {items.map((e) => (
                <DropdownMenuItem key={e.key} asChild disabled={!e.href}>
                  <Link href={e.href ?? "#"} className="flex flex-col items-start gap-0.5">
                    <span className="font-medium">{e.label ?? "A student"}</span>
                    <span className={cn("text-xs text-muted-foreground", e.state && e.state !== "waiting" && "text-warning")}>
                      {e.state === "conflict" ? "Changed elsewhere" : e.state === "error" ? (e.message ?? "Needs attention") : syncing.has(e.key) ? "Syncing" : "Saved on this device"}
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span aria-hidden>{face}</span>
        ))}
    </>
  );
}
