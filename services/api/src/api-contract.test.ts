import { describe, expect, it } from "vitest";
import { z } from "zod";

const healthResponse = z.object({
  status: z.literal("ok"),
  service: z.literal("carebridge-api"),
});

describe("CareBridge API contract", () => {
  it("accepts the health response contract", () => {
    expect(healthResponse.parse({ status: "ok", service: "carebridge-api" })).toEqual({
      status: "ok",
      service: "carebridge-api",
    });
  });

  it("rejects an invalid health response", () => {
    expect(() => healthResponse.parse({ status: "down", service: "carebridge-api" })).toThrow();
  });
});
