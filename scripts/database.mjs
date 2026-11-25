import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, openSync, closeSync } from "node:fs";
import { dirname, resolve } from "node:path";

const action = process.argv[2];
const cwd = fileURLToPath(new URL("../database/", import.meta.url));
const production = action?.endsWith(":production");
const env = { ...process.env };
if (!production) {
  env.DATABASE_URL ??= "file:./dev.db";
  if (!env.DATABASE_URL.startsWith("file:")) {
    throw new Error("Local commands require a SQLite file: DATABASE_URL. Use the :production commands for PostgreSQL.");
  }
}
const schema = production ? "prisma/production/schema.prisma" : "prisma/schema.prisma";
const allowed = new Set(["generate", "push", "setup", "reset", "generate:production", "deploy:production", "status:production", "drift:production"]);
if (!allowed.has(action)) throw new Error(`Unknown database action: ${action}`);
if (!production && (env.NODE_ENV === "production" || env.APP_ENV === "production")) {
  throw new Error("Local database commands are disabled in production. Use db:deploy:production.");
}
if (production && action !== "generate:production" && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL ?? "")) {
  throw new Error("An explicit PostgreSQL DATABASE_URL is required for production migrations.");
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (production) run(process.execPath, ["../scripts/prepare-production-schema.mjs", "--check"]);
const prisma = (...args) => run("pnpm", ["exec", "prisma", ...args, "--schema", schema]);
if (action.startsWith("generate")) prisma("generate");
if (action === "deploy:production") prisma("migrate", "deploy");
if (action === "status:production") prisma("migrate", "status");
if (action === "drift:production") run("pnpm", ["exec", "prisma", "migrate", "diff", "--from-schema-datasource", schema, "--to-schema-datamodel", schema, "--exit-code"]);
if (["push", "setup", "reset"].includes(action)) {
  // Prisma 6's SQLite engine can fail with an opaque error for a missing file.
  // Create it without truncating an existing database before applying the model.
  const databasePath = resolve(cwd, "prisma", decodeURIComponent(env.DATABASE_URL.slice(5).split("?")[0]));
  mkdirSync(dirname(databasePath), { recursive: true });
  closeSync(openSync(databasePath, "a", 0o600));
  // Never reset implicitly; only the explicitly named local reset command is destructive.
  prisma("generate");
  prisma("db", "push", ...(action === "reset" ? ["--force-reset"] : []));
  if (action !== "push") run("pnpm", ["exec", "tsx", "prisma/seed.ts"]);
}
