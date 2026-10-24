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

  app.post("/v1/patient/appointments/:id/cancel", async (request, reply) => {
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return;
    const { id } = z.object({ id: z.string().trim().min(1) }).parse(request.params);
    const input = z.object({ reason: z.string().trim().max(1000).optional() }).parse(request.body ?? {});
    const appointment = await prisma.appointment.findFirst({
      where: { id, patientId: user.patient.id },
      include: {
        doctor: { select: { id: true, name: true, userId: true } },
        consultation: { select: { status: true } },
      },
    });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    if (appointment.status !== "BOOKED") return reply.code(409).send({ error: "Only booked appointments can be cancelled" });
    if (appointment.scheduledAt <= new Date()) return reply.code(409).send({ error: "Past appointments cannot be cancelled" });
    if (appointment.consultation && ["IN_PROGRESS", "COMPLETED"].includes(appointment.consultation.status)) {
      return reply.code(409).send({ error: "A started or completed consultation cannot be cancelled" });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.appointment.updateMany({
          where: { id, patientId: user.patient!.id, status: "BOOKED", scheduledAt: { gt: new Date() } },
          data: { status: "CANCELLED" },
        });
        if (changed.count !== 1) throw new Error("APPOINTMENT_STATE_CHANGED");
        await tx.consultation.updateMany({
          where: { appointmentId: id, doctorId: appointment.doctorId, status: "SCHEDULED" },
          data: { status: "CANCELLED" },
        });
        await tx.availabilitySlot.updateMany({
          where: { doctorId: appointment.doctorId, startsAt: appointment.scheduledAt, status: "BOOKED" },
          data: { status: "AVAILABLE" },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "APPOINTMENT_STATE_CHANGED") {
        return reply.code(409).send({ error: "Appointment status changed. Refresh and try again." });
      }
      throw error;
    }

    await recordAudit(request, {
      actorUserId: user.id,
      action: "PATIENT_APPOINTMENT_CANCELLED",
      resourceType: "Appointment",
      resourceId: appointment.id,
      outcome: "SUCCESS",
      metadata: { reason: input.reason ?? null, scheduledAt: appointment.scheduledAt.toISOString() },
    });
    await createNotification({
      userId: user.id,
      role: "PATIENT",
      type: "CONSULTATION",
      title: "Appointment cancelled",
      body: "Your appointment with " + appointment.doctor.name + " on " + appointment.scheduledAt.toISOString() + " has been cancelled.",
    });
    await createNotification({
      userId: appointment.doctor.userId,
      role: "DOCTOR",
      type: "CONSULTATION",
      title: "Patient cancelled an appointment",
      body: "A patient cancelled their appointment scheduled for " + appointment.scheduledAt.toISOString() + (input.reason ? ". Reason: " + input.reason : "."),
    });
    return { id: appointment.id, scheduledAt: appointment.scheduledAt.toISOString(), status: "CANCELLED" };
  });

  app.put("/v1/patient/appointments/:id/reschedule", async (request, reply) => {
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return;
    const { id } = z.object({ id: z.string().trim().min(1) }).parse(request.params);
    const input = z.object({ scheduledAt: z.coerce.date() }).parse(request.body);
    const now = new Date();
    if (input.scheduledAt <= now) return reply.code(400).send({ error: "Choose a future appointment time" });

    const appointment = await prisma.appointment.findFirst({
      where: { id, patientId: user.patient.id },
      include: {
        doctor: { select: { id: true, name: true, userId: true } },
        consultation: { select: { status: true } },
      },
    });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    if (appointment.status !== "BOOKED") return reply.code(409).send({ error: "Only booked appointments can be rescheduled" });
    if (appointment.scheduledAt <= now) return reply.code(409).send({ error: "Past appointments cannot be rescheduled" });
    if (appointment.scheduledAt.getTime() === input.scheduledAt.getTime()) {
      return reply.code(400).send({ error: "Choose a different available time" });
    }
    if (appointment.consultation && ["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(appointment.consultation.status)) {
      return reply.code(409).send({ error: "A started or completed consultation cannot be rescheduled" });
    }

    const slot = await prisma.availabilitySlot.findFirst({
      where: { doctorId: appointment.doctorId, startsAt: input.scheduledAt, status: "AVAILABLE" },
    });
    if (!slot) return reply.code(409).send({ error: "Selected time is no longer available" });
    if (slot.endsAt.getTime() - slot.startsAt.getTime() < appointment.durationMin * 60_000) {
      return reply.code(409).send({ error: "Selected time slot is too short for this appointment" });
    }

    let updatedAppointment;
    try {
      updatedAppointment = await prisma.$transaction(async (tx) => {
        const claimed = await tx.availabilitySlot.updateMany({
          where: { id: slot.id, status: "AVAILABLE" },
          data: { status: "BOOKED" },
        });
        if (claimed.count !== 1) throw new Error("SLOT_ALREADY_BOOKED");

        const changed = await tx.appointment.updateMany({
          where: {
            id,
            patientId: user.patient!.id,
            status: "BOOKED",
            scheduledAt: appointment.scheduledAt,
          },
          data: { scheduledAt: input.scheduledAt },
        });
        if (changed.count !== 1) throw new Error("APPOINTMENT_STATE_CHANGED");

        await tx.availabilitySlot.updateMany({
          where: {
            doctorId: appointment.doctorId,
            startsAt: appointment.scheduledAt,
            status: "BOOKED",
          },
          data: { status: "AVAILABLE" },
        });
        return tx.appointment.findUniqueOrThrow({
          where: { id },
          select: { id: true, scheduledAt: true, durationMin: true, status: true },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "SLOT_ALREADY_BOOKED") {
        return reply.code(409).send({ error: "Selected time is no longer available" });
      }
      if (error instanceof Error && error.message === "APPOINTMENT_STATE_CHANGED") {
        return reply.code(409).send({ error: "Appointment status changed. Refresh and try again." });
      }
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
        return reply.code(409).send({ error: "This time conflicts with another appointment. Choose another slot." });
      }
      throw error;
    }

    await recordAudit(request, {
      actorUserId: user.id,
      action: "PATIENT_APPOINTMENT_RESCHEDULED",
      resourceType: "Appointment",
      resourceId: appointment.id,
      outcome: "SUCCESS",
      metadata: { from: appointment.scheduledAt.toISOString(), to: updatedAppointment.scheduledAt.toISOString() },
    });
    const changeMessage = "Your appointment with " + appointment.doctor.name + " moved from " + appointment.scheduledAt.toISOString() + " to " + updatedAppointment.scheduledAt.toISOString() + ".";
    await createNotification({
      userId: user.id,
      role: "PATIENT",
      type: "CONSULTATION",
      title: "Appointment rescheduled",
      body: changeMessage,
    });
    await createNotification({
      userId: appointment.doctor.userId,
      role: "DOCTOR",
      type: "CONSULTATION",
      title: "Patient rescheduled an appointment",
      body: changeMessage,
    });
    return {
      id: updatedAppointment.id,
      scheduledAt: updatedAppointment.scheduledAt.toISOString(),
      durationMin: updatedAppointment.durationMin,
      status: updatedAppointment.status,
    };
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
