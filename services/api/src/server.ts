import Fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { registerAuthRoutes } from "./auth";
import { registerBookingRoutes } from "./booking";
import { registerMedicalIntakeRoutes } from "./medicalIntake";
import { registerClinicalRoutes } from "./clinical";
import { registerDocumentRoutes } from "./documents";
import { registerPatientDashboardRoutes } from "./patientDashboard";
import { registerVideoRoutes } from "./video";
import { registerProductionReadiness } from "./productionReadiness";
import { registerAdminRoutes } from "./admin";
import { registerPaymentRoutes } from "./paymentRoutes";
import { registerCarePlatformRoutes } from "./carePlatform";
import { registerDoctorOperationsRoutes } from "./doctorOperations";
import { registerSupportRoutes } from "./support";
import { registerPatientRecordsRoutes } from "./patientRecords";
import { registerDocumentAccessRoutes } from "./documentAccess";
import { registerNotificationPrototypeRoutes } from "./notificationsRoutesPrototype";
import { registerSecurity, serializeRequestForLog, parseTrustedProxyCidrs } from "./security";
import { assertProductionDatabaseUrl } from "./runtimeConfig";

const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  CORS_ORIGIN: z.string().default("http://localhost:3000,http://localhost:3001,http://localhost:3002"),
  TRUSTED_PROXY_CIDRS: z.string().optional(),
  ALLOW_DEMO_AUTH: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
}).parse(process.env);
const allowedOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
export const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });

type PublicDoctor = Prisma.DoctorGetPayload<{ include: { specialty: true; costComparison: true } }>;
function serializeDoctor(doctor: PublicDoctor) {
  return {
    id: doctor.slug, slug: doctor.slug, name: doctor.name, initials: doctor.initials,
    specialty: doctor.specialty.name, location: doctor.location, rating: Number(doctor.rating),
    experience: doctor.experienceYears, price: Number(doctor.consultationPriceUsd),
    usLow: doctor.costComparison ? Number(doctor.costComparison.comparableLowUsd) : null,
    usHigh: doctor.costComparison ? Number(doctor.costComparison.comparableHighUsd) : null,
    expertise: doctor.expertise, bio: doctor.bio, verified: doctor.isVerified,
    isNew: doctor.createdAt >= new Date(Date.now() - 30 * 86400_000),
  };
}

export async function buildApp() {
  assertProductionDatabaseUrl(process.env.NODE_ENV === "production", process.env.DATABASE_URL);
  if (process.env.NODE_ENV === "production") {
    if (env.ALLOW_DEMO_AUTH) throw new Error("Demo authentication must be disabled in production");
    const invalidOrigins = allowedOrigins.some((origin) => {
      try { const url = new URL(origin); return url.origin !== origin || url.protocol !== "https:"; }
      catch { return true; }
    });
    if (!process.env.CORS_ORIGIN || allowedOrigins.length === 0 || invalidOrigins) throw new Error("Explicit HTTPS frontend origins are required in production");
  }

  const app = Fastify({
    logger: {
      redact: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']"],
      serializers: { req: serializeRequestForLog },
    },
    trustProxy: parseTrustedProxyCidrs(env.TRUSTED_PROXY_CIDRS),
    bodyLimit: 16 * 1024 * 1024,
    requestTimeout: 30_000,
  });
  registerSecurity(app, allowedOrigins);
  await app.register(cors, { origin: allowedOrigins, credentials: true, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] });
  app.get("/health", async () => ({ status: "ok", service: "carebridge-api" }));
  app.get("/v1/specialties", async () => prisma.specialty.findMany({ orderBy: { name: "asc" } }));
  app.get("/v1/doctors", async (request) => {
    const query = z.object({
      specialty: z.string().max(120).optional(), q: z.string().trim().min(1).max(200).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(request.query);
    const doctors = await prisma.doctor.findMany({
      where: {
        isVerified: true, isActive: true,
        specialty: query.specialty ? { name: query.specialty } : undefined,
        ...(query.q ? { OR: [{ name: { contains: query.q } }, { bio: { contains: query.q } }, { specialty: { name: { contains: query.q } } }] } : {}),
      },
      include: { specialty: true, costComparison: true },
      orderBy: [{ rating: "desc" }, { experienceYears: "desc" }], take: query.limit,
    });
    return doctors.map(serializeDoctor);
  });
  app.get("/v1/doctors/:slug", async (request, reply) => {
    const { slug } = z.object({ slug: z.string().min(1).max(200) }).parse(request.params);
    const doctor = await prisma.doctor.findUnique({ where: { slug }, include: { specialty: true, costComparison: true } });
    if (!doctor?.isActive || !doctor.isVerified) return reply.code(404).send({ error: "Doctor not found" });
    return {
      ...serializeDoctor(doctor),
      costComparison: doctor.costComparison ? {
        patientCountry: doctor.costComparison.patientCountry,
        comparableLowUsd: Number(doctor.costComparison.comparableLowUsd),
        comparableHighUsd: Number(doctor.costComparison.comparableHighUsd),
        sourceLabel: doctor.costComparison.sourceLabel, disclaimer: doctor.costComparison.disclaimer,
      } : null,
    };
  });

  await registerAuthRoutes(app);
  await registerBookingRoutes(app, env.ALLOW_DEMO_AUTH);
  await registerMedicalIntakeRoutes(app);
  await registerClinicalRoutes(app);
  await registerDocumentRoutes(app);
  await registerPatientDashboardRoutes(app);
  await registerPatientRecordsRoutes(app);
  await registerDocumentAccessRoutes(app);
  await registerNotificationPrototypeRoutes(app);
  registerProductionReadiness(app);
  await registerVideoRoutes(app);
  await registerAdminRoutes(app);
  await registerPaymentRoutes(app);
  await registerCarePlatformRoutes(app);
  await registerDoctorOperationsRoutes(app);
  await registerSupportRoutes(app);
  app.addHook("onClose", async () => prisma.$disconnect());
  return app;
}

async function start() {
  const app = await buildApp();
  const shutdown = async () => { await app.close(); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  await app.listen({ port: env.PORT, host: env.HOST });
}

// Importing buildApp for tests or tooling must never bind a network port.
if (require.main === module) {
  start().catch(async () => {
    console.error("CareBridge API failed to start. Check service configuration and database connectivity.");
    await prisma.$disconnect();
    process.exit(1);
  });
}
