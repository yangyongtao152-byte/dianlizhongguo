import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const sourceModules = path.join(projectRoot, "node_modules");
const stageRoot = path.join(projectRoot, "harness-runtime-stage");
// Keep node_modules one level below the FileSet root. electron-builder
// intentionally refuses to traverse a root-level node_modules directory.
const stageModules = path.join(stageRoot, "r", "node_modules");

function packageDirectory(anchor, packageName) {
  for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
    const candidate = path.join(searchPath, packageName);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
  }
  return null;
}

async function collectRuntimePackages() {
  const queue = [path.join(sourceModules, "@deepseek-ai", "dsh")];
  const packages = new Map();

  while (queue.length) {
    const directory = queue.shift();
    const manifestPath = path.join(directory, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const identity = `${manifest.name}@${manifest.version}:${directory}`;
    if (packages.has(identity)) continue;
    packages.set(identity, directory);

    const names = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    for (const name of names) {
      const dependency = packageDirectory(manifestPath, name);
      if (dependency) queue.push(dependency);
    }
  }
  return [...packages.values()];
}

const resolvedStage = path.resolve(stageRoot);
if (
  path.dirname(resolvedStage) !== projectRoot ||
  path.basename(resolvedStage) !== "harness-runtime-stage"
) {
  throw new Error(`Refusing to replace unexpected staging path: ${resolvedStage}`);
}

await rm(resolvedStage, { recursive: true, force: true });
await mkdir(stageModules, { recursive: true });
const packages = await collectRuntimePackages();

for (const source of packages) {
  const relative = path.relative(sourceModules, source);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Harness dependency escaped node_modules: ${source}`);
  }
  const destination = path.join(stageModules, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    force: true,
    verbatimSymlinks: false,
  });
}

const runtime = path.join(
  stageModules,
  "@deepseek-ai",
  "dsh",
  "lib",
  "bin.js",
);
const runtimeStat = await stat(runtime);
if (!runtimeStat.isFile()) throw new Error("Staged Harness runtime is incomplete.");
console.log(`Staged ${packages.length} Harness packages in ${resolvedStage}`);
