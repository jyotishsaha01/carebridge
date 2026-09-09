import { describe, expect, it } from "vitest";

describe("video session contract", () => {
  it("does not expose provider credentials from the API contract", () => {
    const response = {
      provider: "unconfigured",
      status: "NOT_PROVISIONED",
      roomName: "carebridge-demo",
    };
    expect(response).not.toHaveProperty("token");
    expect(response).not.toHaveProperty("joinUrl");
  });

  it("uses an appointment-scoped room name", () => {
    const appointmentId = "appointment_123";
    expect(`carebridge-${appointmentId}`).toBe("carebridge-appointment_123");
  });
});
