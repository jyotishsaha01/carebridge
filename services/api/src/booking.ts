import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification, notifyUsersByRole } from "./notificationsPrototype";

const bookingRequest = z.object({
  doctorSlug: z.string().min(1),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().min(15).max(90).optional(),
});

export async function registerBookingRoutes(app: FastifyInstance, allowDemoAuth: boolean) {
  app.get("/v1/doctors/:slug/availability", async (request, reply) => {
    const params = z.object({ slug: z.string().min(1) }).parse(request.params);
    const query = z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine((range) => range.to > range.from && range.to.getTime() - range.from.getTime() <= 90 * 86400_000, { message: "Availability range must be between 1 and 90 days" }).parse(request.query);
    const doctor = await prisma.doctor.findFirst({
      where: { slug: params.slug, isActive: true, isVerified: true },
      select: { id: true },
    });
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    const slots = await prisma.availabilitySlot.findMany({
      where: { doctorId: doctor.id, startsAt: { gte: new Date(Math.max(query.from.getTime(), Date.now())), lt: query.to }, status: "AVAILABLE" },
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
    if (input.scheduledAt <= new Date()) return reply.code(400).send({ error: "Appointments must be scheduled in the future" });
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
    const durationMin = (slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000;
    if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 90 || (input.durationMin !== undefined && input.durationMin !== durationMin)) {
      return reply.code(409).send({ error: "The requested duration does not match the available slot" });
    }

    try {
      const appointment = await prisma.$transaction(async (tx) => {
        const claimed = await tx.availabilitySlot.updateMany({
          where: { id: slot.id, status: "AVAILABLE", startsAt: { gt: new Date() } },
          data: { status: "BOOKED" },
        });
        if (claimed.count !== 1) throw new Error("SLOT_ALREADY_BOOKED");
        return tx.appointment.create({
          data: {
            patientId: user.patient!.id,
            doctorId: doctor.id,
            scheduledAt: input.scheduledAt,
            durationMin,
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

      try {
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

      } catch {
        request.log.error({ appointmentId: appointment.id }, "Appointment notification delivery failed");
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
