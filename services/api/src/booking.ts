import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";
import { AppointmentStateError, withLockedAppointment } from "./appointmentState";
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

  app.post("/v1/patient/appointments/:id/cancel", async (request, reply) => {
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return;
    const { id } = z.object({ id: z.string().trim().min(1) }).parse(request.params);
    const input = z.object({ reason: z.string().trim().max(1000).optional() }).parse(request.body ?? {});
    try {
      const appointment = await withLockedAppointment({ id, patientId: user.patient.id }, async (tx) => {
        const current = await tx.appointment.findFirst({
          where: { id, patientId: user.patient!.id },
          include: { doctor: { select: { id: true, name: true, userId: true } }, consultation: { select: { status: true } } },
        });
        if (!current) throw new AppointmentStateError(404, "Appointment not found");
        if (current.status !== "BOOKED" || current.scheduledAt <= new Date()) throw new AppointmentStateError(409, "Only future booked appointments can be cancelled");
        if (current.consultation && current.consultation.status !== "SCHEDULED") throw new AppointmentStateError(409, "A started or completed consultation cannot be cancelled");
        await tx.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
        await tx.consultation.updateMany({ where: { appointmentId: id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
        await tx.availabilitySlot.updateMany({ where: { doctorId: current.doctorId, startsAt: current.scheduledAt, status: "BOOKED" }, data: { status: "AVAILABLE" } });
        await recordAudit(request, {
          actorUserId: user.id, action: "PATIENT_APPOINTMENT_CANCELLED", resourceType: "Appointment", resourceId: id, outcome: "SUCCESS",
          metadata: { reason: input.reason ?? null, scheduledAt: current.scheduledAt.toISOString() },
        }, tx);
        return current;
      });
      try {
        await createNotification({ userId: user.id, role: "PATIENT", type: "CONSULTATION", title: "Appointment cancelled", body: "Your appointment with " + appointment.doctor.name + " on " + appointment.scheduledAt.toISOString() + " has been cancelled." });
        await createNotification({ userId: appointment.doctor.userId, role: "DOCTOR", type: "CONSULTATION", title: "Patient cancelled an appointment", body: "A patient cancelled their appointment scheduled for " + appointment.scheduledAt.toISOString() + (input.reason ? ". Reason: " + input.reason : ".") });
      } catch { request.log.warn({ appointmentId: id }, "Appointment cancellation notification failed"); }
      return { id, scheduledAt: appointment.scheduledAt.toISOString(), status: "CANCELLED" };
    } catch (error) {
      if (error instanceof AppointmentStateError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  app.put("/v1/patient/appointments/:id/reschedule", async (request, reply) => {
    const user = await requireRole(request, reply, ["PATIENT"]);
    if (!user?.patient) return;
    const { id } = z.object({ id: z.string().trim().min(1) }).parse(request.params);
    const input = z.object({ scheduledAt: z.coerce.date() }).parse(request.body);
    if (input.scheduledAt <= new Date()) return reply.code(400).send({ error: "Choose a future appointment time" });
    try {
      const { appointment, updatedAppointment } = await withLockedAppointment({ id, patientId: user.patient.id }, async (tx) => {
        const appointment = await tx.appointment.findFirst({
          where: { id, patientId: user.patient!.id },
          include: { doctor: { select: { id: true, name: true, userId: true } }, consultation: { select: { status: true } } },
        });
        if (!appointment) throw new AppointmentStateError(404, "Appointment not found");
        if (appointment.status !== "BOOKED" || appointment.scheduledAt <= new Date()) throw new AppointmentStateError(409, "Only future booked appointments can be rescheduled");
        if (appointment.scheduledAt.getTime() === input.scheduledAt.getTime()) throw new AppointmentStateError(409, "Choose a different available time");
        if (appointment.consultation && appointment.consultation.status !== "SCHEDULED") throw new AppointmentStateError(409, "A started or completed consultation cannot be rescheduled");
        const slot = await tx.availabilitySlot.findFirst({ where: { doctorId: appointment.doctorId, startsAt: input.scheduledAt, status: "AVAILABLE" } });
        if (!slot) throw new AppointmentStateError(409, "Selected time is no longer available");
        if (slot.endsAt.getTime() - slot.startsAt.getTime() < appointment.durationMin * 60_000) throw new AppointmentStateError(409, "Selected time slot is too short for this appointment");
        const claimed = await tx.availabilitySlot.updateMany({ where: { id: slot.id, status: "AVAILABLE", startsAt: { gt: new Date() } }, data: { status: "BOOKED" } });
        if (claimed.count !== 1) throw new AppointmentStateError(409, "Selected time is no longer available");
        const updatedAppointment = await tx.appointment.update({ where: { id }, data: { scheduledAt: input.scheduledAt }, select: { id: true, scheduledAt: true, durationMin: true, status: true } });
        await tx.availabilitySlot.updateMany({ where: { doctorId: appointment.doctorId, startsAt: appointment.scheduledAt, status: "BOOKED" }, data: { status: "AVAILABLE" } });
        await recordAudit(request, {
          actorUserId: user.id, action: "PATIENT_APPOINTMENT_RESCHEDULED", resourceType: "Appointment", resourceId: id, outcome: "SUCCESS",
          metadata: { from: appointment.scheduledAt.toISOString(), to: updatedAppointment.scheduledAt.toISOString() },
        }, tx);
        return { appointment, updatedAppointment };
      });
      const changeMessage = "Your appointment with " + appointment.doctor.name + " moved from " + appointment.scheduledAt.toISOString() + " to " + updatedAppointment.scheduledAt.toISOString() + ".";
      try {
        await createNotification({ userId: user.id, role: "PATIENT", type: "CONSULTATION", title: "Appointment rescheduled", body: changeMessage });
        await createNotification({ userId: appointment.doctor.userId, role: "DOCTOR", type: "CONSULTATION", title: "Patient rescheduled an appointment", body: changeMessage });
      } catch { request.log.warn({ appointmentId: id }, "Appointment reschedule notification failed"); }
      return { ...updatedAppointment, scheduledAt: updatedAppointment.scheduledAt.toISOString() };
    } catch (error) {
      if (error instanceof AppointmentStateError) return reply.code(error.statusCode).send({ error: error.message });
      if ((error as { code?: string }).code === "P2002") return reply.code(409).send({ error: "This time conflicts with another appointment. Choose another slot." });
      throw error;
    }
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
        const created = await tx.appointment.create({
          data: {
            patientId: user.patient!.id,
            doctorId: doctor.id,
            scheduledAt: input.scheduledAt,
            durationMin,
            status: "BOOKED",
          },
          select: { id: true, scheduledAt: true, durationMin: true, status: true },
        });
        await recordAudit(request, {
          actorUserId: user.id,
          action: "APPOINTMENT_BOOKED",
          resourceType: "Appointment",
          resourceId: created.id,
          outcome: "SUCCESS",
        }, tx);
        return created;
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
