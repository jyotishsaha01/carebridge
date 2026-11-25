import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const destination = process.argv[2];
if (!destination) throw new Error("Pass the directory created by pnpm deploy --prod --no-optional --ignore-scripts.");
const artifact = resolve(destination);
const manifestPath = join(artifact, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.name !== "@carebridge/api" || !existsSync(join(artifact, "dist/server.js"))) {
  throw new Error("The destination must contain the compiled CareBridge API package.");
}

// pnpm deploy copies installed dependencies, but Prisma's generated client lives
// beside @prisma/client and must be carried over explicitly after generation.
const sourceRequire = createRequire(new URL("../services/api/package.json", import.meta.url));
const artifactRequire = createRequire(manifestPath);
const sourceClient = resolve(dirname(sourceRequire.resolve("@prisma/client/package.json")), "../../.prisma/client");
const artifactClient = resolve(dirname(artifactRequire.resolve("@prisma/client/package.json")), "../../.prisma/client");
if (!existsSync(join(sourceClient, "default.js"))) throw new Error("Generate the Prisma client before packaging the API.");
mkdirSync(dirname(artifactClient), { recursive: true });
cpSync(sourceClient, artifactClient, { recursive: true });

// The standalone runtime does not offer development or migration commands.
writeFileSync(manifestPath, JSON.stringify({
  name: manifest.name,
  version: manifest.version,
  private: true,
  scripts: { start: "node dist/server.js" },
  dependencies: manifest.dependencies,
}, null, 2) + "\n");
console.log(`Prepared standalone API runtime at ${artifact}`);
