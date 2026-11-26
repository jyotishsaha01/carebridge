import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./request";

afterEach(() => vi.unstubAllGlobals());
describe("authenticated API transport", () => {
  it("always includes session credentials and disables cached private responses", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await expect(apiFetch("/v1/example")).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/v1/example"), expect.objectContaining({ credentials: "include", cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it("reports network failures with a useful retry message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiFetch("/v1/example")).rejects.toThrow("Check your connection");
  });
  it("handles proxy HTML errors without leaking response contents", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>internal proxy</html>", { status: 502 })));
    await expect(apiFetch("/v1/example")).rejects.toThrow("Unable to complete this request");
  });
  it("notifies the shell when a private request loses its session", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Session expired" }, { status: 401 })));
    await expect(apiFetch("/v1/doctor/appointments")).rejects.toBeInstanceOf(ApiError);
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "carebridge:session-expired" }));
  });
  it("keeps an invalid sign-in on the sign-in form", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Invalid credentials" }, { status: 401 })));
    await expect(apiFetch("/v1/auth/login")).rejects.toThrow("Invalid credentials");
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it("accepts a successful empty response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiFetch("/v1/example", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
