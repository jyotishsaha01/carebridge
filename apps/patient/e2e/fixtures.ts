import { test as base, expect } from "@playwright/test";
import { doctors, specialties } from "../data";

export const test = base.extend({
  page: async ({ page }, run) => {
    await page.route("**/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const headers = { "access-control-allow-origin": "http://127.0.0.1:3100", "access-control-allow-credentials": "true" };
      let body: unknown = { error: "Please sign in to continue." };
      let status = 401;
      if (url.pathname === "/v1/specialties") { status = 200; body = specialties.map((name) => ({ id: name.toLowerCase(), name })); }
      if (url.pathname === "/v1/doctors") {
        status = 200;
        const specialty = url.searchParams.get("specialty");
        const query = url.searchParams.get("q")?.toLowerCase() ?? "";
        body = doctors.filter((doctor) => (!specialty || doctor.specialty === specialty) && (!query || `${doctor.name} ${doctor.specialty} ${doctor.expertise.join(" ")}`.toLowerCase().includes(query))).map((doctor) => ({ ...doctor, verified: true }));
      }
      if (/^\/v1\/doctors\/[^/]+\/availability$/.test(url.pathname)) {
        status = 200;
        const startsAt = new Date(Date.now() + 86_400_000).toISOString();
        body = [{ id: "slot-one", startsAt, endsAt: new Date(Date.now() + 88_200_000).toISOString(), timezone: "UTC" }];
      }
      await route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(body) });
    });
    await run(page);
  },
});

export { expect };
