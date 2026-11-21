import { describe, expect, it } from "vitest";
import { AUTH_LIMITS, canEmailReset, canRequestReset, canTrySignIn, signInWaitMs } from "@/domain/auth-limits";
import { clientIp, stripPort } from "@/server/client-ip";

const now = new Date("2026-11-21T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("sign-in backoff", () => {
  it("lets the first few failures through, then doubles the wait up to a cap", () => {
    expect(signInWaitMs(4, now, now)).toBe(0);
    expect(signInWaitMs(5, now, now)).toBe(30_000);
    expect(signInWaitMs(6, now, now)).toBe(60_000);
    expect(signInWaitMs(8, now, now)).toBe(240_000);
    expect(signInWaitMs(40, now, now)).toBe(AUTH_LIMITS.signIn.maxWaitMs);
  });

  it("counts the wait from the latest failure", () => {
    expect(signInWaitMs(5, ago(10_000), now)).toBe(20_000);
    expect(signInWaitMs(5, ago(31_000), now)).toBe(0);
  });

  it("refuses with a reason while waiting, per account or per network", () => {
    expect(canTrySignIn({ failures: 6, lastFailureAt: now }, 0, now)).toMatchObject({ ok: false, reason: expect.stringMatching(/this email.*a minute/) });
    expect(canTrySignIn({ failures: 9, lastFailureAt: now }, 0, now)).toMatchObject({ ok: false, reason: expect.stringMatching(/8 minutes/) });
    expect(canTrySignIn({ failures: 0, lastFailureAt: null }, 50, now)).toMatchObject({ ok: false, reason: expect.stringMatching(/your network/) });
    expect(canTrySignIn({ failures: 0, lastFailureAt: null }, 49, now).ok).toBe(true);
    // No trustworthy address: the per-network limit is skipped.
    expect(canTrySignIn({ failures: 0, lastFailureAt: null }, null, now).ok).toBe(true);
  });
});

describe("password reset limits", () => {
  it("caps requests per network and emails per recipient", () => {
    expect(canRequestReset(9).ok).toBe(true);
    expect(canRequestReset(10)).toMatchObject({ ok: false, reason: expect.stringMatching(/reset requests from your network/) });
    expect(canRequestReset(null).ok).toBe(true);
    expect(canEmailReset(2)).toBe(true);
    expect(canEmailReset(3)).toBe(false);
  });
});

describe("clientIp", () => {
  const h = (values: Record<string, string>) => ({ get: (k: string) => values[k] ?? null });

  it("trusts CloudFront's viewer address and strips the port", () => {
    expect(clientIp(h({ "cloudfront-viewer-address": "203.0.113.7:4711", "x-forwarded-for": "1.1.1.1" }), true)).toBe("203.0.113.7");
    expect(stripPort("2001:db8::1:4711")).toBe("2001:db8::1");
    expect(stripPort("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(stripPort("203.0.113.7")).toBe("203.0.113.7");
  });

  it("ignores X-Forwarded-For behind the origin lock, but uses it without one", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), true)).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), false)).toBe("1.1.1.1");
    expect(clientIp(h({}), false)).toBeNull();
  });
});
