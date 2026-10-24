import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification, notifyUsersByRole } from "./notificationsPrototype";

const bookingRequest = z.object({
  doctorSlug: z.string().min(1),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().min(15).max(90).default(30),
});

export async function registerBookingRoutes(app: FastifyInstance, allowDemoAuth: boolean) {
  app.get("/v1/doctors/:slug/availability", async (request, reply) => {
    const params = z.object({ slug: z.string().min(1) }).parse(request.params);
    const query = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(request.query);
    const doctor = await prisma.doctor.findFirst({
      where: { slug: params.slug, isActive: true, isVerified: true },
      select: { id: true },
    });
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    const slots = await prisma.availabilitySlot.findMany({
      where: { doctorId: doctor.id, startsAt: { gte: query.from, lt: query.to }, status: "AVAILABLE" },
      orderBy: { startsAt: "asc" },
    });
    return slots.map((slot) => ({
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      timezone: "UTC",
    }));
  });

  app.post("/v1/appointments", async (request, reply) => {
    const input = bookingRequest.parse(request.body);
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return;

    const doctor = await prisma.doctor.findFirst({
      where: { slug: input.doctorSlug, isActive: true, isVerified: true },
      select: { id: true, name: true },
    });
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    const slot = await prisma.availabilitySlot.findFirst({
      where: { doctorId: doctor.id, startsAt: input.scheduledAt, status: "AVAILABLE" },
    });
    if (!slot) return reply.code(409).send({ error: "Selected time is no longer available" });

    try {
      const appointment = await prisma.$transaction(async (tx) => {
        const claimed = await tx.availabilitySlot.updateMany({
          where: { id: slot.id, status: "AVAILABLE" },
          data: { status: "BOOKED" },
        });
        if (claimed.count !== 1) throw new Error("SLOT_ALREADY_BOOKED");
        return tx.appointment.create({
          data: {
            patientId: user.patient!.id,
            doctorId: doctor.id,
            scheduledAt: input.scheduledAt,
            durationMin: input.durationMin,
            status: "BOOKED",
          },
          select: { id: true, scheduledAt: true, durationMin: true, status: true },
        });
      });

      await recordAudit(request, {
        actorUserId: user.id,
        action: "APPOINTMENT_BOOKED",
        resourceType: "Appointment",
        resourceId: appointment.id,
        outcome: "SUCCESS",
      });

      const doctorUser = await prisma.user.findFirst({
        where: { doctor: { id: doctor.id } },
        select: { id: true },
      });

      await createNotification({
        userId: user.id,
        role: "PATIENT",
        type: "CONSULTATION",
        title: "Appointment confirmed",
        body: "Your consultation with " + doctor.name + " is scheduled for " + appointment.scheduledAt.toISOString() + ".",
      });

      await notifyUsersByRole("ADMIN", "CONSULTATION", "New appointment booked", "A patient has booked a new consultation with " + doctor.name + ".");

      if (doctorUser) {
        await createNotification({
          userId: doctorUser.id,
          role: "DOCTOR",
          type: "CONSULTATION",
          title: "New appointment booked",
          body: "A patient booked a consultation for " + appointment.scheduledAt.toISOString() + ".",
        });
      }

      return reply.code(201).send({
        id: appointment.id,
        scheduledAt: appointment.scheduledAt.toISOString(),
        durationMin: appointment.durationMin,
        status: appointment.status,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "SLOT_ALREADY_BOOKED") {
        return reply.code(409).send({ error: "Selected time is no longer available" });
      }
      throw error;
    }
  });
}
