import { describe, expect, it } from "vitest";
import { doctors, specialties } from "./data";

describe("CareBridge specialist catalog", () => {
  it("contains a non-empty approved specialty set", () => {
    expect(specialties.length).toBeGreaterThan(0);
    expect(new Set(specialties).size).toBe(specialties.length);
  });

  it("contains only valid synthetic doctor records", () => {
    expect(doctors.length).toBeGreaterThan(0);
    for (const doctor of doctors) {
      expect(doctor.id).toBeTruthy();
      expect(doctor.name).toBeTruthy();
      expect(doctor.price).toBeGreaterThan(0);
      expect(doctor.usLow).toBeGreaterThan(doctor.price);
      expect(doctor.usHigh).toBeGreaterThanOrEqual(doctor.usLow);
      expect(specialties).toContain(doctor.specialty);
    }
  });
});
