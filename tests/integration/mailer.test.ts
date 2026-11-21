import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { deliverPendingEmails } from "@/server/mailer";
import { resetDb } from "./helpers";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe("delivery without SMTP (local development)", () => {
  it("notes the email without printing its body", async () => {
    vi.stubEnv("SMTP_HOST", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await db.emailOutbox.create({ data: { to: "sam@test.edu", subject: "Reset your Slotty password", text: "Use this link: http://localhost/reset-password/SECRET-TOKEN\nMarks: 9/10" } });
    expect(await deliverPendingEmails()).toMatchObject({ sent: 1 });
    const printed = log.mock.calls.flat().join("\n");
    expect(printed).toContain("Reset your Slotty password");
    expect(printed).not.toContain("SECRET-TOKEN");
    expect(printed).not.toContain("9/10");
    vi.unstubAllEnvs();
  });
});
