import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Package only versions already installed by the preceding frozen-lockfile build.
// Legacy pnpm deploy re-resolves dependencies even when frozen mode is requested.
const source = fileURLToPath(new URL("../services/api/", import.meta.url));
const destination = process.argv[2];
if (!destination) throw new Error("Pass a new directory for the compiled API runtime.");
const artifact = resolve(destination);
if (existsSync(artifact) && readdirSync(artifact).length) throw new Error("The API artifact directory must be empty.");
const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
if (manifest.name !== "@carebridge/api" || !existsSync(join(source, "dist/server.js"))) throw new Error("Build the CareBridge API before packaging it.");
mkdirSync(artifact, { recursive: true });
cpSync(join(source, "dist"), join(artifact, "dist"), {
  recursive: true,
  filter: (path) => !/\.test\.(?:js|js\.map)$/.test(path) && !/^uat.*\.(?:js|js\.map)$/.test(path.split(sep).at(-1)),
});

function installedPackage(from, name) {
  for (let current = from; ; current = dirname(current)) {
    const candidate = join(current, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(current) === current) throw new Error(`Required installed dependency is missing: ${name}`);
  }
}
function linkPackage(parent, name, target) {
  const link = join(parent, "node_modules", name);
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(relative(dirname(link), target), link, "dir");
}
const copied = new Map();
const inventory = [];
function copyPackage(from, name) {
  const origin = installedPackage(from, name);
  if (copied.has(origin)) return copied.get(origin);
  const pkg = JSON.parse(readFileSync(join(origin, "package.json"), "utf8"));
  const target = join(artifact, "node_modules", ".runtime", String(copied.size), "node_modules", pkg.name);
  copied.set(origin, target); // Allocate before traversal so dependency cycles terminate.
  inventory.push({ name: pkg.name, version: pkg.version });
  cpSync(origin, target, {
    recursive: true, dereference: true,
    filter: (path) => !relative(origin, path).split(sep).includes("node_modules"),
  });
  // Optional peers include Prisma CLI and TypeScript; neither belongs in runtime.
  // Match the prior --no-optional packaging policy while retaining required peers.
  const requiredPeers = Object.fromEntries(Object.entries(pkg.peerDependencies ?? {}).filter(([peer]) => !pkg.peerDependenciesMeta?.[peer]?.optional));
  for (const dependency of Object.keys({ ...requiredPeers, ...pkg.dependencies })) {
    linkPackage(target, dependency, copyPackage(origin, dependency));
  }
  return target;
}
for (const dependency of Object.keys(manifest.dependencies ?? {})) {
  linkPackage(artifact, dependency, copyPackage(source, dependency));
}

// The generated Prisma client and platform engine are outside @prisma/client.
const sourceClient = resolve(installedPackage(source, "@prisma/client"), "../../.prisma/client");
if (!existsSync(join(sourceClient, "default.js"))) throw new Error("Generate the Prisma client before packaging the API.");
const artifactClient = join(artifact, "node_modules", ".prisma", "client");
mkdirSync(dirname(artifactClient), { recursive: true });
cpSync(sourceClient, artifactClient, { recursive: true });
writeFileSync(join(artifact, "package.json"), JSON.stringify({
  name: manifest.name, version: manifest.version, private: true,
  scripts: { start: "node dist/server.js" }, dependencies: manifest.dependencies,
}, null, 2) + "\n");
writeFileSync(join(artifact, "runtime-dependencies.json"), JSON.stringify(inventory.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)), null, 2) + "\n");
console.log(`Prepared standalone API runtime with ${copied.size} installed production packages at ${artifact}`);
