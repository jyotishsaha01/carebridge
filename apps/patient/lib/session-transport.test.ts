import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { bindSession, captureSessionScope, invalidateSession } from "./session-binding";

beforeEach(() => bindSession("user-A", "PATIENT"));
afterEach(() => { invalidateSession(); vi.unstubAllGlobals(); });

describe("session-bound private requests", () => {
  it("pins writes to the mounted principal while auth discovery omits the expectation", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    await apiFetch("/v1/patient/profile", { method: "PATCH" });
    expect(new Headers(fetch.mock.calls[0][1].headers).get("X-CareBridge-Expected-User")).toBe("user-A");
    await apiFetch("/v1/auth/me");
    expect(new Headers(fetch.mock.calls[1][1].headers).has("X-CareBridge-Expected-User")).toBe(false);
  });
  it("rejects an old completion after the account changes, even if fetch ignores cancellation", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const request = apiFetch("/v1/private-record");
    const rejected = expect(request).rejects.toMatchObject({ name: "SessionChangedError" });
    bindSession("user-B", "PATIENT");
    finish(Response.json({ privateData: "account A" }));
    await rejected;
  });
  it("also rejects a body that finishes decoding after the account changes", async () => {
    let finish!: (body: unknown) => void;
    const response = Response.json({});
    const json = vi.spyOn(response, "json").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const request = apiFetch("/v1/private-record");
    const rejected = expect(request).rejects.toMatchObject({ name: "SessionChangedError" });
    await vi.waitFor(() => expect(json).toHaveBeenCalled());
    bindSession("user-B", "PATIENT");
    finish({ privateData: "account A" });
    await rejected;
  });
  it("does not let an old callback silently acquire the new account's identity", async () => {
    const oldScope = captureSessionScope();
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    bindSession("user-B", "PATIENT");
    await expect(apiFetch("/v1/documents/upload-intent", { method: "POST", sessionScope: oldScope })).rejects.toMatchObject({ name: "SessionChangedError" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not log the new account out because an old request eventually returns 401", async () => {
    let finish!: (response: Response) => void;
    const dispatchEvent = vi.fn(); vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const request = apiFetch("/v1/private-record");
    const rejected = expect(request).rejects.toMatchObject({ name: "SessionChangedError" });
    bindSession("user-B", "PATIENT");
    finish(Response.json({ error: "Expired" }, { status: 401 }));
    await rejected;
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(captureSessionScope().userId).toBe("user-B");
  });
  it("clears private state when the server rejects the expected principal", async () => {
    const dispatchEvent = vi.fn(); vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Account changed", code: "ACCOUNT_CHANGED" }, { status: 409 })));
    await expect(apiFetch("/v1/patient/profile", { method: "PATCH" })).rejects.toMatchObject({ status: 409 });
    expect(captureSessionScope().userId).toBeNull();
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "carebridge:session-expired" }));
  });
  it("rechecks a feature's 401 without discarding the bound identity", async () => {
    const dispatchEvent = vi.fn(); vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Feature unavailable" }, { status: 401 })));
    await expect(apiFetch("/v1/private-record")).rejects.toMatchObject({ status: 401 });
    expect(captureSessionScope().userId).toBe("user-A");
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "carebridge:session-recheck" }));
  });
  it("does not treat a public endpoint's 401 as a session failure", async () => {
    const dispatchEvent = vi.fn(); vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 401 })));
    await expect(apiFetch("/v1/doctors")).rejects.toMatchObject({ status: 401 });
    expect(captureSessionScope().userId).toBe("user-A");
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

});
