import { describe, expect, it, vi } from "vitest";
import { createSecurityEmailProvider } from "./email";

describe("security email boundary", () => {
  it("uses a development preview provider outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const result = await createSecurityEmailProvider().send({ kind: "PASSWORD_RESET", recipient: "demo@example.com", token: "test-token" });
    expect(result.provider).toBe("development-preview");
    expect(result.delivered).toBe(false);
  });

  it("fails closed for production without a configured provider", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SECURITY_EMAIL_PROVIDER", "");
    await expect(createSecurityEmailProvider().send({ kind: "EMAIL_VERIFICATION", recipient: "demo@example.com", token: "test-token" }))
      .rejects.toThrow("Security email provider is not configured");
  });
});
