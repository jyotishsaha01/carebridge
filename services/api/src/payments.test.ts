import { describe, expect, it } from "vitest";
import { FakePaymentProvider, PaymentWebhookProcessor } from "./payments";

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
    expect(intent.checkoutUrl).toContain("idem_123");
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
