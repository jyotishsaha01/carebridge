import { describe, expect, it } from "vitest";
import { canTransitionPayment, FakePaymentProvider, PaymentWebhookProcessor } from "./payments";

describe("payment boundary", () => {
  it("creates a local payment intent without card data", async () => {
    const provider = new FakePaymentProvider();
    const intent = await provider.createPaymentIntent({
      appointmentId: "apt_demo",
      amountMinor: 7500,
      currency: "usd",
      idempotencyKey: "idem_123",
      customerReference: "patient_demo",
    });

    expect(intent.status).toBe("REQUIRES_ACTION");
    expect(intent.amountMinor).toBe(7500);
    expect(intent.checkoutUrl).toBeUndefined();
  });

  it("applies a webhook once and ignores duplicate delivery", () => {
    const processor = new PaymentWebhookProcessor();
    const event = {
      eventId: "evt_1",
      type: "payment.succeeded" as const,
      paymentId: "pi_1",
      status: "SUCCEEDED" as const,
      occurredAt: new Date().toISOString(),
    };

    expect(processor.process(event)).toEqual({ applied: true, status: "SUCCEEDED" });
    expect(processor.process(event)).toEqual({ applied: false, status: "SUCCEEDED" });
  });
});

describe("payment integrity", () => {
  it("rejects the old forgeable length signature and authenticates the complete payload", async () => {
    const { createHmac } = await import("node:crypto");
    const { vi } = await import("vitest");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CAREBRIDGE_DEMO_WEBHOOK_SECRET", "a-synthetic-webhook-secret-at-least-32-characters");
    try {
      const payload = JSON.stringify({ paymentId: "pi_1", status: "SUCCEEDED" });
      const signature = createHmac("sha256", process.env.CAREBRIDGE_DEMO_WEBHOOK_SECRET!).update(payload).digest("hex");
      const provider = new FakePaymentProvider();
      expect(provider.verifyWebhookSignature(payload, `demo:${payload.length}`)).toBe(false);
      expect(provider.verifyWebhookSignature(payload, signature)).toBe(true);
      expect(provider.verifyWebhookSignature(payload.replace("pi_1", "pi_2"), signature)).toBe(false);
      expect(provider.verifyWebhookSignature(payload, "malformed")).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });

  it("never issues fake checkout credentials in production", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(new FakePaymentProvider().createPaymentIntent({ appointmentId: "a", amountMinor: 100, currency: "USD", idempotencyKey: "key", customerReference: "patient" })).rejects.toThrow("production payment provider");
    } finally { vi.unstubAllEnvs(); }
  });

  it("does not regress a paid or refunded payment when events arrive out of order", async () => {
    expect(canTransitionPayment("REQUIRES_ACTION", "SUCCEEDED")).toBe(true);
    expect(canTransitionPayment("SUCCEEDED", "FAILED")).toBe(false);
    expect(canTransitionPayment("SUCCEEDED", "REFUNDED")).toBe(true);
    expect(canTransitionPayment("REFUNDED", "SUCCEEDED")).toBe(false);
    expect(canTransitionPayment("REQUIRES_ACTION", "REFUNDED")).toBe(false);
  });
});
