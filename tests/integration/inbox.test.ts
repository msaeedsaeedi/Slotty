import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { unreadCount } from "@/server/services/inbox";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("bell count (polled by the live bell)", () => {
  it("counts only the caller's unread items that need them", async () => {
    const ann = await makeUser("Ann");
    const bob = await makeUser("Bob");
    const item = (userId: string, type: string, readAt: Date | null = null) => ({ userId, type, title: type, body: "", readAt });
    await db.notification.createMany({
      data: [
        item(ann.id, "booking.cancelled_by_staff"),
        item(ann.id, "evaluation.finalized"),
        item(ann.id, "evaluation.finalized", new Date()), // read
        item(ann.id, "slots.added"), // FYI: listed, not counted
        item(bob.id, "booking.cancelled_by_staff"), // someone else's
      ],
    });
    expect(await unreadCount(ann)).toBe(2);
    expect(await unreadCount(bob)).toBe(1);
  });
});
