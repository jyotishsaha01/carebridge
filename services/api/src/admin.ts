import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification } from "./notificationsPrototype";
import { DoctorStateError, withLockedDoctor } from "./doctorState";

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
      prisma.careRequest.count({ where: { status: { in: ["REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED"] } } }),
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
    let doctor;
    try { doctor = await withLockedDoctor(doctorId, async (tx) => {
      if (verified) {
        const credentials = await tx.doctorCredential.findMany({ where: { doctorId }, select: { status: true } });
        if (!credentials.length || credentials.some((credential) => credential.status !== "APPROVED")) return null;
      }
      const updated = await tx.doctor.update({ where: { id: doctorId }, data: { isVerified: verified, isActive: verified, status: verified ? "VERIFIED" : "PENDING" }, select: { id: true, isVerified: true, isActive: true, status: true } });
      await recordAudit(request, { actorUserId: user.id, action: "ADMIN_DOCTOR_VERIFICATION", resourceType: "Doctor", resourceId: doctorId, outcome: "SUCCESS", metadata: { verified } }, tx);
      return updated;
    });
    } catch (error) {
      if (error instanceof DoctorStateError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
    if (!doctor) return reply.code(409).send({ error: "Review and approve every submitted doctor credential before verifying this profile." });
    try {
      const doctorUser = await prisma.user.findFirst({ where: { doctor: { id: doctorId } }, select: { id: true } });
      if (doctorUser) await createNotification({ userId: doctorUser.id, role: "DOCTOR", type: "SYSTEM", title: verified ? "Doctor profile verified" : "Doctor verification changed", body: verified ? "Your CareBridge provider profile has been verified and is active." : "Your CareBridge provider verification status has changed. Review your profile for details." });
    } catch { request.log.warn({ resourceType: "Doctor" }, "Verification committed; notification delivery failed"); }
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
    const reference = await prisma.doctorCredential.findUnique({ where: { id: credentialId }, select: { doctorId: true } });
    if (!reference) return reply.code(404).send({ error: "Credential not found" });
    let result;
    try { result = await withLockedDoctor(reference.doctorId, async (tx) => {
      const current = await tx.doctorCredential.findFirst({ where: { id: credentialId, doctorId: reference.doctorId } });
      if (!current) throw new DoctorStateError(404, "Credential not found");
      const credential = await tx.doctorCredential.update({ where: { id: credentialId }, data: { status: input.status, reviewedAt: new Date(), reviewedByUserId: user.id } });
      const credentials = await tx.doctorCredential.findMany({ where: { doctorId: credential.doctorId }, select: { status: true } });
      const allApproved = credentials.length > 0 && credentials.every((item) => item.status === "APPROVED");
      const anyRejected = credentials.some((item) => item.status === "REJECTED");
      const doctor = await tx.doctor.update({ where: { id: credential.doctorId }, data: { isVerified: allApproved, isActive: allApproved, status: allApproved ? "VERIFIED" : anyRejected ? "REJECTED" : "PENDING" }, select: { id: true, userId: true, isVerified: true } });
      await recordAudit(request, { actorUserId: user.id, action: "ADMIN_CREDENTIAL_REVIEWED", resourceType: "DoctorCredential", resourceId: credential.id, outcome: "SUCCESS", metadata: { status: input.status, doctorId: doctor.id, doctorVerified: doctor.isVerified } }, tx);
      return { credential, doctor, allApproved };
    });
    } catch (error) {
      if (error instanceof DoctorStateError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
    try {
      await createNotification({ userId: result.doctor.userId, role: "DOCTOR", type: "SYSTEM", title: result.allApproved ? "Doctor profile verified" : input.status === "REJECTED" ? "Doctor credential rejected" : "Doctor credential review updated", body: result.allApproved ? "Your credentials are approved and your verified profile is active." : "Your profile remains hidden until every submitted credential is approved. Review your credential details." });
    } catch { request.log.warn({ resourceType: "DoctorCredential" }, "Credential review committed; notification delivery failed"); }
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
