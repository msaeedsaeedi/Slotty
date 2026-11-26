import { beforeEach, describe, expect, it } from "vitest";
import { NEW_EVALUATION } from "@/domain/draft-upload";
import { db } from "@/server/db";
import { handleDraftUpload } from "@/server/draft-upload-handler";
import { offlineOwner } from "@/server/offline-owner";
import type { Actor } from "@/server/services/access";
import { bookSlot } from "@/server/services/bookings";
import { saveDraft } from "@/server/services/evaluations";
import { enroll, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

const HOST = "uniflow.test";

/** A request as the marking sheet or the service worker sends it. */
function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://${HOST}/api/marking/drafts`, {
    method: "POST",
    headers: { host: HOST, origin: `https://${HOST}`, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function setup() {
  const ta = await makeUser("Tara TA");
  const other = await makeUser("Omar TA");
  const ann = await makeUser("Ann");
  const { course, assignment, slots } = await setupCourse(ta);
  await enroll(course.id, [other], "TA");
  await enroll(course.id, [ann]);
  await bookSlot(ann, slots[0].id);
  const criteria = await db.rubricCriterion.findMany({ where: { assignmentId: assignment.id }, orderBy: { order: "asc" } });
  // During the demo: no early-marking reason needed.
  const during = new Date(slots[0].startsAt.getTime() + 5 * 60_000);
  const upload = (actor: Actor, over: Record<string, unknown> = {}, draft: Record<string, unknown> = {}) => ({
    owner: offlineOwner(actor.id),
    assignmentId: assignment.id,
    studentId: ann.id,
    baseVersion: NEW_EVALUATION,
    changeId: `change-${Math.random().toString(36).slice(2)}`,
    draft: { scores: [{ criterionId: criteria[0].id, points: 5 }], totalMarks: null, totalOverride: false, feedback: "Typed offline", ...draft },
    ...over,
  });
  const send = (actor: Actor | null, body: unknown, headers?: Record<string, string>, now = during) => handleDraftUpload(post(body, headers), async () => actor, now);
  const marks = () => db.evaluation.findUnique({ where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: ann.id } }, include: { scores: true } });
  return { ta, other, ann, assignment, criteria, slots, during, upload, send, marks };
}

describe("POST /api/marking/drafts (#163)", () => {
  it("saves a draft, never submitted, and says which version it is now", async () => {
    const { ta, upload, send, marks } = await setup();
    const res = await send(ta, upload(ta));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ result: "saved", status: "DRAFT", totalMarks: 5, bookingStatus: "COMPLETED" });
    const saved = await marks();
    expect(saved?.feedback).toBe("Typed offline");
    expect(saved?.status).toBe("DRAFT");
    expect(body.version).toBe(saved!.updatedAt.toISOString());
  });

  it("refuses another site, a missing origin and a non-JSON body, before reading anything", async () => {
    const { ta, upload, send, marks } = await setup();
    expect((await send(ta, upload(ta), { origin: "https://evil.example" })).status).toBe(403);
    const noOrigin = new Request(`https://${HOST}/api/marking/drafts`, { method: "POST", headers: { host: HOST, "content-type": "application/json" }, body: JSON.stringify(upload(ta)) });
    expect((await handleDraftUpload(noOrigin, async () => ta)).status).toBe(403);
    expect((await send(ta, upload(ta), { "content-type": "text/plain" })).status).toBe(415);
    expect(await marks()).toBeNull();
  });

  it("keeps the marks waiting when signed out, and never saves them under another account", async () => {
    const { ta, other, upload, send, marks } = await setup();
    const res = await send(null, upload(ta));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ result: "signed-out" });
    // Omar signed in on the device Tara typed on: refused, though Omar could mark Ann himself.
    const wrong = await send(other, upload(ta));
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ result: "other-account" });
    expect(await marks()).toBeNull();
  });

  it("never overwrites marks changed since the device's copy started, and sends them back", async () => {
    const { ta, other, ann, assignment, criteria, upload, send, marks, during } = await setup();
    const first = await (await send(ta, upload(ta))).json();
    // A colleague changes the marks meanwhile.
    await saveDraft(other, assignment.id, ann.id, { scores: [{ criterionId: criteria[0].id, points: 2 }], totalMarks: null, feedback: "Omar's correction" }, during);
    const res = await send(ta, upload(ta, { baseVersion: first.version }, { feedback: "Late from the device" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.result).toBe("conflict");
    expect(body.server).toMatchObject({ status: "DRAFT", feedback: "Omar's correction", totalMarks: 2, scores: [{ criterionId: criteria[0].id, points: 2 }] });
    expect((await marks())?.feedback).toBe("Omar's correction");
    // Choosing the device's copy: uploaded again on top of the version it was shown.
    const keep = await send(ta, upload(ta, { baseVersion: body.version }, { feedback: "Late from the device" }));
    expect(keep.status).toBe(200);
    expect((await marks())?.feedback).toBe("Late from the device");
  });

  it("treats a repeat of an upload already saved as saved, without saving or auditing it twice", async () => {
    const { ta, upload, send, marks } = await setup();
    const body = upload(ta);
    const a = await (await send(ta, body)).json();
    const audits = await db.auditLog.count({ where: { action: "evaluation.write" } });
    // The reply was lost: the device sends the same upload again, from the same old version.
    const res = await send(ta, body);
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b).toMatchObject({ result: "saved", version: a.version, evaluationId: a.evaluationId });
    expect(await db.auditLog.count({ where: { action: "evaluation.write" } })).toBe(audits);
    expect((await marks())?.lastClientChangeId).toBe(body.changeId);
  });

  it("returns a rule's refusal with its message, for the TA to deal with", async () => {
    const { ta, upload, send, slots, marks } = await setup();
    // Before the demo, without the reason that needs.
    const res = await send(ta, upload(ta), undefined, new Date(slots[0].startsAt.getTime() - 3_600_000));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ result: "refused", message: expect.stringMatching(/hasn't started yet/) });
    expect(await marks()).toBeNull();
    // A body that isn't a draft is refused too, not retried.
    const bad = await send(ta, { ...upload(ta), draft: { scores: "all of them" } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).result).toBe("refused");
  });
});
