import { describe, expect, it } from "vitest";
import { trustedCheckoutUrl } from "./checkout-url";

describe("payment redirect trust boundary", () => {
  const trusted = "https://checkout.carebridge.test";
  it("preserves a checkout session on an explicitly approved provider origin", () => {
    expect(trustedCheckoutUrl(`${trusted}/session/test?session=one`, trusted)).toBe(`${trusted}/session/test?session=one`);
  });
  it.each([
    "https://attacker.test/session", "https://checkout.carebridge.test.attacker.test/session",
    "https://checkout.carebridge.test@attacker.test/session", "https://attacker@checkout.carebridge.test/session",
    "javascript:alert(document.cookie)", "data:text/html,test", "http://checkout.carebridge.test/session", "/session/test",
  ])("refuses an unsafe checkout target: %s", target => {
    expect(() => trustedCheckoutUrl(target, trusted)).toThrow("not approved");
  });
  it("fails closed when no provider is configured or the allowlist is not a list of origins", () => {
    expect(() => trustedCheckoutUrl(`${trusted}/session`, "")).toThrow("not approved");
    expect(() => trustedCheckoutUrl(`${trusted}/session`, `${trusted}/allowed-path`)).toThrow("not approved");
  });
});
