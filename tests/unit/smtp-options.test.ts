import { describe, expect, it } from "vitest";
import { smtpOptions } from "@/server/smtp-options";

const ses = { SMTP_HOST: "email-smtp.eu-west-1.amazonaws.com", SMTP_PORT: "587", SMTP_USER: "AKIA", SMTP_PASS: "secret" };

describe("smtpOptions", () => {
  it("requires STARTTLS on port 587, so a stripped upgrade fails instead of sending in plain text", () => {
    expect(smtpOptions(ses)).toMatchObject({ host: ses.SMTP_HOST, port: 587, secure: false, requireTLS: true, tls: { minVersion: "TLSv1.2" } });
  });

  it("defaults to port 587 with STARTTLS required", () => {
    expect(smtpOptions({ SMTP_HOST: ses.SMTP_HOST })).toMatchObject({ port: 587, secure: false, requireTLS: true });
  });

  it("uses implicit TLS on port 465", () => {
    expect(smtpOptions({ ...ses, SMTP_PORT: "465" })).toMatchObject({ port: 465, secure: true, requireTLS: false });
  });

  it("lets only a server on this machine (Mailpit) speak plain text", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "mailpit", "LOCALHOST"]) {
      expect(smtpOptions({ SMTP_HOST: host, SMTP_PORT: "1025" })).toMatchObject({ requireTLS: false, secure: false });
    }
    expect(smtpOptions({ SMTP_HOST: "mail.internal", SMTP_PORT: "1025" })).toMatchObject({ requireTLS: true });
  });

  it("passes credentials only when a user is set", () => {
    expect(smtpOptions(ses)?.auth).toEqual({ user: "AKIA", pass: "secret" });
    expect(smtpOptions({ SMTP_HOST: "localhost" })?.auth).toBeUndefined();
  });

  it("has no transport without SMTP_HOST", () => {
    expect(smtpOptions({})).toBeNull();
    expect(smtpOptions({ SMTP_HOST: "  " })).toBeNull();
  });
});
