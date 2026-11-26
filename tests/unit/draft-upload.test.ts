import { describe, expect, it } from "vitest";
import { checkDraftUpload, evaluationVersion, NEW_EVALUATION, SEALED_DRAFT_DAYS, sealedExpired } from "@/domain/draft-upload";

const at = new Date("2026-12-01T09:00:00.123Z");

describe("draft uploads (#163)", () => {
  it("versions an evaluation by when it last changed, and a missing one as new", () => {
    expect(evaluationVersion(null)).toBe(NEW_EVALUATION);
    expect(evaluationVersion({ updatedAt: at })).toBe("2026-12-01T09:00:00.123Z");
  });

  it("saves a draft typed on top of what the server has", () => {
    expect(checkDraftUpload(null, { baseVersion: NEW_EVALUATION, changeId: "c1" })).toBe("save");
    expect(checkDraftUpload({ version: "v1", lastClientChangeId: null }, { baseVersion: "v1", changeId: "c1" })).toBe("save");
  });

  it("refuses a draft when the evaluation changed since, including one created meanwhile", () => {
    expect(checkDraftUpload({ version: "v2", lastClientChangeId: "other" }, { baseVersion: "v1", changeId: "c1" })).toBe("conflict");
    expect(checkDraftUpload({ version: "v1", lastClientChangeId: null }, { baseVersion: NEW_EVALUATION, changeId: "c1" })).toBe("conflict");
  });

  it("recognises a repeat of an upload already saved, even after a later change by someone else", () => {
    expect(checkDraftUpload({ version: "v2", lastClientChangeId: "c1" }, { baseVersion: "v1", changeId: "c1" })).toBe("repeat");
    expect(checkDraftUpload({ version: "v2", lastClientChangeId: "c1" }, { baseVersion: "v2", changeId: "c1" })).toBe("repeat");
  });

  it("deletes sealed drafts after the agreed days", () => {
    const day = 86_400_000;
    expect(sealedExpired(0, (SEALED_DRAFT_DAYS - 1) * day)).toBe(false);
    expect(sealedExpired(0, SEALED_DRAFT_DAYS * day)).toBe(true);
  });
});
