export type PaymentStatus = "PENDING" | "REQUIRES_ACTION" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "REFUNDED";

export type PaymentIntent = {
  id: string;
  appointmentId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  checkoutUrl?: string;
};

export type CreatePaymentInput = {
  appointmentId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  customerReference: string;
};

export type PaymentWebhookEvent = {
  eventId: string;
  type: "payment.succeeded" | "payment.failed" | "payment.cancelled" | "payment.refunded";
  paymentId: string;
  status: Extract<PaymentStatus, "SUCCEEDED" | "FAILED" | "CANCELLED" | "REFUNDED">;
  occurredAt: string;
};

export interface PaymentProvider {
  createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
}

/** Local/test provider. It never handles real card data and is safe for synthetic environments. */
export class FakePaymentProvider implements PaymentProvider {
  async createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent> {
    return {
      id: `demo_pi_${input.idempotencyKey}`,
      appointmentId: input.appointmentId,
      amountMinor: input.amountMinor,
      currency: input.currency.toUpperCase(),
      status: "REQUIRES_ACTION",
      checkoutUrl: `http://localhost:3000/payments/demo/${encodeURIComponent(input.idempotencyKey)}`,
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    return signature === `demo:${payload.length}`;
  }
}

/** Server-side state machine: webhook status is authoritative and duplicate events are ignored. */
export class PaymentWebhookProcessor {
  private readonly processedEventIds = new Set<string>();

  process(event: PaymentWebhookEvent): { applied: boolean; status: PaymentStatus } {
    if (this.processedEventIds.has(event.eventId)) {
      return { applied: false, status: event.status };
    }
    this.processedEventIds.add(event.eventId);
    return { applied: true, status: event.status };
  }
}
