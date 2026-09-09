import Fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const env = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
}).parse(process.env);

export const prisma = new PrismaClient();

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: env.CORS_ORIGIN });

  app.get("/health", async () => ({ status: "ok", service: "carebridge-api" }));

  app.get("/v1/specialties", async () => {
    return prisma.specialty.findMany({ orderBy: { name: "asc" } });
  });

  app.get("/v1/doctors", async (request) => {
    const query = z.object({
      specialty: z.string().optional(),
      q: z.string().trim().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(request.query);

    const doctors = await prisma.doctor.findMany({
      where: {
        isVerified: true,
        isActive: true,
        specialty: query.specialty ? { name: query.specialty } : undefined,
        ...(query.q ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { bio: { contains: query.q, mode: "insensitive" } },
          ],
        } : {}),
      },
      include: { specialty: true, costComparison: true },
      orderBy: [{ rating: "desc" }, { experienceYears: "desc" }],
      take: query.limit,
    });

    return doctors.map((doctor) => ({
      id: doctor.slug,
      name: doctor.name,
      initials: doctor.initials,
      specialty: doctor.specialty.name,
      location: doctor.location,
      rating: doctor.rating,
      experience: doctor.experienceYears,
      price: doctor.consultationPriceUsd,
      usLow: doctor.costComparison?.comparableLowUsd ?? null,
      usHigh: doctor.costComparison?.comparableHighUsd ?? null,
      expertise: doctor.expertise,
      bio: doctor.bio,
      verified: doctor.isVerified,
    }));
  });

  app.get("/v1/doctors/:slug", async (request, reply) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(request.params);
    const doctor = await prisma.doctor.findUnique({
      where: { slug },
      include: { specialty: true, costComparison: true },
    });

    if (!doctor || !doctor.isActive || !doctor.isVerified) {
      return reply.code(404).send({ error: "Doctor not found" });
    }

    return {
      id: doctor.slug,
      name: doctor.name,
      initials: doctor.initials,
      specialty: doctor.specialty.name,
      location: doctor.location,
      rating: doctor.rating,
      experience: doctor.experienceYears,
      price: doctor.consultationPriceUsd,
      usLow: doctor.costComparison?.comparableLowUsd ?? null,
      usHigh: doctor.costComparison?.comparableHighUsd ?? null,
      expertise: doctor.expertise,
      bio: doctor.bio,
      verified: doctor.isVerified,
      costComparison: doctor.costComparison ? {
        patientCountry: doctor.costComparison.patientCountry,
        comparableLowUsd: doctor.costComparison.comparableLowUsd,
        comparableHighUsd: doctor.costComparison.comparableHighUsd,
        sourceLabel: doctor.costComparison.sourceLabel,
        disclaimer: doctor.costComparison.disclaimer,
      } : null,
    };
  });

  app.addHook("onClose", async () => prisma.$disconnect());
  return app;
}

const app = await buildApp();
app.listen({ port: env.PORT, host: env.HOST });
