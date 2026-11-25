import { describe, expect, it } from "vitest";
import { controlState } from "@/lib/control-state";

describe("controlState (#161: which state wins)", () => {
  it("is default with nothing set", () => {
    expect(controlState({})).toBe("default");
  });

  it("puts a business-rule disable first, so a connection is never promised to fix it", () => {
    expect(controlState({ disabled: true, pending: true, offline: true, invalid: true })).toBe("disabled");
  });

  it("shows pending over offline: a request already on its way", () => {
    expect(controlState({ pending: true, offline: true })).toBe("pending");
  });

  it("shows offline over invalid", () => {
    expect(controlState({ offline: true, invalid: true })).toBe("offline");
  });

  it("shows invalid when nothing above applies", () => {
    expect(controlState({ invalid: true })).toBe("invalid");
  });
});
