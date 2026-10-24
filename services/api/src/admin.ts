import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification } from "./notificationsPrototype";

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireRole(request, reply, ["ADMIN"]);
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/v1/admin/overview", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const [patients, doctors, verifiedDoctors, appointments, openSessions, pendingCareRequests] = await Promise.all([
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.doctor.count({ where: { isVerified: true, isActive: true } }),
      prisma.appointment.count(),
      prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.careRequest.count({ where: { status: { in: ["REQUESTED", "REVIEWING"] } } }),
    ]);
    return { patients, doctors, verifiedDoctors, appointments, openSessions, pendingCareRequests };
  });

  app.get("/v1/admin/doctors", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = z.object({ verified: z.enum(["true", "false", "all"]).default("all") }).parse(request.query);
    const doctors = await prisma.doctor.findMany({
      where: query.verified === "all" ? undefined : { isVerified: query.verified === "true" },
      select: {
        id: true, name: true, slug: true, location: true, status: true, isVerified: true, isActive: true,
        specialty: { select: { name: true } },
        credentials: { where: { status: "PENDING" }, select: { id: true } },
      },
      orderBy: { name: "asc" },
    });
    return doctors.map(({ credentials, ...doctor }) => ({ ...doctor, pendingCredentials: credentials.length }));
  });

  app.post("/v1/admin/doctors/:doctorId/verification", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const { doctorId } = z.object({ doctorId: z.string().min(1) }).parse(request.params);
    const { verified } = z.object({ verified: z.boolean() }).parse(request.body);
    if (verified) {
      const credentials = await prisma.doctorCredential.findMany({ where: { doctorId }, select: { status: true } });
      if (credentials.length === 0 || credentials.some((credential) => credential.status !== "APPROVED")) {
        return reply.code(409).send({ error: "Review and approve every submitted doctor credential before verifying this profile." });
      }
    }
    const doctor = await prisma.doctor.update({ where: { id: doctorId }, data: { isVerified: verified, status: verified ? "VERIFIED" : "PENDING" }, select: { id: true, isVerified: true, status: true } });
    const doctorUser = await prisma.user.findFirst({ where: { doctor: { id: doctorId } }, select: { id: true } });
    if (doctorUser) await createNotification({ userId: doctorUser.id, role: "DOCTOR", type: "SYSTEM", title: verified ? "Doctor profile verified" : "Doctor verification changed", body: verified ? "Your CareBridge provider profile has been verified and is active." : "Your CareBridge provider verification status has changed. Review your profile for details." });
    await recordAudit(request, { actorUserId: user.id, action: "ADMIN_DOCTOR_VERIFICATION", resourceType: "Doctor", resourceId: doctorId, outcome: "SUCCESS", metadata: { verified } });
    return doctor;
  });

  app.get("/v1/admin/doctors/:doctorId/credentials", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const { doctorId } = z.object({ doctorId: z.string().min(1) }).parse(request.params);
    return prisma.doctorCredential.findMany({ where: { doctorId }, orderBy: { createdAt: "desc" } });
  });

  app.patch("/v1/admin/credentials/:credentialId", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const { credentialId } = z.object({ credentialId: z.string().min(1) }).parse(request.params);
    const input = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]) }).parse(request.body);
    const result = await prisma.$transaction(async (tx) => {
      const credential = await tx.doctorCredential.update({
        where: { id: credentialId },
        data: { status: input.status, reviewedAt: new Date(), reviewedByUserId: user.id },
      });
      const allCredentials = await tx.doctorCredential.findMany({ where: { doctorId: credential.doctorId }, select: { status: true } });
      const allApproved = allCredentials.length > 0 && allCredentials.every((item) => item.status === "APPROVED");
      const anyRejected = allCredentials.some((item) => item.status === "REJECTED");
      const doctor = await tx.doctor.update({
        where: { id: credential.doctorId },
        data: { isVerified: allApproved, status: allApproved ? "VERIFIED" : anyRejected ? "REJECTED" : "PENDING" },
        select: { id: true, name: true, userId: true, isVerified: true, status: true },
      });
      return { credential, doctor, allApproved };
    });
    const notificationBody = input.status === "REJECTED"
      ? "A submitted professional credential was rejected. Your profile remains hidden from patient search. Review your credential details and resubmit the corrected information."
      : input.status === "PENDING"
        ? "Your professional credential has been returned to pending review. Your profile will remain hidden until every required credential is approved."
        : result.allApproved
          ? "Your professional credentials have been approved and your verified doctor profile is now eligible to appear in patient search."
          : "A professional credential was approved. Any other submitted credentials must also be approved before your profile appears in patient search.";
    await createNotification({
      userId: result.doctor.userId,
      role: "DOCTOR",
      type: "SYSTEM",
      title: input.status === "REJECTED" ? "Doctor credential rejected" : input.status === "PENDING" ? "Doctor credential review reopened" : result.allApproved ? "Doctor profile verified" : "Doctor credential approved",
      body: notificationBody,
    });
    await recordAudit(request, {
      actorUserId: user.id,
      action: "ADMIN_CREDENTIAL_REVIEWED",
      resourceType: "DoctorCredential",
      resourceId: result.credential.id,
      outcome: "SUCCESS",
      metadata: { status: input.status, doctorId: result.doctor.id, doctorVerified: result.doctor.isVerified },
    });
    return result.credential;
  });

  app.get("/v1/admin/appointments", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = z.object({ status: z.string().trim().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return prisma.appointment.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { scheduledAt: "desc" },
      take: query.limit,
      include: { patient: { select: { id: true, firstName: true, lastName: true, country: true } }, doctor: { select: { id: true, name: true, specialty: { select: { name: true } } } }, consultation: { select: { id: true, status: true, startedAt: true, endedAt: true } } },
    });
  });

  app.get("/v1/admin/patients", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    const patients = await prisma.patient.findMany({
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: { id: true, firstName: true, lastName: true, country: true, createdAt: true, user: { select: { email: true, emailVerifiedAt: true } } },
    });
    return patients.map(({ user: patientUser, ...patient }) => ({
      ...patient,
      user: { email: patientUser.email, isEmailVerified: Boolean(patientUser.emailVerifiedAt) },
    }));
  });

  app.get("/v1/admin/sessions", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return prisma.session.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      take: query.limit,
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        user: { select: { email: true, role: true } },
      },
    });
  });

  app.get("/v1/admin/audit-logs", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = z.object({ action: z.string().trim().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return prisma.auditLog.findMany({
      where: query.action ? { action: query.action } : undefined,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: { id: true, actorUserId: true, action: true, resourceType: true, resourceId: true, outcome: true, metadata: true, createdAt: true },
    });
  });
}
