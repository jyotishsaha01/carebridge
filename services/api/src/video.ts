import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthenticatedUser } from "./auth";
import { prisma } from "./server";

const env = z.object({
  VIDEO_PROVIDER: z.string().default("unconfigured"),
}).parse(process.env);

export async function registerVideoRoutes(app: FastifyInstance) {
  app.get("/v1/patient/appointments/:id/video", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.patient) return reply.code(401).send({ error: "Patient authentication required" });

    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const appointment = await prisma.appointment.findFirst({
      where: { id, patientId: user.patient.id },
      include: { consultation: true },
    });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    if (!appointment.consultation) return reply.code(409).send({ error: "Consultation is not ready for video" });

    const now = new Date();
    const expiresAt = new Date(appointment.scheduledAt.getTime() + (appointment.durationMin + 30) * 60_000);
    const providerConfigured = env.VIDEO_PROVIDER !== "unconfigured";

    return {
      appointmentId: appointment.id,
      consultationId: appointment.consultation.id,
      provider: env.VIDEO_PROVIDER,
      status: providerConfigured ? "READY_FOR_PROVISIONING" : "NOT_PROVISIONED",
      roomName: `carebridge-${appointment.id}`,
      scheduledAt: appointment.scheduledAt,
      canJoin: providerConfigured && appointment.scheduledAt <= now && now < expiresAt,
      expiresAt,
      message: providerConfigured
        ? "Video provider is configured; production room provisioning will supply a short-lived join credential."
        : "Video provider is not configured in this environment. No join URL or credential is exposed.",
    };
  });
}
