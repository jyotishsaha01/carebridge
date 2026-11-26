import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { canTransitionPayment, FakePaymentProvider } from "./payments";
import { createNotification, notifyUsersByRole } from "./notificationsPrototype";

const provider = new FakePaymentProvider();
const paymentSelect = {
  id: true, appointmentId: true, amountMinor: true, currency: true, status: true,
  provider: true, checkoutUrl: true, createdAt: true, updatedAt: true,
} satisfies Prisma.PaymentIntentSelect;
const createSchema = z.object({ appointmentId: z.string().min(1).max(200), idempotencyKey: z.string().trim().min(8).max(128) });
const webhookSchema = z.object({
  eventId: z.string().min(1).max(200),
  type: z.enum(["payment.succeeded", "payment.failed", "payment.cancelled", "payment.refunded"]),
  paymentId: z.string().min(1).max(200),
  status: z.enum(["SUCCEEDED", "FAILED", "CANCELLED", "REFUNDED"]),
  occurredAt: z.string().datetime(),
}).refine((event) => event.status === ({ "payment.succeeded": "SUCCEEDED", "payment.failed": "FAILED", "payment.cancelled": "CANCELLED", "payment.refunded": "REFUNDED" } as const)[event.type], { message: "Payment event type and status must match" });

export async function registerPaymentRoutes(app: FastifyInstance) {
  app.get("/v1/payments/:appointmentId", async (request, reply) => {
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return null;
    const { appointmentId } = z.object({ appointmentId: z.string().min(1).max(200) }).parse(request.params);
    return prisma.paymentIntent.findFirst({ where: { appointmentId, patientId: user.patient.id }, select: paymentSelect });
  });

  app.post("/v1/payments/intents", async (request, reply) => {
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return null;
    if (process.env.NODE_ENV === "production") return reply.code(503).send({ error: "Payments are unavailable until a production payment provider is connected" });
    const input = createSchema.parse(request.body);
    const appointment = await prisma.appointment.findFirst({ where: { id: input.appointmentId, patientId: user.patient.id }, include: { doctor: true } });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    if (appointment.status === "CANCELLED") return reply.code(409).send({ error: "Cancelled appointments cannot be paid" });

    const existing = await prisma.paymentIntent.findFirst({ where: { OR: [{ idempotencyKey: input.idempotencyKey }, { appointmentId: appointment.id }] }, select: { ...paymentSelect, patientId: true } });
    if (existing) {
      if (existing.patientId !== user.patient.id || existing.appointmentId !== appointment.id) return reply.code(409).send({ error: "Idempotency key is already in use" });
      const { patientId: _patientId, ...intent } = existing;
      return intent;
    }
    const amountMinor = Math.round(Number(appointment.doctor.consultationPriceUsd) * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return reply.code(409).send({ error: "Consultation price is not available" });
    const intent = await provider.createPaymentIntent({ appointmentId: appointment.id, amountMinor, currency: "usd", idempotencyKey: input.idempotencyKey, customerReference: user.patient.id });
    try {
      return await prisma.paymentIntent.create({
        data: { id: intent.id, appointmentId: appointment.id, patientId: user.patient.id, amountMinor: intent.amountMinor, currency: intent.currency, status: intent.status, provider: "demo", providerPaymentId: intent.id, idempotencyKey: input.idempotencyKey, checkoutUrl: intent.checkoutUrl ?? null },
        select: paymentSelect,
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      // A simultaneous retry may win either unique constraint. Only return an owned appointment.
      const stored = await prisma.paymentIntent.findFirst({ where: { appointmentId: appointment.id, patientId: user.patient.id }, select: paymentSelect });
      if (!stored) return reply.code(409).send({ error: "Idempotency key is already in use" });
      return stored;
    }
  });

  app.get("/v1/payments", async (request, reply) => {
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return null;
    const payments = await prisma.paymentIntent.findMany({ where: { patientId: user.patient.id }, select: { ...paymentSelect, appointment: { select: { scheduledAt: true, doctor: { select: { name: true, slug: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return payments.map(({ appointment, ...payment }) => ({ ...payment, scheduledAt: appointment.scheduledAt, doctorName: appointment.doctor.name, doctorSlug: appointment.doctor.slug }));
  });

  app.post("/v1/payments/webhook", async (request, reply) => {
    if (process.env.NODE_ENV === "production") return reply.code(503).send({ error: "A production payment provider is required" });
    const signature = String(request.headers["x-carebridge-signature"] ?? "");
    const payload = JSON.stringify(request.body ?? {});
    if (!provider.verifyWebhookSignature(payload, signature)) return reply.code(401).send({ error: "Invalid webhook signature" });
    const event = webhookSchema.parse(request.body);
    let result: { found: boolean; applied: boolean; patientUserId?: string };
    try {
      result = await prisma.$transaction(async (tx) => {
        const payment = await tx.paymentIntent.findFirst({ where: { OR: [{ id: event.paymentId }, { providerPaymentId: event.paymentId }] }, select: { id: true, status: true, patient: { select: { userId: true } } } });
        if (!payment) return { found: false, applied: false };
        const duplicate = await tx.paymentWebhookEvent.findUnique({ where: { eventId: event.eventId }, select: { id: true } });
        if (duplicate) return { found: true, applied: false };
        await tx.paymentWebhookEvent.create({ data: { id: `pwe_${event.eventId}`, eventId: event.eventId, paymentId: payment.id, type: event.type, status: event.status, occurredAt: new Date(event.occurredAt) } });
        if (!canTransitionPayment(payment.status, event.status)) return { found: true, applied: false };
        const updated = await tx.paymentIntent.updateMany({ where: { id: payment.id, status: payment.status }, data: { status: event.status, updatedAt: new Date() } });
        return { found: true, applied: updated.count === 1, patientUserId: payment.patient.userId };
      });
    } catch (error) {
      // Concurrent delivery of the same event is also a successful no-op.
      if ((error as { code?: string }).code === "P2002") return { applied: false };
      throw error;
    }
    if (!result.found) return reply.code(404).send({ error: "Payment not found" });
    if (!result.applied) return { applied: false };
    if (result.patientUserId) {
      try {
        const title = event.status === "SUCCEEDED" ? "Payment confirmed" : event.status === "REFUNDED" ? "Payment refunded" : event.status === "FAILED" ? "Payment failed" : "Payment cancelled";
        await createNotification({ userId: result.patientUserId, role: "PATIENT", type: "SYSTEM", title, body: "Your consultation payment status is " + event.status.toLowerCase() + "." });
        await notifyUsersByRole("ADMIN", "SYSTEM", "Consultation payment updated", "A consultation payment status changed to " + event.status.toLowerCase() + ".");
      } catch {
        request.log.error({ paymentId: event.paymentId }, "Payment notification delivery failed");
      }
    }
    return { applied: true, status: event.status };
  });
}
