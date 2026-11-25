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
}

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

export async function draftsFor<D>(owner: string, assignmentId: string): Promise<StoredDraft<D>[]> {
  return ((await withStore("readonly", (s) => s.index("assignment").getAll([owner, assignmentId]))) as StoredDraft<D>[] | null) ?? [];
}

/** Forget every stored draft on this device (another account signed in). */
export function deleteAllDrafts(): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve();
      const req = indexedDB.deleteDatabase(DRAFT_DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
