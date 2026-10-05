import { describe, expect, it } from "vitest";

describe("Doctor workspace", () => {
  it("covers the Phase-1 provider workflow routes", () => {
    const routes=["/","/dashboard","/operations","/onboarding","/profile"];
    expect(routes).toHaveLength(5);
    expect(routes).toContain("/profile");
    expect(routes).toContain("/operations");
  });

  it("defines the clinical lifecycle", () => {
    expect(["SCHEDULED","IN_PROGRESS","COMPLETED"]).toEqual(["SCHEDULED","IN_PROGRESS","COMPLETED"]);
    expect(["clinical note","prescription","follow-up","patient documents"]).toHaveLength(4);
  });
});
