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
 * | First download of pages (#178)  | "Preparing offline 4/11", then a check for 2 s    |
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

type Progress = { done: number; total: number; finished: boolean };

/**
 * The first download of this account's pages, as the service worker reports it (#178): the
 * counts while it runs, then `finished` for 2 s. Null otherwise (later syncs are silent).
 */
function useFirstDownload(): Progress | null {
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string } & Partial<Progress>;
      if (d?.type === "uniflow:pages-progress") setProgress({ done: d.done ?? 0, total: d.total ?? 0, finished: Boolean(d.finished) });
    };
    sw.addEventListener("message", onMessage);
    return () => sw.removeEventListener("message", onMessage);
  }, []);
  useEffect(() => {
    if (!progress?.finished) return;
    const t = setTimeout(() => setProgress(null), SYNCED_MS);
    return () => clearTimeout(t);
  }, [progress]);
  return progress;
}

/** This account's drafts on the device, kept current. Nothing is read or listened to unless it marks (#179). */
function useDrafts(owner: string, marks: boolean) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [syncing, setSyncing] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!marks) return;
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
  }, [owner, marks]);
  return { entries, syncing };
}

/** `marks`: the account marks (staff), so its offline drafts are counted and badged (#179). */
export function ConnectionIndicator({ owner, renderedAt, marks }: { owner: string; renderedAt: string; marks: boolean }) {
  const status = useConnectionStatus();
  const router = useRouter();
  const { entries, syncing } = useDrafts(owner, marks);
  const download = useFirstDownload();

  // Uniflow answers again: show the server's state rather than the saved copy.
  useEffect(() => {
    if (status === "online") return;
    return whenReachable(() => router.refresh());
  }, [status, router]);

  const attention = entries.filter((e) => e.state === "error" || e.state === "conflict");
  const waiting = entries.filter((e) => e.state !== "error" && e.state !== "conflict");
  const busy = syncing.size > 0;

  // The installed app's icon counts the marks still on this device (Badging API; #163).
  const onDevice = entries.length;
  useEffect(() => {
    if (!marks) return; // nothing to count for an account that doesn't mark (#179)
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    void (onDevice ? nav.setAppBadge?.(onDevice) : nav.clearAppBadge?.())?.catch(() => {});
  }, [onDevice, marks]);

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
  // The first download shows only when nothing more important does (offline, marks).
  const quiet = !connection && !count && !busy && !showSynced;
  const preparing = quiet && download !== null && !download.finished;
  const ready = quiet && download?.finished === true;
  const visible = Boolean(connection || count || busy || showSynced || preparing || ready);

  // One sentence for screen readers per change (the download's count isn't read out each time).
  const announcement = [
    connection && `${connection}, page updated ${updated}`,
    busy && status === "online" ? "Syncing marks" : count,
    showSynced ? "All marks saved" : null,
    preparing ? "Preparing pages for offline use" : null,
    ready ? "Ready offline" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const face = (
    <span
      data-connection={status}
      data-sync={
        attention.some((e) => e.state === "conflict") ? "conflict" : attention.length ? "error" : busy ? "syncing" : waiting.length ? "saved-local" : showSynced ? "synced" : undefined
      }
      data-prepare={preparing ? "running" : ready ? "done" : undefined}
      title={connection ? `Updated ${updated}` : preparing ? `Saving ${download!.total} pages on this device so they open offline` : undefined}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground",
        attention.length > 0 && "text-warning",
        (showSynced || ready) && "text-success",
      )}
    >
      {preparing && (
        <>
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          <span className="tabular-nums">
            Preparing offline {download!.done}/{download!.total}
          </span>
        </>
      )}
      {ready && (
        <>
          <Check className="size-3.5" aria-hidden /> Ready offline
        </>
      )}
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
