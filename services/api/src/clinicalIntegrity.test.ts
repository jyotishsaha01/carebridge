import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { id: "actor", role: "DOCTOR", doctor: { id: "doctor" }, patient: { id: "patient", userId: "actor" } },
  state: { verified: false, credential: "PENDING", consultation: "SCHEDULED", notes: 0, prescriptionItems: ["original"], followUps: 0 },
  appointment: {} as any,
  consultation: {} as any,
  notification: vi.fn(),
  db: {
    doctor: { update: vi.fn(), updateMany: vi.fn() }, doctorCredential: { update: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findFirst: vi.fn() }, patient: { findUnique: vi.fn() },
    appointment: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() }, consultation: { findFirst: vi.fn(), upsert: vi.fn() },
    clinicalNote: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() }, prescription: { upsert: vi.fn() }, prescriptionItem: { deleteMany: vi.fn() },
    followUp: { create: vi.fn() }, medicalIntake: { upsert: vi.fn() },
    auditLog: { create: vi.fn() }, $transaction: vi.fn(),
  },
}));
vi.mock("./server", () => ({ prisma: mocks.db }));
vi.mock("./auth", () => ({ requireRole: vi.fn(async () => mocks.actor), requireVerifiedDoctor: vi.fn(async () => mocks.actor) }));
vi.mock("./notificationsPrototype", () => ({ createNotification: mocks.notification }));
import { registerAdminRoutes } from "./admin";
import { registerClinicalRoutes } from "./clinical";
import { registerMedicalIntakeRoutes } from "./medicalIntake";
import { registerDoctorOperationsRoutes } from "./doctorOperations";

const apps: ReturnType<typeof Fastify>[] = [];
async function app() {
  const instance = Fastify(); apps.push(instance);
  await registerAdminRoutes(instance); await registerClinicalRoutes(instance); await registerMedicalIntakeRoutes(instance);
  return instance;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.role = "DOCTOR";
  Object.assign(mocks.state, { verified: false, credential: "PENDING", consultation: "SCHEDULED", notes: 0, prescriptionItems: ["original"], followUps: 0 });
  const consent = { consentToConsult: true, status: "COMPLETED" };
  mocks.appointment = { id: "appointment", doctorId: "doctor", patientId: "patient", status: "BOOKED", medicalIntake: consent, consultation: null };
  mocks.consultation = { id: "consultation", doctorId: "doctor", patientId: "patient", status: "IN_PROGRESS", appointment: { medicalIntake: consent } };
  mocks.db.appointment.findFirst.mockImplementation(async ({ where }) => where.id === "appointment" && (where.doctorId === "doctor" || where.patientId === "patient") ? mocks.appointment : null);
  mocks.db.appointment.findMany.mockResolvedValue([]);
  mocks.db.appointment.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.appointment.update.mockResolvedValue({ id: "appointment" });
  mocks.db.doctor.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.doctorCredential.findMany.mockResolvedValue([{ status: "APPROVED" }]);
  mocks.db.doctorCredential.findUnique.mockResolvedValue({ doctorId: "doctor" });
  mocks.db.doctorCredential.findFirst.mockResolvedValue({ id: "credential", doctorId: "doctor" });
  mocks.db.clinicalNote.findFirst.mockResolvedValue(null);
  mocks.db.consultation.findFirst.mockImplementation(async ({ where }) => where.id === "consultation" && where.doctorId === "doctor" ? mocks.consultation : null);
  mocks.db.doctor.update.mockImplementation(async ({ data }) => { mocks.state.verified = data.isVerified; return { id: "doctor", ...data }; });
  mocks.db.doctorCredential.update.mockImplementation(async ({ data }) => { mocks.state.credential = data.status; return { id: "credential", ...data }; });
  mocks.db.consultation.upsert.mockImplementation(async ({ update }) => { mocks.state.consultation = update.status; return { id: "consultation", patientId: "patient", ...update }; });
  mocks.db.clinicalNote.create.mockImplementation(async () => { mocks.state.notes++; return { id: "note" }; });
  mocks.db.prescriptionItem.deleteMany.mockImplementation(async () => { mocks.state.prescriptionItems = []; return { count: 1 }; });
  mocks.db.prescription.upsert.mockImplementation(async ({ update }) => { mocks.state.prescriptionItems = update.items.create.map((item: any) => item.medication); return { id: "prescription", items: update.items.create }; });
  mocks.db.followUp.create.mockImplementation(async () => { mocks.state.followUps++; return { id: "follow-up" }; });
  mocks.db.auditLog.create.mockResolvedValue({ id: "audit" });
  mocks.db.patient.findUnique.mockResolvedValue({ userId: "patient-user" });
  mocks.db.user.findFirst.mockResolvedValue({ id: "doctor-user" });
  // Model database rollback so a regression that audits after the transaction
  // leaves an observable committed mutation and fails the route-level checks.
  mocks.db.$transaction.mockImplementation(async (operation) => {
    const snapshot = structuredClone(mocks.state);
    try { return await operation(mocks.db); }
    catch (error) { Object.assign(mocks.state, snapshot); throw error; }
  });
});
afterEach(async () => { await Promise.all(apps.splice(0).map((instance) => instance.close())); });

const clinicalRequests = [
  { method: "PUT" as const, url: "/v1/doctor/appointments/appointment/consultation", payload: { status: "IN_PROGRESS" } },
  { method: "PUT" as const, url: "/v1/doctor/consultations/consultation/note", payload: { assessment: "Synthetic finding" } },
  { method: "PUT" as const, url: "/v1/doctor/consultations/consultation/prescription", payload: { items: [{ medication: "Synthetic medication" }] } },
  { method: "POST" as const, url: "/v1/doctor/consultations/consultation/follow-up", payload: { instructions: "Synthetic follow-up" } },
];

describe("clinical consent and record integrity", () => {
  it("keeps unsubmitted draft symptoms out of the clinician's appointment response", async () => {
    mocks.db.appointment.findMany.mockResolvedValue([{ id: "appointment", status: "BOOKED", medicalIntake: { status: "DRAFT", consentToConsult: false, symptoms: "private-unsubmitted-draft-symptoms" } }]);
    const response = await (await app()).inject("/v1/doctor/appointments");
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject({ id: "appointment", status: "BOOKED", medicalIntake: null });
    expect(response.body).not.toContain("private-unsubmitted-draft-symptoms");
  });

  it("makes submitted intake available for the authorized encounter", async () => {
    mocks.db.appointment.findMany.mockResolvedValue([{ id: "appointment", medicalIntake: { status: "COMPLETED", consentToConsult: true, symptoms: "Synthetic submitted symptom" } }]);
    const response = await (await app()).inject("/v1/doctor/appointments");
    expect(response.statusCode).toBe(200);
    expect(response.json()[0].medicalIntake.symptoms).toBe("Synthetic submitted symptom");
  });

  it.each(clinicalRequests)("requires completed explicit patient consent for $url", async (request) => {
    mocks.appointment.medicalIntake = { consentToConsult: false, status: "DRAFT" };
    mocks.consultation.appointment.medicalIntake = mocks.appointment.medicalIntake;
    const response = await (await app()).inject(request);
    expect(response.statusCode).toBe(409);
    expect(mocks.db.consultation.upsert).not.toHaveBeenCalled();
    expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([null, { consentToConsult: true, status: "DRAFT" }])("does not accept missing or draft intake as consent", async (intake) => {
    mocks.appointment.medicalIntake = intake;
    const response = await (await app()).inject(clinicalRequests[0]);
    expect(response.statusCode).toBe(409);
    expect(mocks.db.consultation.upsert).not.toHaveBeenCalled();
  });

  it.each(["IN_PROGRESS", "COMPLETED", "CANCELLED"])("protects intake facts once consultation status is %s", async (consultationStatus) => {
    mocks.actor.role = "PATIENT";
    mocks.appointment.consultation = { status: consultationStatus };
    const response = await (await app()).inject({ method: "PUT", url: "/v1/appointments/appointment/intake", payload: { symptoms: "overwrite", consentToConsult: false } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("correction");
    expect(mocks.db.medicalIntake.upsert).not.toHaveBeenCalled();
  });

  it.each(["IN_PROGRESS", "COMPLETED", "CANCELLED"])("does not reopen editable intake for an established %s consultation", async (consultationStatus) => {
    mocks.appointment.consultation = { status: consultationStatus };
    const response = await (await app()).inject({ method: "PUT", url: "/v1/doctor/appointments/appointment/consultation", payload: { status: "SCHEDULED" } });
    expect(response.statusCode).toBe(409);
    expect(mocks.db.consultation.upsert).not.toHaveBeenCalled();
  });

  it("protects historical intake when a legacy scheduled record already contains care timestamps", async () => {
    mocks.actor.role = "PATIENT";
    mocks.appointment.consultation = { status: "SCHEDULED", startedAt: new Date("2026-01-01T10:00:00Z") };
    const response = await (await app()).inject({ method: "PUT", url: "/v1/appointments/appointment/intake", payload: { consentToConsult: false } });
    expect(response.statusCode).toBe(409);
    expect(mocks.db.medicalIntake.upsert).not.toHaveBeenCalled();
  });

  it.each(clinicalRequests.slice(1))("does not write $url before the scheduled consultation starts", async (request) => {
    mocks.consultation.status = "SCHEDULED";
    const response = await (await app()).inject(request);
    expect(response.statusCode).toBe(409);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns a sanitized conflict for a database write conflict on the appointment lock", async () => {
    mocks.db.appointment.updateMany.mockRejectedValue({ code: "P2034", message: "sensitive database transaction detail" });
    const response = await (await app()).inject(clinicalRequests[0]);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("Refresh");
    expect(response.body).not.toContain("sensitive database");
    expect(mocks.db.consultation.upsert).not.toHaveBeenCalled();
  });

  it("preserves the original care-start timestamp on repeated saves", async () => {
    mocks.appointment.consultation = { status: "IN_PROGRESS", startedAt: new Date("2026-01-01T10:00:00Z"), endedAt: null };
    const response = await (await app()).inject(clinicalRequests[0]);
    expect(response.statusCode).toBe(200);
    expect(mocks.db.consultation.upsert.mock.calls[0][0].update.startedAt).toBeUndefined();
  });

  it("preserves the original care-completion timestamp when saving a completed summary", async () => {
    mocks.appointment.consultation = { status: "COMPLETED", startedAt: new Date("2026-01-01T10:00:00Z"), endedAt: new Date("2026-01-01T10:30:00Z") };
    const response = await (await app()).inject({ method: "PUT", url: "/v1/doctor/appointments/appointment/consultation", payload: { status: "COMPLETED", summary: "Synthetic corrected summary" } });
    expect(response.statusCode).toBe(200);
    expect(mocks.db.consultation.upsert.mock.calls[0][0].update.endedAt).toBeUndefined();
  });

  it("rejects writes to another clinician's consultation before mutations", async () => {
    const response = await (await app()).inject({ ...clinicalRequests[1], url: "/v1/doctor/consultations/another-consultation/note" });
    expect(response.statusCode).toBe(404);
    expect(mocks.db.clinicalNote.create).not.toHaveBeenCalled();
  });
});

describe("atomic clinical and privilege-change audit", () => {
  it.each(clinicalRequests)("rolls back $url if its audit insert fails", async (request) => {
    const before = structuredClone(mocks.state);
    mocks.db.auditLog.create.mockRejectedValue(new Error("synthetic audit failure"));
    const response = await (await app()).inject(request);
    expect(response.statusCode).toBe(500);
    expect(mocks.state).toEqual(before);
    expect(mocks.db.$transaction).toHaveBeenCalledOnce();
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it.each([
    { method: "POST" as const, url: "/v1/admin/doctors/doctor/verification", payload: { verified: true } },
    { method: "PATCH" as const, url: "/v1/admin/credentials/credential", payload: { status: "APPROVED" } },
  ])("rolls back $url if its audit insert fails", async (request) => {
    mocks.actor.role = "ADMIN";
    mocks.db.auditLog.create.mockRejectedValue(new Error("synthetic audit failure"));
    const response = await (await app()).inject(request);
    expect(response.statusCode).toBe(500);
    expect(mocks.state.verified).toBe(false);
    expect(mocks.state.credential).toBe("PENDING");
    expect(mocks.db.$transaction).toHaveBeenCalledOnce();
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it("commits an audited provider verification even if subsequent notification delivery fails", async () => {
    mocks.actor.role = "ADMIN";
    mocks.notification.mockRejectedValue(new Error("synthetic notification outage"));
    const response = await (await app()).inject({ method: "POST", url: "/v1/admin/doctors/doctor/verification", payload: { verified: true } });
    expect(response.statusCode).toBe(200);
    expect(mocks.state.verified).toBe(true);
    expect(mocks.db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "ADMIN_DOCTOR_VERIFICATION", actorUserId: "actor", resourceId: "doctor", metadata: { verified: true } }) }));
  });

  it("does not report a failed prescription save after an audited commit when notifications are unavailable", async () => {
    mocks.notification.mockRejectedValue(new Error("synthetic notification outage"));
    const response = await (await app()).inject(clinicalRequests[2]);
    expect(response.statusCode).toBe(200);
    expect(mocks.state.prescriptionItems).toEqual(["Synthetic medication"]);
    expect(mocks.db.auditLog.create).toHaveBeenCalledOnce();
  });
});


describe("doctor credential state serialization", () => {
  it("reads authoritative credential states after acquiring the shared doctor lock", async () => {
    mocks.actor.role = "ADMIN";
    // A submission commits while verification waits for this row lock.
    mocks.db.doctor.updateMany.mockImplementation(async () => {
      mocks.db.doctorCredential.findMany.mockResolvedValue([{ status: "APPROVED" }, { status: "PENDING" }]);
      return { count: 1 };
    });
    const response = await (await app()).inject({ method: "POST", url: "/v1/admin/doctors/doctor/verification", payload: { verified: true } });
    expect(response.statusCode).toBe(409);
    expect(mocks.db.doctor.update).not.toHaveBeenCalled();
    expect(mocks.state.verified).toBe(false);
  });

  it("refetches a reviewed credential under its locked doctor before modifying it", async () => {
    mocks.actor.role = "ADMIN";
    mocks.db.doctorCredential.findFirst.mockResolvedValue(null);
    const response = await (await app()).inject({ method: "PATCH", url: "/v1/admin/credentials/credential", payload: { status: "APPROVED" } });
    expect(response.statusCode).toBe(404);
    expect(mocks.db.doctorCredential.findFirst).toHaveBeenCalledWith({ where: { id: "credential", doctorId: "doctor" } });
    expect(mocks.db.doctorCredential.update).not.toHaveBeenCalled();
  });

  it("locks the same doctor before resubmission reads or credential mutations", async () => {
    const instance = await app(); await registerDoctorOperationsRoutes(instance);
    const response = await instance.inject({ method: "POST", url: "/v1/doctor/credentials", payload: { type: "LICENSE", licenseNumber: "SYNTHETIC-123", jurisdiction: "Test jurisdiction" } });
    expect(response.statusCode).toBe(200);
    expect(mocks.db.doctor.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.db.doctorCredential.findFirst.mock.invocationCallOrder[0]);
    expect(mocks.state.verified).toBe(false);
    expect(mocks.db.doctor.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isVerified: false, isActive: false, status: "PENDING" } }));
  });
});
