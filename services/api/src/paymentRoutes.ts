import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./server";
import { getAuthenticatedUser, requireRole } from "./auth";
import { FakePaymentProvider } from "./payments";

const provider = new FakePaymentProvider();

const createSchema = z.object({
  appointmentId: z.string().min(1),
  idempotencyKey: z.string().trim().min(8).max(128),
});

const webhookSchema = z.object({
  eventId: z.string().min(1),
  type: z.enum(["payment.succeeded", "payment.failed", "payment.cancelled", "payment.refunded"]),
  paymentId: z.string().min(1),
  status: z.enum(["SUCCEEDED", "FAILED", "CANCELLED", "REFUNDED"]),
  occurredAt: z.string().datetime(),
});

async function ensurePaymentTables() {
  await prisma.$executeRaw(Prisma.sql`
    CREATE TABLE IF NOT EXISTS "PaymentIntent" (
      "id" TEXT PRIMARY KEY,
      "appointmentId" TEXT NOT NULL UNIQUE,
      "patientId" TEXT NOT NULL,
      "amountMinor" INTEGER NOT NULL,
      "currency" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "providerPaymentId" TEXT,
      "idempotencyKey" TEXT NOT NULL UNIQUE,
      "checkoutUrl" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRaw(Prisma.sql`
    CREATE TABLE IF NOT EXISTS "PaymentWebhookEvent" (
      "id" TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL UNIQUE,
      "paymentId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "occurredAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function registerPaymentRoutes(app: FastifyInstance) {
  app.get("/v1/payments/:appointmentId", async (request, reply) => {
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return null;
    const { appointmentId } = z.object({ appointmentId: z.string().min(1) }).parse(request.params);
    await ensurePaymentTables();
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT "id", "appointmentId", "amountMinor", "currency", "status", "provider", "checkoutUrl", "createdAt", "updatedAt"
      FROM "PaymentIntent" WHERE "appointmentId" = ${appointmentId} AND "patientId" = ${user.patient.id} LIMIT 1
    `);
    return rows[0] ?? null;
  });

  app.post("/v1/payments/intents", async (request, reply) => {
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return null;
    const input = createSchema.parse(request.body);
    await ensurePaymentTables();

    const appointment = await prisma.appointment.findFirst({
      where: { id: input.appointmentId, patientId: user.patient.id },
      include: { doctor: true },
    });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    if (appointment.status === "CANCELLED") return reply.code(409).send({ error: "Cancelled appointments cannot be paid" });

    const existing = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT "id", "appointmentId", "amountMinor", "currency", "status", "provider", "checkoutUrl", "createdAt", "updatedAt"
      FROM "PaymentIntent" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
    `);
    if (existing[0]) return existing[0];

    const amountMinor = Math.round(Number(appointment.doctor.consultationPriceUsd) * 100);
    const intent = await provider.createPaymentIntent({
      appointmentId: appointment.id,
      amountMinor,
      currency: "usd",
      idempotencyKey: input.idempotencyKey,
      customerReference: user.patient.id,
    });

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PaymentIntent" ("id", "appointmentId", "patientId", "amountMinor", "currency", "status", "provider", "providerPaymentId", "idempotencyKey", "checkoutUrl")
      VALUES (${intent.id}, ${appointment.id}, ${user.patient.id}, ${intent.amountMinor}, ${intent.currency}, ${intent.status}, 'demo', ${intent.id}, ${input.idempotencyKey}, ${intent.checkoutUrl ?? null})
    `);
    return intent;
  });

  app.get("/v1/payments", async (request, reply) => {
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return null;
    await ensurePaymentTables();
    return prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT p."id", p."appointmentId", p."amountMinor", p."currency", p."status", p."provider", p."checkoutUrl", p."createdAt", p."updatedAt",
             a."scheduledAt", d."name" AS "doctorName", d."slug" AS "doctorSlug"
      FROM "PaymentIntent" p
      JOIN "Appointment" a ON a."id" = p."appointmentId"
      JOIN "Doctor" d ON d."id" = a."doctorId"
      WHERE p."patientId" = ${user.patient.id}
      ORDER BY p."createdAt" DESC
    `);
  });

  app.post("/v1/payments/webhook", async (request, reply) => {
    const signature = String(request.headers["x-carebridge-signature"] ?? "");
    const payload = JSON.stringify(request.body ?? {});
    if (!provider.verifyWebhookSignature(payload, signature)) return reply.code(401).send({ error: "Invalid webhook signature" });
    const event = webhookSchema.parse(request.body);
    await ensurePaymentTables();
    const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "PaymentWebhookEvent" WHERE "eventId" = ${event.eventId} LIMIT 1`);
    if (existing[0]) return { applied: false };

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PaymentWebhookEvent" ("id", "eventId", "paymentId", "type", "status", "occurredAt")
      VALUES (${`pwe_${event.eventId}`}, ${event.eventId}, ${event.paymentId}, ${event.type}, ${event.status}, ${new Date(event.occurredAt)})
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "PaymentIntent" SET "status" = ${event.status}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${event.paymentId} OR "providerPaymentId" = ${event.paymentId}
    `);
    return { applied: true, status: event.status };
  });
}
