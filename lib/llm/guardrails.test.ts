import { describe, expect, it } from "vitest";
import { checkReply, checkValue, MAX_REPLY_LENGTH } from "./guardrails";

describe("checkReply", () => {
  it("accepts an ordinary clarification", () => {
    const r = checkReply("  That just tells   us which lenders to check. ");
    expect(r).toEqual({ ok: true, reply: "That just tells us which lenders to check." });
  });

  it.each([
    ["rates start at 7.99%", "rate_claim"],
    ["the APR depends on your profile", "rate_claim"],
    ["you're approved for this", "approval_claim"],
    ["you are pre-qualified already", "approval_claim"],
    ["approval is guaranteed", "approval_claim"],
    ["I'm a real person here to help", "human_claim"],
    ["I'm not a bot, promise", "human_claim"],
    ["please share your SSN", "sensitive_request"],
    ["what's your routing number?", "sensitive_request"],
    ["see https://example.com", "link"],
    ["you could get $5000", "amount_claim"],
  ])("rejects %j as %s", (reply, reason) => {
    expect(checkReply(reply)).toEqual({ ok: false, reason });
  });

  it("rejects empty and overlong replies", () => {
    expect(checkReply(null)).toEqual({ ok: false, reason: "empty" });
    expect(checkReply("   ")).toEqual({ ok: false, reason: "empty" });
    expect(checkReply("a".repeat(MAX_REPLY_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });
});

describe("checkValue", () => {
  const allowed = ["1000-5000", "5000-15000"];

  it("accepts an allowed value", () => {
    expect(checkValue("5000-15000", allowed)).toBe("5000-15000");
    expect(checkValue("  5000-15000  ", allowed)).toBe("5000-15000");
  });

  it("rejects anything the server didn't offer", () => {
    expect(checkValue("99999", allowed)).toBeNull();
    expect(checkValue("5000-15000; drop table", allowed)).toBeNull();
    expect(checkValue(null, allowed)).toBeNull();
    expect(checkValue("5000-15000", [])).toBeNull();
  });
});
