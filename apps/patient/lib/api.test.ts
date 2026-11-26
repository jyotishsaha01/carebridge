import { afterEach, describe, expect, it, vi } from "vitest";
import { bindSession, invalidateSession } from "./session-binding";
import { ApiError, apiFetch, bookAppointment, getAvailability, getDoctors } from "./api";

afterEach(() => { invalidateSession();vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("patient API boundary", () => {
  it("keeps default and requested discovery limits within the server's cap", async () => {
    const fetch = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetch);
    await getDoctors();
    await getDoctors({ limit: 100, q: "   " });
    for (const call of fetch.mock.calls as unknown as Array<[string]>) {
      const query = new URL(call[0]).searchParams;
      expect(query.get("limit")).toBe("50");
      expect(query.has("q")).toBe(false);
    }
  });

  it("sends authenticated mutations without a demo identity override", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({user:{id:"patient-one",role:"PATIENT"}})).mockResolvedValueOnce(Response.json({id:"appointment"}));
    vi.stubGlobal("fetch", fetch);
    await bookAppointment("doctor-slug", "2027-01-01T12:00:00.000Z");
    const [, init] = fetch.mock.calls[1];
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("x-demo-patient-email")).toBeNull();
    expect(new Headers(init.headers).get("X-CareBridge-Expected-User")).toBe("patient-one");
    expect(JSON.parse(init.body)).toMatchObject({ doctorSlug: "doctor-slug" });
  });

  it("retains HTTP status so expired sessions can recover through sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Session expired" }), { status: 401 })));
    await expect(apiFetch("/v1/patient/dashboard")).rejects.toMatchObject({ name: "ApiError", status: 401, message: "Session expired" });
  });

  it("handles non-JSON infrastructure errors without exposing a broken JSON parser", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Gateway unavailable</html>", { status: 502 })));
    await expect(apiFetch("/v1/doctors")).rejects.toBeInstanceOf(ApiError);
  });

  it("ends stalled requests and does not retry a booking mutation", async () => {
    bindSession("patient-one","PATIENT");
    vi.useFakeTimers();
    const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetch);
    const expectation = expect(bookAppointment("doctor", "2027-01-01T12:00:00.000Z")).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(15_000);
    await expectation;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("encodes route identifiers instead of allowing a doctor slug to change the route", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", fetch);
    await getAvailability("doctor/other?admin=true", new Date("2027-01-01"), new Date("2027-01-14"));
    expect(fetch.mock.calls[0][0]).toContain("/doctors/doctor%2Fother%3Fadmin%3Dtrue/availability?");
  });

  it("supports empty successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiFetch("/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});
