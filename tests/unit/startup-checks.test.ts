import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalAppUrl } from "@/server/app-url";
import { isDeployed, mailConfigProblems } from "@/server/startup-checks";

afterEach(() => vi.unstubAllEnvs());

const deployed = { NODE_ENV: "production", APP_URL: "https://slotty.example.edu", SMTP_HOST: "email-smtp.us-east-1.amazonaws.com", MAIL_FROM: "Slotty <no-reply@example.edu>" };

describe("isLocalAppUrl", () => {
  it("knows local addresses from public ones", () => {
    for (const url of ["http://localhost:3100", "http://127.0.0.1:3000", "http://[::1]:3000", "https://slotty.local", "http://app.localhost", "", undefined]) expect(isLocalAppUrl(url)).toBe(true);
    for (const url of ["https://slotty.example.edu", "https://localhost.example.edu", "https://10.0.0.5", "not a url"]) expect(isLocalAppUrl(url)).toBe(false);
  });
});

describe("mailConfigProblems", () => {
  it("accepts a complete deployment", () => {
    expect(isDeployed(deployed)).toBe(true);
    expect(mailConfigProblems(deployed)).toEqual([]);
    expect(mailConfigProblems({ ...deployed, SMTP_USER: "u", SMTP_PASS: "p" })).toEqual([]);
  });

  it("fails closed without SMTP, without a sender, or with half the credentials", () => {
    expect(mailConfigProblems({ ...deployed, SMTP_HOST: "" })).toEqual([expect.stringMatching(/SMTP_HOST/)]);
    expect(mailConfigProblems({ ...deployed, MAIL_FROM: undefined })).toEqual([expect.stringMatching(/MAIL_FROM/)]);
    expect(mailConfigProblems({ ...deployed, SMTP_USER: "u" })).toEqual([expect.stringMatching(/SMTP_PASS/)]);
  });

  it("never allows the dev mailbox on a public address", () => {
    expect(mailConfigProblems({ ...deployed, ENABLE_DEV_MAIL: "1" })).toEqual([expect.stringMatching(/ENABLE_DEV_MAIL/)]);
  });

  it("leaves development and the local e2e server alone", () => {
    expect(mailConfigProblems({ NODE_ENV: "development", APP_URL: "https://slotty.example.edu" })).toEqual([]);
    expect(mailConfigProblems({ NODE_ENV: "production", APP_URL: "http://localhost:3100", SMTP_HOST: "", ENABLE_DEV_MAIL: "1" })).toEqual([]);
  });
});
