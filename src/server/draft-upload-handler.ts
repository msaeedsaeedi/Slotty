import { z, ZodError } from "zod";
import { DomainError } from "@/domain/result";
import { offlineOwner } from "@/server/offline-owner";
import type { Actor } from "@/server/services/access";
import { uploadDraft } from "@/server/services/evaluations";

/** A draft is small; anything bigger is not from the marking sheet. */
const MAX_BYTES = 64 * 1024;

const headers = { "Cache-Control": "no-store" };

const uploadBody = z.object({
  /** The account key the device kept the draft under (`offlineOwner`). */
  owner: z.string().min(1).max(64),
  assignmentId: z.string().min(1).max(64),
  studentId: z.string().min(1).max(64),
  baseVersion: z.string().min(1).max(64),
  changeId: z.string().min(8).max(64),
  draft: z.object({
    scores: z.array(z.object({ criterionId: z.string().max(64), points: z.number(), comment: z.string().max(1000).optional() })).max(100),
    totalMarks: z.number().nullable(),
    totalOverride: z.boolean(),
    overrideNote: z.string().max(1000).optional(),
    feedback: z.string().max(5000).optional(),
    privateNotes: z.string().max(5000).optional(),
    noBookingReason: z.string().max(1000).optional(),
    earlyMarkReason: z.string().max(1000).optional(),
  }),
});

export type DraftUploadBody = z.infer<typeof uploadBody>;

/**
 * The replies a device acts on (agreed design: step 3 on #160, "What each reply means"):
 * `saved` → delete its copy; `conflict` → keep it and show both; `refused` → keep it as Needs
 * attention, no automatic retry; `signed-out` / `other-account` → keep it and wait for that
 * account; anything else (5xx, network) → retry later.
 */
const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers });

/**
 * POST /api/marking/drafts (#163): one way in for marking drafts, from the open marking sheet
 * and from the service worker. Its address doesn't change between releases, unlike a Server
 * Action's, so a sheet left open across a deploy still saves.
 *
 * Who may call it: the session cookie (HttpOnly, SameSite=Lax), a same-site Origin (required,
 * as for Server Actions), and a JSON body (a form on another site can't send one without a
 * CORS preflight, which this route doesn't answer). The device's account key must match the
 * signed-in account, so marks typed by one TA never save under another who signed in later.
 */
export async function handleDraftUpload(request: Request, currentUser: () => Promise<Actor | null>, now?: Date): Promise<Response> {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let sameSite = false;
  try {
    sameSite = Boolean(origin && host && new URL(origin).host === host);
  } catch {}
  if (!sameSite) return reply(403, { result: "forbidden" });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return reply(415, { result: "forbidden" });

  const user = await currentUser();
  if (!user) return reply(401, { result: "signed-out" });

  const text = await request.text();
  if (text.length > MAX_BYTES) return reply(413, { result: "refused", message: "These marks are too long to save." });
  let body: DraftUploadBody;
  try {
    body = uploadBody.parse(JSON.parse(text));
  } catch {
    return reply(400, { result: "refused", message: "These marks couldn't be read. Check them and try again." });
  }
  if (body.owner !== offlineOwner(user.id)) return reply(403, { result: "other-account" });

  try {
    const r = await uploadDraft(user, body, now);
    if (r.result === "conflict") return reply(409, r);
    return reply(200, { ...r, savedAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof DomainError) return reply(422, { result: "refused", message: e.message, field: e.field });
    if (e instanceof ZodError) return reply(422, { result: "refused", message: e.issues[0]?.message ?? "Check the marks." });
    console.error("[marking] draft upload failed", e instanceof Error ? e.message : e);
    return reply(500, { result: "error" });
  }
}
