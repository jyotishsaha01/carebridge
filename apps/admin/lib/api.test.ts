import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signIn } from "./api";
import { bindSession, captureSessionScope, invalidateSession } from "./session-binding";

beforeEach(() => bindSession("existing-patient", "PATIENT"));
afterEach(() => { invalidateSession(); vi.unstubAllGlobals(); });

describe("administrator sign-in", () => {
  it("requests the administrator role before binding the returned account", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ user: { id: "admin-user", email: "admin@example.test", role: "ADMIN" } }));
    vi.stubGlobal("fetch", fetch);
    await signIn("admin@example.test", "synthetic-password");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email: "admin@example.test", password: "synthetic-password", role: "ADMIN" });
    expect(captureSessionScope()).toMatchObject({ userId: "admin-user", role: "ADMIN" });
  });

  it("preserves the existing account when the server rejects the requested role", async () => {
    const scope = captureSessionScope();
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: "This account does not have access to the admin workspace." }, { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    await expect(signIn("patient@example.test", "synthetic-password")).rejects.toMatchObject({ status: 403 });
    expect(captureSessionScope()).toBe(scope);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an unexpected wrong-role response without binding or logging it out", async () => {
    const scope = captureSessionScope();
    const fetch = vi.fn().mockResolvedValue(Response.json({ user: { id: "other-patient", email: "patient@example.test", role: "PATIENT" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(signIn("patient@example.test", "synthetic-password")).rejects.toThrow("not registered as an administrator");
    expect(captureSessionScope()).toBe(scope);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
