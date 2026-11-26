import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  doctor: { id: "doctor-user", role: "DOCTOR", doctor: { id: "doctor-a" } },
  db: {
    patient: { findUnique: vi.fn() },
    appointment: { findFirst: vi.fn(), findMany: vi.fn() },
    medicalDocument: { findUnique: vi.fn(), findMany: vi.fn() },
    availabilitySlot: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
  readDocument: vi.fn(), audit: vi.fn(),
}));
vi.mock("./server", () => ({ prisma: mocks.db }));
vi.mock("./auth", () => ({ requireRole: vi.fn(async () => mocks.doctor), requireVerifiedDoctor: vi.fn(async () => mocks.doctor) }));
vi.mock("./audit", () => ({ recordAudit: mocks.audit }));
vi.mock("./notificationsPrototype", () => ({ createNotification: vi.fn(), notifyUsersByRole: vi.fn() }));
vi.mock("./documentStoragePrototype.js", () => ({ readDocument: mocks.readDocument }));
import { registerDocumentAccessRoutes } from "./documentAccess";
import { registerClinicalRoutes } from "./clinical";
import { registerDoctorOperationsRoutes } from "./doctorOperations";

const apps: ReturnType<typeof Fastify>[] = [];
async function app() {
  const instance = Fastify(); apps.push(instance);
  await registerDocumentAccessRoutes(instance);
  await registerClinicalRoutes(instance);
  await registerDoctorOperationsRoutes(instance);
  return instance;
}

beforeEach(() => {
  vi.resetAllMocks();
  const appointment = { id: "appointment-a", patientId: "patient", doctorId: "doctor-a", status: "BOOKED" };
  mocks.db.appointment.findFirst.mockImplementation(async ({ where }) => {
    if (where.id && where.id !== appointment.id) return null;
    if (where.patientId !== appointment.patientId || where.doctorId !== appointment.doctorId) return null;
    return appointment;
  });
  mocks.db.medicalDocument.findUnique.mockResolvedValue({ id: "document", patientId: "patient", appointmentId: "appointment-b", originalFileName: "private-other-visit.pdf", storageKey: "secret-storage-key" });
  mocks.db.medicalDocument.findMany.mockResolvedValue([]);
  mocks.db.appointment.findMany.mockResolvedValue([]);
  mocks.db.$transaction.mockImplementation(async (operation) => operation(mocks.db));
  mocks.readDocument.mockResolvedValue(Buffer.from("confidential document"));
});
afterEach(async () => { await Promise.all(apps.splice(0).map((instance) => instance.close())); });

describe("appointment-scoped clinical document access", () => {
  it.each(["/v1/doctor/documents/document", "/v1/doctor/documents/document/content"])("does not expose another clinician's attached document through %s", async (url) => {
    const response = await (await app()).inject(url);
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("private-other-visit");
    expect(response.body).not.toContain("secret-storage-key");
    expect(mocks.readDocument).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "DOCTOR_DOCUMENT_ACCESS_DENIED", outcome: "FAILURE" }));
  });

  it("permits metadata for the clinician's own appointment attachment", async () => {
    mocks.db.medicalDocument.findUnique.mockResolvedValue({ id: "document", patientId: "patient", appointmentId: "appointment-a", originalFileName: "owned-visit.pdf" });
    const response = await (await app()).inject("/v1/doctor/documents/document");
    expect(response.statusCode).toBe(200);
    expect(response.json().document.originalFileName).toBe("owned-visit.pdf");
  });

  it("keeps unassigned care-team documents available to a treating clinician", async () => {
    mocks.db.medicalDocument.findUnique.mockResolvedValue({ id: "document", patientId: "patient", appointmentId: null, originalFileName: "shared.pdf" });
    const response = await (await app()).inject("/v1/doctor/documents/document");
    expect(response.statusCode).toBe(200);
  });

  it("limits document lists to shared documents and this clinician's active appointment attachments", async () => {
    const response = await (await app()).inject("/v1/doctor/patients/patient/documents");
    expect(response.statusCode).toBe(200);
    expect(mocks.db.medicalDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: "patient", OR: [{ appointmentId: null }, { appointment: { doctorId: "doctor-a", status: { not: "CANCELLED" } } }] } }));
  });

  it("does not distinguish an unrelated patient from a missing one", async () => {
    mocks.db.appointment.findFirst.mockResolvedValue(null);
    const response = await (await app()).inject("/v1/doctor/patients/unrelated-patient/documents");
    expect(response.statusCode).toBe(404);
    expect(mocks.db.patient.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.medicalDocument.findMany).not.toHaveBeenCalled();
  });

  it("does not include cancelled appointments when returning nested intake and clinical notes", async () => {
    const response = await (await app()).inject("/v1/doctor/appointments");
    expect(response.statusCode).toBe(200);
    expect(mocks.db.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { doctorId: "doctor-a", status: { not: "CANCELLED" } } }));
  });
});

describe("availability concurrency integrity", () => {
  it("cannot delete an available slot if a booking claims it between lookup and deletion", async () => {
    mocks.db.availabilitySlot.findFirst.mockResolvedValue({ id: "slot", status: "AVAILABLE" });
    mocks.db.availabilitySlot.deleteMany.mockResolvedValue({ count: 0 });
    const response = await (await app()).inject({ method: "DELETE", url: "/v1/doctor/availability/slot" });
    expect(response.statusCode).toBe(409);
    expect(mocks.db.availabilitySlot.delete).not.toHaveBeenCalled();
    expect(mocks.db.availabilitySlot.deleteMany).toHaveBeenCalledWith({ where: { id: "slot", doctorId: "doctor-a", status: "AVAILABLE" } });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("checks overlaps and inserts new slots in a serializable transaction", async () => {
    mocks.db.availabilitySlot.findFirst.mockResolvedValue(null);
    mocks.db.availabilitySlot.create.mockResolvedValue({ id: "slot" });
    const response = await (await app()).inject({ method: "POST", url: "/v1/doctor/availability", payload: { startsAt: "2030-01-01T12:00:00Z", endsAt: "2030-01-01T12:30:00Z" } });
    expect(response.statusCode).toBe(201);
    expect(mocks.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("returns a safe conflict when concurrent availability writes fail serialization", async () => {
    mocks.db.$transaction.mockRejectedValue({ code: "P2034" });
    const response = await (await app()).inject({ method: "POST", url: "/v1/doctor/availability", payload: { startsAt: "2030-01-01T12:00:00Z", endsAt: "2030-01-01T12:30:00Z" } });
    expect(response.statusCode).toBe(409);
    expect(mocks.db.availabilitySlot.create).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
