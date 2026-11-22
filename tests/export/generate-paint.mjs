#!/usr/bin/env node
// From app/: node ../tests/export/generate-paint.mjs <output-directory>
// Vite loads the current TypeScript sources; no unit test or archived Python supplies artifacts.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const appDir = path.join(repoRoot, "app");
const [output, ...extra] = process.argv.slice(2);
if (!output || extra.length > 0) {
  console.error(
    "Usage: node tests/export/generate-paint.mjs <output-directory>",
  );
  process.exit(1);
}

const require = createRequire(path.join(appDir, "package.json"));
const { createServer } = await import(
  pathToFileURL(require.resolve("vite")).href
);
const server = await createServer({
  configFile: false,
  root: appDir,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, fs: { allow: [repoRoot] } },
});
try {
  const { generatePaintArtifacts } = await server.ssrLoadModule(
    path.join(here, "paintArtifacts.ts"),
  );
  const directory = path.resolve(output);
  const manifest = generatePaintArtifacts(directory);
  for (const target of ["ce", "gl"]) {
    const { paint, namespace } = manifest[target];
    console.log(
      `${target}: generated ${paint.length} paint + ${namespace.length} namespace cases`,
    );
  }
  console.log(`Artifacts: ${directory}`);
} finally {
  await server.close();
}
