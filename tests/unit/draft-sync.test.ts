import { describe, expect, it } from "vitest";
import type { StoredDraft } from "@/lib/draft-store";
import { afterReply, readReply, retryDelay, type UploadReply } from "@/lib/draft-sync";

// The reply handling shared by the marking sheet and the service worker (#163, #188; agreed
// design: step 3, point 7 on #160).

const saved: UploadReply = { result: "saved", version: "v2", evaluationId: "e", status: "DRAFT", totalMarks: 5, bookingStatus: "COMPLETED", savedAt: "2026-12-01T09:00:00Z" };

describe("readReply: what the server's answer means", () => {
  it("reads the route's own answers", () => {
    expect(readReply(200, saved)).toEqual(saved);
    expect(readReply(409, { result: "conflict", version: "v3", server: {} }).result).toBe("conflict");
    expect(readReply(422, { result: "refused", message: "No-show" })).toEqual({ result: "refused", message: "No-show" });
    expect(readReply(400, { result: "refused", message: "Unreadable" }).result).toBe("refused");
    expect(readReply(401, { result: "signed-out" })).toEqual({ result: "signed-out" });
    expect(readReply(401, null)).toEqual({ result: "signed-out" });
    expect(readReply(403, { result: "other-account" })).toEqual({ result: "other-account" });
  });

  it("treats anything else as try-again-later, never as saved or refused", () => {
    expect(readReply(500, { result: "error" })).toEqual({ result: "network" });
    expect(readReply(502, null)).toEqual({ result: "network" }); // a proxy's error page
    expect(readReply(200, null)).toEqual({ result: "network" }); // a captive portal's 200
    expect(readReply(403, { result: "forbidden" })).toEqual({ result: "network" });
    expect(readReply(422, { message: "no result" })).toEqual({ result: "network" });
  });
});

describe("afterReply: the entry after a reply", () => {
  const entry: StoredDraft = { key: "k", owner: "o", assignmentId: "a", studentId: "s", draft: {}, version: "v1", changeId: "c1", state: "waiting", at: 1 };
  const editedMeanwhile: StoredDraft = { ...entry, changeId: "c2" };

  it("deletes a saved entry, or keeps an edited one on top of the new version", () => {
    expect(afterReply(entry, entry, saved)).toBeNull();
    expect(afterReply(editedMeanwhile, entry, saved)).toMatchObject({ changeId: "c2", version: "v2", state: "waiting", attempts: 0 });
  });

  it("keeps a conflict with the server's marks and the version to save on top of", () => {
    const next = afterReply(entry, entry, { result: "conflict", version: "v3", server: { status: "DRAFT", totalMarks: 2, feedback: "x", privateNotes: null, scores: [] } });
    expect(next).toMatchObject({ state: "conflict", server: { version: "v3", totalMarks: 2 } });
  });

  it("marks a refusal as needing attention, unless the TA has already changed the marks", () => {
    expect(afterReply(entry, entry, { result: "refused", message: "No-show" })).toMatchObject({ state: "error", message: "No-show" });
    expect(afterReply(editedMeanwhile, entry, { result: "refused", message: "No-show" })).toBeUndefined();
  });

  it("waits, unchanged, while signed out or under another account", () => {
    expect(afterReply(entry, entry, { result: "signed-out" })).toBeUndefined();
    expect(afterReply(entry, entry, { result: "other-account" })).toBeUndefined();
  });

  it("backs off after network errors: 5 s, 10 s, 20 s … at most 10 minutes", () => {
    const first = afterReply(entry, entry, { result: "network" }, 1_000);
    expect(first).toMatchObject({ attempts: 1, nextTry: 6_000 });
    const third = afterReply({ ...entry, attempts: 2 }, entry, { result: "network" }, 1_000);
    expect(third).toMatchObject({ attempts: 3, nextTry: 21_000 });
    expect(retryDelay(30)).toBe(10 * 60_000);
  });

  it("does nothing when the entry is gone (another tab or the worker finished it)", () => {
    expect(afterReply(null, entry, saved)).toBeUndefined();
  });
});
