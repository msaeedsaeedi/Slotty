/**
 * Unsaved marking-sheet drafts kept on this device (IndexedDB), so marks typed
 * offline survive a closed or crashed tab and upload by themselves (#142, #163;
 * agreed design: step 3 on #160).
 *
 * - Only what hasn't reached the server yet: an entry is deleted as soon as the
 *   server confirms the save (`draft-sync.ts`; the service worker reads the same
 *   entries, src/sw).
 * - Writes use strict durability, so a power cut doesn't lose the last ones.
 * - Bound to the signed-in account: entries carry the offline owner key. When another
 *   account signs in, `sealDrafts` seals the earlier account's entries: hidden, never
 *   uploaded under the new account, deleted after SEALED_DRAFT_DAYS (back to normal
 *   if that account signs in again first). Signing out wipes them
 *   (`Clear-Site-Data: "storage"`), after the sign-out guard has tried to upload them.
 * - Restoring never releases anything: a restored draft is saved as a draft.
 *
 * Every call fails soft (private windows, blocked storage): the sheet then works
 * as before, with drafts in memory only.
 */
import { sealedExpired } from "@/domain/draft-upload";

export const DRAFT_DB = "uniflow-drafts";
const STORE = "drafts";

export interface StoredDraft<D = unknown> {
  /** `${owner}:${assignmentId}:${studentId}` */
  key: string;
  owner: string;
  assignmentId: string;
  studentId: string;
  draft: D;
  /**
   * Fingerprint of the server's marks this draft was typed on top of. Entries from before
   * #163 have only this (no `version`): the sheet compares it on open.
   */
  base?: string;
  /** The server's evaluation version the draft started from (`evaluationVersion`, #163). */
  version?: string;
  /** New for every edit; the server recognises a repeat of an upload it already saved. */
  changeId?: string;
  /** What the upload sends (`DraftUploadBody["draft"]`), so the service worker needn't know the sheet. */
  payload?: unknown;
  /** On a conflict: what the server has, for the sheet to show next to this draft. */
  server?: unknown;
  /** Failed uploads (network, server errors) so far, and not before when to try again. */
  attempts?: number;
  nextTry?: number;
  /** When another account signed in on this device (hidden, not uploaded; deleted after 7 days). */
  sealedAt?: number;
  /** When it was last typed (ms since epoch). */
  at: number;
  /**
   * Where it stands (#161, #163): `waiting` to reach the server, `error` (Needs attention:
   * a rule refused it, `message` says why; never retried by itself) or `conflict` (the saved
   * marks changed since it was typed; `server` has them). Missing on entries written before
   * #161: treated as `waiting`.
   */
  state?: DraftState;
  message?: string;
  /** For the header's list: the student's name and the marking-sheet link that opens their row. */
  label?: string;
  href?: string;
}

export type DraftState = "waiting" | "error" | "conflict";

/**
 * Open the drafts database. Only writing a draft creates it (`create`): reading, sealing and
 * syncing open it only if it already exists, so an account that never marks (a student, an
 * admin) never gets one on its device (#179). Aborting the first upgrade discards the new,
 * empty database.
 */
function openDb({ create = false }: { create?: boolean } = {}): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DRAFT_DB, 1);
      req.onupgradeneeded = (e) => {
        if (!create && e.oldVersion === 0) {
          req.transaction?.abort();
          return;
        }
        const store = req.result.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("assignment", ["owner", "assignmentId"]);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>, opts: { create?: boolean } = {}): Promise<T | null> {
  const db = await openDb(opts);
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      // Strict: a write is reported done only once it's on disk (Chrome's default may lose the
      // last writes on a power cut).
      const tx = db.transaction(STORE, mode, mode === "readwrite" ? { durability: "strict" } : undefined);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result ?? null);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export const draftKey = (owner: string, assignmentId: string, studentId: string) => `${owner}:${assignmentId}:${studentId}`;

export function putDraft<D>(entry: Omit<StoredDraft<D>, "key">): Promise<unknown> {
  return withStore("readwrite", (s) => s.put({ ...entry, key: draftKey(entry.owner, entry.assignmentId, entry.studentId) }), { create: true });
}

export function deleteDraft(owner: string, assignmentId: string, studentId: string): Promise<unknown> {
  return withStore("readwrite", (s) => s.delete(draftKey(owner, assignmentId, studentId)));
}

export function getDraft<D>(key: string): Promise<StoredDraft<D> | null> {
  return withStore("readonly", (s) => s.get(key)) as Promise<StoredDraft<D> | null>;
}

/**
 * Change one entry in a single transaction (read, then write or delete), so a change typed
 * in another tab meanwhile isn't overwritten: `fn` sees the entry as it is now. Returning
 * null deletes it; undefined leaves it.
 */
export async function updateDraft<D>(key: string, fn: (now: StoredDraft<D> | null) => StoredDraft<D> | null | undefined): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite", { durability: "strict" });
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const next = fn((req.result as StoredDraft<D> | undefined) ?? null);
        if (next === null) store.delete(key);
        else if (next) store.put(next);
      };
      tx.oncomplete = tx.onerror = tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/** Every draft this device keeps for the account, for the header's waiting count and list. */
export async function draftsOf<D>(owner: string): Promise<StoredDraft<D>[]> {
  const all = ((await withStore("readonly", (s) => s.getAll())) as StoredDraft<D>[] | null) ?? [];
  return all.filter((d) => d.owner === owner && !d.sealedAt);
}

/** Every account's drafts that aren't sealed (the service worker, which doesn't know who is signed in). */
export async function openDrafts<D>(): Promise<StoredDraft<D>[]> {
  const all = ((await withStore("readonly", (s) => s.getAll())) as StoredDraft<D>[] | null) ?? [];
  return all.filter((d) => !d.sealedAt);
}

export async function draftsFor<D>(owner: string, assignmentId: string): Promise<StoredDraft<D>[]> {
  const all = ((await withStore("readonly", (s) => s.index("assignment").getAll([owner, assignmentId]))) as StoredDraft<D>[] | null) ?? [];
  return all.filter((d) => !d.sealedAt);
}

/**
 * Who is signed in on this device now (agreed step 3, point 10): seal other accounts'
 * drafts, unseal this account's, and delete sealed drafts past their 7 days.
 */
export async function sealDrafts(owner: string, now = Date.now()): Promise<void> {
  const db = await openDb();
  if (!db) return;
  let changed = false;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite", { durability: "strict" });
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const d = cursor.value as StoredDraft;
        if (d.owner === owner && d.sealedAt) {
          cursor.update({ ...d, sealedAt: undefined });
          changed = true;
        } else if (d.owner !== owner && !d.sealedAt) {
          cursor.update({ ...d, sealedAt: now });
          changed = true;
        } else if (d.owner !== owner && d.sealedAt && sealedExpired(d.sealedAt, now)) {
          cursor.delete();
          changed = true;
        }
        cursor.continue();
      };
      tx.oncomplete = tx.onerror = tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
  if (changed) announceDrafts({ type: "changed" });
}

// ─── Changes, across tabs ────────────────────────────────────────────────────

/**
 * `changed`: entries were written or deleted (re-read them). `syncing`: a tab started or
 * finished sending one entry to the server. Sent to this tab and, through a
 * BroadcastChannel, to every other tab of this site.
 */
export type DraftEvent = { type: "changed" } | { type: "syncing"; key: string; on: boolean };

const CHANNEL = "uniflow-drafts";
// In pages and in the service worker alike (#188): an EventTarget for this context's listeners.
const local = typeof EventTarget !== "undefined" ? new EventTarget() : null;
let channel: BroadcastChannel | null = null;
function bus(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => local?.dispatchEvent(new CustomEvent("draft", { detail: e.data }));
  } catch {}
  return channel;
}

export function announceDrafts(event: DraftEvent) {
  local?.dispatchEvent(new CustomEvent("draft", { detail: event }));
  try {
    bus()?.postMessage(event);
  } catch {}
}

export function onDrafts(cb: (event: DraftEvent) => void): () => void {
  bus();
  const listener = (e: Event) => cb((e as CustomEvent<DraftEvent>).detail);
  local?.addEventListener("draft", listener);
  return () => local?.removeEventListener("draft", listener);
}
