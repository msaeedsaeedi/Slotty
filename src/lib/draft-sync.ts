/**
 * Uploading marking drafts kept on this device (#163; agreed design: step 3 on #160).
 *
 * One route for every upload (`POST /api/marking/drafts`), used by the open marking sheet
 * (`syncDraft`), by `syncAllDrafts` (app open, reconnect, back on screen), and by the service
 * worker's Background Sync with Uniflow closed (src/sw, through `syncWaiting`). Page and
 * worker run this same code (#188); the worker is bundled from TypeScript.
 *
 * - One uploader at a time per draft, across tabs and the worker (Web Locks).
 * - An open marking sheet owns its assignment's drafts (it holds `sheetLock`): the others
 *   leave them alone, so a draft being typed is never uploaded behind the sheet's back.
 * - What each reply means (step 3, point 7): saved → delete the copy, unless it was edited
 *   during the upload (then it starts from the new version); conflict → keep it, with the
 *   server's marks to compare; refused → keep it as Needs attention, never retried by
 *   itself; signed out or another account → keep it and wait; network or server error →
 *   retry with growing gaps, and ask for a Background Sync.
 */
import { announceDrafts, draftsOf, openDrafts, updateDraft, type StoredDraft } from "@/lib/draft-store";

export const DRAFT_SYNC_TAG = "marking-drafts";
const UPLOAD_URL = "/api/marking/drafts";

/** The server's marks for one student, sent with a conflict (`ServerMarks`). */
export interface ServerMarks {
  status: "DRAFT" | "SUBMITTED" | "RETURNED" | "FINALIZED" | null;
  totalMarks: number | null;
  feedback: string | null;
  privateNotes: string | null;
  scores: { criterionId: string; points: number }[];
}

export type UploadReply =
  | { result: "saved"; version: string; evaluationId: string; status: NonNullable<ServerMarks["status"]>; totalMarks: number | null; bookingStatus: "BOOKED" | "COMPLETED" | "NO_SHOW" | "CANCELLED" | null; savedAt: string }
  | { result: "conflict"; version: string; server: ServerMarks }
  | { result: "refused"; message: string; field?: string }
  | { result: "signed-out" }
  | { result: "other-account" }
  | { result: "network" };

/** A conflict kept on the entry: the server's marks and the version to save on top of. */
export type StoredConflict = ServerMarks & { version: string };

/** Growing gaps between failed tries: 5 s, 10 s, 20 s … up to 10 minutes. */
export function retryDelay(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 10 * 60_000);
}

export const sheetLock = (owner: string, assignmentId: string) => `uniflow-sheet:${owner}:${assignmentId}`;
const draftLock = (key: string) => `uniflow-draft:${key}`;

function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? (locks.request(name, fn) as Promise<T>) : fn();
}

export function newChangeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * What the server's answer means (agreed step 3, point 7). Anything unexpected (a 5xx, a
 * proxy's error page, a captive portal) counts as `network`: try again later.
 */
export function readReply(status: number, body: unknown): UploadReply {
  const b = (body && typeof body === "object" ? body : null) as { result?: string } | null;
  if (status >= 200 && status < 300 && b?.result === "saved") return b as UploadReply;
  if (status === 409 && b?.result === "conflict") return b as UploadReply;
  if (status === 401) return { result: "signed-out" };
  if (status === 403 && b?.result === "other-account") return { result: "other-account" };
  if ((status === 400 || status === 413 || status === 422) && b?.result === "refused") return b as UploadReply;
  return { result: "network" };
}

/**
 * The entry after a reply, given the entry as it is now (it may have been edited during the
 * upload, which gave it a new `changeId`): the new entry, null to delete it, or undefined to
 * leave it as it is.
 */
export function afterReply(now: StoredDraft | null, uploaded: { changeId?: string }, reply: UploadReply, at = Date.now()): StoredDraft | null | undefined {
  if (!now) return undefined;
  const edited = now.changeId !== uploaded.changeId;
  switch (reply.result) {
    case "saved":
      return edited ? { ...now, version: reply.version, state: "waiting", attempts: 0, nextTry: undefined } : null;
    case "conflict":
      return { ...now, state: "conflict", server: { ...reply.server, version: reply.version } satisfies StoredConflict, message: undefined };
    case "refused":
      return edited ? undefined : { ...now, state: "error", message: reply.message };
    case "network": {
      const attempts = (now.attempts ?? 0) + 1;
      return { ...now, attempts, nextTry: at + retryDelay(attempts) };
    }
    default:
      return undefined; // signed out or another account: keep it and wait
  }
}

async function send(entry: StoredDraft): Promise<UploadReply> {
  let res: Response;
  try {
    res = await fetch(UPLOAD_URL, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: entry.owner, assignmentId: entry.assignmentId, studentId: entry.studentId, baseVersion: entry.version, changeId: entry.changeId, draft: entry.payload }),
    });
  } catch {
    return { result: "network" };
  }
  return readReply(res.status, await res.json().catch(() => null));
}

/** Record what the server said on the entry as it is now (it may have been edited meanwhile). */
async function applyReply(entry: StoredDraft, reply: UploadReply): Promise<void> {
  await updateDraft(entry.key, (now) => afterReply(now, entry, reply));
  announceDrafts({ type: "changed" });
}

/**
 * Ask the service worker to upload when the connection returns, even with Uniflow closed.
 * Pages only: inside the worker, rejecting the sync event makes the browser try again.
 */
export function requestBackgroundSync(): void {
  if (!("document" in globalThis) || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register(DRAFT_SYNC_TAG))
    .catch(() => {});
}

/**
 * Upload one entry (already written to this device) and record the reply on it. Without
 * IndexedDB the upload still happens; only the bookkeeping is skipped.
 */
export async function syncDraft(entry: StoredDraft): Promise<UploadReply> {
  return withLock(draftLock(entry.key), async () => {
    announceDrafts({ type: "syncing", key: entry.key, on: true });
    try {
      const reply = await send(entry);
      await applyReply(entry, reply);
      if (reply.result === "network") requestBackgroundSync();
      return reply;
    } finally {
      announceDrafts({ type: "syncing", key: entry.key, on: false });
    }
  });
}

/** Names of the marking sheets open in some tab (their drafts are theirs to upload). */
async function openSheets(): Promise<Set<string>> {
  try {
    const held = (await navigator.locks?.query())?.held ?? [];
    return new Set(held.map((l) => l.name ?? "").filter((n) => n.startsWith("uniflow-sheet:")));
  } catch {
    return new Set();
  }
}

/**
 * Upload every waiting draft that's due and not owned by an open sheet: this account's
 * (`owner`), or every account's unsealed drafts (the worker, which doesn't know who is signed
 * in; the server refuses a draft whose account isn't). `force`: due or not; `includeOpenSheets`:
 * those too, for signing out. Stops at the first sign that Uniflow can't take uploads now.
 * Returns how many drafts are still on this device, and whether Uniflow couldn't be reached.
 */
export async function syncWaiting({ owner, force = false, includeOpenSheets = false }: { owner?: string; force?: boolean; includeOpenSheets?: boolean } = {}): Promise<{ left: number; unreachable: boolean }> {
  const sheets = includeOpenSheets ? new Set<string>() : await openSheets();
  const entries = () => (owner ? draftsOf(owner) : openDrafts());
  let unreachable = false;
  for (const entry of await entries()) {
    if (!entry.payload || !entry.version || !entry.changeId) continue; // from before #163: the sheet handles it
    if ((entry.state ?? "waiting") !== "waiting") continue;
    if (!force && entry.nextTry && entry.nextTry > Date.now()) continue;
    if (sheets.has(sheetLock(entry.owner, entry.assignmentId))) continue;
    const reply = await syncDraft(entry);
    if (reply.result === "network") {
      unreachable = true;
      break;
    }
    if (reply.result === "signed-out" || reply.result === "other-account") break;
  }
  return { left: (await entries()).length, unreachable };
}

/** Upload this account's waiting drafts (see `syncWaiting`); returns how many are still on this device. */
export async function syncAllDrafts(owner: string, opts: { force?: boolean; includeOpenSheets?: boolean } = {}): Promise<number> {
  return (await syncWaiting({ owner, ...opts })).left;
}
