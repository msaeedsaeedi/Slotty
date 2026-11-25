import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteUrl, appUrl } from "@/server/app-url";

afterEach(() => vi.unstubAllEnvs());

describe("appUrl", () => {
  it("uses APP_URL without a trailing slash", () => {
    vi.stubEnv("APP_URL", "https://uniflow.example.edu/");
    expect(appUrl()).toBe("https://uniflow.example.edu");
    expect(absoluteUrl("/invite/abc")).toBe("https://uniflow.example.edu/invite/abc");
  });
  it("keeps a port and a sub-path", () => {
    vi.stubEnv("APP_URL", "http://localhost:3001/uniflow/");
    expect(absoluteUrl("/calendar/t")).toBe("http://localhost:3001/uniflow/calendar/t");
  });
  it("falls back to localhost:3000 outside production", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(appUrl()).toBe("http://localhost:3000");
  });
  it("refuses to guess in production", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => appUrl()).toThrow(/APP_URL is not set/);
  });
  it("rejects values that aren't http(s) URLs", () => {
    vi.stubEnv("APP_URL", "uniflow.example.edu");
    expect(() => appUrl()).toThrow(/not a valid URL/);
    vi.stubEnv("APP_URL", "ftp://uniflow.example.edu");
    expect(() => appUrl()).toThrow(/http/);
  });
});
