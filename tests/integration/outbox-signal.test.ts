import { afterEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { db } from "@/server/db";
import { OLD_OUTBOX_CHANNEL, OUTBOX_CHANNEL, signalOutbox } from "@/server/outbox-signal";

let listener: Client | null = null;
afterEach(async () => {
  await listener?.end();
  listener = null;
});

describe("outbox signal across the rename (issue #133)", () => {
  it("wakes a worker on either channel name once the transaction commits", async () => {
    listener = new Client({ connectionString: process.env.DATABASE_URL });
    await listener.connect();
    await listener.query(`LISTEN ${OUTBOX_CHANNEL}`);
    await listener.query(`LISTEN ${OLD_OUTBOX_CHANNEL}`);
    const heard = new Set<string>();
    const both = new Promise<void>((resolve) =>
      listener!.on("notification", (n) => {
        heard.add(n.channel);
        if (heard.size === 2) resolve();
      }),
    );

    await db.$transaction((tx) => signalOutbox(tx));
    await Promise.race([both, new Promise((r) => setTimeout(r, 3_000))]);
    expect([...heard].sort()).toEqual([OLD_OUTBOX_CHANNEL, OUTBOX_CHANNEL].sort());
  });

  it("sends nothing when the transaction rolls back", async () => {
    listener = new Client({ connectionString: process.env.DATABASE_URL });
    await listener.connect();
    await listener.query(`LISTEN ${OUTBOX_CHANNEL}`);
    let count = 0;
    listener.on("notification", () => count++);
    await db
      .$transaction(async (tx) => {
        await signalOutbox(tx);
        throw new Error("roll back");
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    expect(count).toBe(0);
  });
});
