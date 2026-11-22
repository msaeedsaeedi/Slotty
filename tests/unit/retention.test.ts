import { describe, expect, it } from "vitest";
import { RETENTION, retentionCutoffs } from "@/domain/retention";

describe("retentionCutoffs", () => {
  it("counts each period back from now", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    const cut = retentionCutoffs(now);
    expect(cut.sentEmailBody.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(cut.push.toISOString()).toBe("2026-11-24T00:00:00.000Z");
    expect(cut.readNotification.toISOString()).toBe("2026-09-02T00:00:00.000Z");
    expect(cut.session).toEqual(now);
  });

  it("keeps message content no longer than the rows that hold it", () => {
    expect(RETENTION.sentEmailBodyDays).toBeLessThan(RETENTION.emailRowDays);
    expect(RETENTION.readNotificationDays).toBeLessThanOrEqual(RETENTION.notificationDays);
  });
});
