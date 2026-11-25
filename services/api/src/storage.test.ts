import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalStorageAllowed, documentMatchesContentType } from "./storage";
afterEach(() => vi.unstubAllEnvs());
describe("document storage protections", () => {
  it("rejects misleading content types", () => {
    expect(documentMatchesContentType(Buffer.from("<script>attack</script>"), "application/pdf")).toBe(false);
    expect(documentMatchesContentType(Buffer.from("%PDF-1.4\n"), "application/pdf")).toBe(true);
    expect(documentMatchesContentType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png")).toBe(true);
    expect(documentMatchesContentType(Buffer.from([255, 216, 255, 224]), "image/jpeg")).toBe(true);
  });
  it("blocks plaintext prototype storage in production even when an env flag claims encryption", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_ENCRYPTION", "true");
    expect(() => assertLocalStorageAllowed()).toThrow("Encrypted production document storage");
  });
});
