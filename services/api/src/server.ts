import Fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import { registerAuthRoutes } from "./auth";
import { registerBookingRoutes } from "./booking";
import { registerMedicalIntakeRoutes } from "./medical-intake";
import { registerClinicalRoutes } from "./clinical";
import { registerDocumentRoutes } from "./documents";
import { env } from "./env";

const prisma = new PrismaClient();

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.addHook("onClose", async () => prisma.$disconnect());

  await registerAuthRoutes(app, prisma, env.ALLOW_DEMO_AUTH);
  await registerBookingRoutes(app, prisma, env.ALLOW_DEMO_AUTH);
  await registerMedicalIntakeRoutes(app, prisma, env.ALLOW_DEMO_AUTH);
  await registerClinicalRoutes(app, prisma, env.ALLOW_DEMO_AUTH);
  await registerDocumentRoutes(app, prisma, env.ALLOW_DEMO_AUTH);

  return app;
}

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  void start();
}
