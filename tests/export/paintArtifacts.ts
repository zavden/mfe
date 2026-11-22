/* Generate the complete current-source paint and namespace matrix without invoking Vitest.
 * The manifest is written last, so the native probe can reject missing or extra artifacts. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Target } from "../../app/src/model";
import { namespaceCases } from "./namespaceCases";
import { paintCases, type PaintCase } from "./paintCases";
import { preparePaintCase, samplePaintCase } from "./paintFixture";

export function generatePaintArtifacts(directory: string) {
  const manifest: Record<Target, { paint: string[]; namespace: string[] }> = {
    ce: { paint: [], namespace: [] },
    gl: { paint: [], namespace: [] },
  };
  mkdirSync(directory, { recursive: true });
  rmSync(join(directory, "manifest.json"), { force: true });
  for (const target of ["ce", "gl"] as const) {
    const fixtures = [
      ...paintCases(target),
      ...namespaceCases(target, "object").map(({ fixture }) => fixture),
      ...namespaceCases(target, "scene").map(({ fixture }) => fixture),
    ];
    for (const fixture of fixtures) {
      const name = `${fixture.name}-${target}`;
      const { code, metadata } = paintArtifact(fixture, target);
      writeFileSync(join(directory, `${name}.py`), code);
      writeFileSync(
        join(directory, `${name}.json`),
        JSON.stringify(metadata, null, 2) + "\n",
      );
      manifest[target][fixture.check === "name" ? "namespace" : "paint"].push(
        name,
      );
    }
  }
  writeFileSync(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

function paintArtifact(fixture: PaintCase, target: Target) {
  const prepared = preparePaintCase(fixture, target);
  const errors = [...prepared.projectIssues, ...prepared.result.issues].filter(
    (issue) => issue.severity === "error",
  );
  if (errors.length > 0) {
    throw new Error(`${fixture.name}-${target}: ${JSON.stringify(errors)}`);
  }
  const { code } = prepared.result;
  const sceneName = code.match(/^class (\w+)\(Scene\):/m)?.[1];
  const variable =
    fixture.check === "name"
      ? code.match(/^ {8}(\w+) = Circle\(/m)?.[1]
      : "shape";
  if (!sceneName || !variable)
    throw new Error(`${fixture.name}-${target}: missing Python names`);
  const formula = fixture.project.formulas[0]!;
  return {
    code,
    metadata: {
      target,
      check: fixture.check,
      samples: samplePaintCase(fixture, prepared),
      sceneName,
      variable,
      cross: formula.kind === "shape" && formula.shape === "cross",
    },
  };
}
