/**
 * Unsaved marking-sheet drafts kept on this device (IndexedDB), so marks typed
 * offline survive a closed or crashed tab (#142, ADR-038).
 *
 * - Only what hasn't reached the server yet: an entry is deleted as soon as the
 *   server confirms the save.
 * - Bound to the signed-in account: entries carry the offline owner key, and
 *   `OfflineOwner` deletes the whole database when another account signs in.
 *   Signing out wipes it too (`Clear-Site-Data: "storage"`).
 * - Restoring never releases anything: a restored draft is saved as a draft.
 *
 * Every call fails soft (private windows, blocked storage): the sheet then works
 * as before, with drafts in memory only.
 */

export const DRAFT_DB = "uniflow-drafts";
const STORE = "drafts";

export interface StoredDraft<D = unknown> {
  /** `${owner}:${assignmentId}:${studentId}` */
  key: string;
  owner: string;
  assignmentId: string;
  studentId: string;
  draft: D;
  /** Fingerprint of the server's evaluation this draft was typed on top of (see `serverFingerprint`). */
  base: string;
  /** When it was last typed (ms since epoch). */
  at: number;
  /**
   * Where it stands (#161): `waiting` to reach the server, `error` (the server refused it;
   * `message` says why) or `conflict` (the saved marks changed since it was typed).
   * Missing on entries written before #161: treated as `waiting`.
   */
  state?: DraftState;
  message?: string;
  /** For the header's list: the student's name and the marking-sheet link that opens their row. */
  label?: string;
  href?: string;
}

export type DraftState = "waiting" | "error" | "conflict";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DRAFT_DB, 1);
      req.onupgradeneeded = () => {
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

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
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
  return withStore("readwrite", (s) => s.put({ ...entry, key: draftKey(entry.owner, entry.assignmentId, entry.studentId) }));
}

export function deleteDraft(owner: string, assignmentId: string, studentId: string): Promise<unknown> {
  return withStore("readwrite", (s) => s.delete(draftKey(owner, assignmentId, studentId)));
}

/** Every draft this device keeps for the account, for the header's waiting count and list. */
export async function draftsOf<D>(owner: string): Promise<StoredDraft<D>[]> {
  const all = ((await withStore("readonly", (s) => s.getAll())) as StoredDraft<D>[] | null) ?? [];
  return all.filter((d) => d.owner === owner);
}

export async function draftsFor<D>(owner: string, assignmentId: string): Promise<StoredDraft<D>[]> {
  return ((await withStore("readonly", (s) => s.index("assignment").getAll([owner, assignmentId]))) as StoredDraft<D>[] | null) ?? [];
}

/** Forget every stored draft on this device (another account signed in). */
export function deleteAllDrafts(): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve();
      const req = indexedDB.deleteDatabase(DRAFT_DB);
      req.onsuccess = req.onerror = req.onblocked = () => {
        announceDrafts({ type: "changed" });
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

// ─── Changes, across tabs ────────────────────────────────────────────────────

/**
 * `changed`: entries were written or deleted (re-read them). `syncing`: a tab started or
 * finished sending one entry to the server. Sent to this tab and, through a
 * BroadcastChannel, to every other tab of this site.
 */
export type DraftEvent = { type: "changed" } | { type: "syncing"; key: string; on: boolean };

const CHANNEL = "uniflow-drafts";
const local = typeof window !== "undefined" ? new EventTarget() : null;
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
